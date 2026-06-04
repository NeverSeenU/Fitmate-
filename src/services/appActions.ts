import type { AppDataState, ChatMessage, ConversationThread, Entitlements, FileInsight, FoodAnalysis, SubscriptionTier, UserProfile } from '../domain/models';
import type { FileUploadResponse, FoodPhotoBatchAnalysisResponse, FoodPhotoAnalysisResponse, PhotoUploadInput } from './apiClient';
import { calculateEnergyTarget, summarizeFoodIntake } from './energyTargets';
import type { PickedFile } from './filePicker';

type AppActionsOptions = {
  api?: AppActionsApi;
  getState: () => AppDataState;
  setState: (state: AppDataState) => void;
};

type AppActionsApi = {
  profile: {
    patchProfile(payload: Record<string, unknown>): Promise<unknown>;
  };
  chat: {
    createThread(payload: { title: string; kind?: string }): Promise<unknown>;
    sendTextMessage(payload: { threadId: string; text: string; context?: Record<string, unknown> }): Promise<unknown>;
  };
  records: {
    createCheckin(payload: Record<string, unknown>): Promise<unknown>;
    patchCheckin(checkinId: string, payload: Record<string, unknown>): Promise<unknown>;
    deleteCheckin(checkinId: string): Promise<unknown>;
  };
  workouts: {
    analyze(text: string): Promise<unknown>;
    createLog(payload: Record<string, unknown>): Promise<unknown>;
    confirmLog(workoutLogId: string): Promise<unknown>;
    patchLog(workoutLogId: string, payload: Record<string, unknown>): Promise<unknown>;
  };
  food: {
    analyzePhoto(input: PhotoUploadInput): Promise<FoodPhotoAnalysisResponse>;
    analyzePhotos?(input: {
      threadId: string;
      photos: Array<{ imageUri: string; filename: string; mimeType: string; uploadUri?: string; uploadFilename?: string; uploadMimeType?: string }>;
      userNote?: string | null;
    }): Promise<FoodPhotoBatchAnalysisResponse>;
    createLog(payload: Record<string, unknown>): Promise<unknown>;
    confirmLog(foodLogId: string): Promise<unknown>;
    patchLog(foodLogId: string, payload: Record<string, unknown>): Promise<unknown>;
    discardLog(foodLogId: string): Promise<unknown>;
    deleteLog(foodLogId: string): Promise<unknown>;
  };
  files: {
    upload(input: { threadId: string; fileUri: string; filename: string; mimeType: string; userPrompt?: string | null }): Promise<FileUploadResponse>;
  };
  subscription: {
    restore(payload: { provider: string; productId: string; receipt: string }): Promise<{
      entitlements: AppDataState['entitlements'];
    }>;
  };
  privacy: {
    deletePhotos(): Promise<unknown>;
    deleteAccount(): Promise<unknown>;
  };
};

export type CheckinInput = {
  weightKg?: number;
  hungerLevel?: number;
  moodLevel?: number;
  cravingLevel?: number;
  notes?: string;
};

export type FoodLogEditInput = {
  title: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  detail: string;
};

export type ProfileUpdateInput = Partial<Pick<
  UserProfile,
  'displayName' | 'phone' | 'heightCm' | 'weightKg' | 'age' | 'gender' | 'goalLabel' | 'trainingFrequency' | 'dietPreference' | 'healthRiskNote'
>>;

export type AttachFileResult = {
  uploaded: boolean;
  hasInsight: boolean;
};

export function createAppActions({ api, getState, setState }: AppActionsOptions) {
  return {
    async createThread(title: string, kind: string = 'general') {
      if (!api) {
        addThread(getState, setState, { id: `mock-${Date.now()}`, title, subtitle: kind });
        return;
      }
      const created = await api.chat.createThread({ title, kind }) as { id?: string; title?: string; kind?: string };
      addThread(getState, setState, {
        id: created.id ?? `thread-${Date.now()}`,
        title: created.title ?? title,
        subtitle: created.kind ?? kind,
      });
    },

    selectThread(threadId: string) {
      const state = syncCurrentThreadMessages(getState());
      const thread = state.threads.find((item) => item.id === threadId);
      if (!thread) {
        return;
      }
      setState({
        ...state,
        activeThreadId: thread.id,
        chatMessages: thread.messages ?? [],
      });
    },

    async sendText(threadId: string, text: string, displayText = text) {
      if (!text.trim()) {
        return;
      }
      const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: displayText.trim() || text };
      if (!api) {
        addMessages(getState, setState, [
          userMessage,
          { id: `assistant-${Date.now()}`, role: 'assistant', text: '收到，我会按当前记录继续分析。' },
        ]);
        return;
      }
      addMessages(getState, setState, [userMessage]);
      await yieldToUi();
      if (await applyFoodFollowUpAnswer(api, getState, setState, threadId, text, userMessage)) {
        return;
      }
      const backendThreadId = await ensureBackendThread(api, getState, setState, threadId, {
        title: 'FitMate chat',
        kind: 'general',
      }, [userMessage]);
      const response = await api.chat.sendTextMessage({ threadId: backendThreadId, text, context: buildChatContext(getState()) }) as {
        message?: { id?: string; content_text?: string };
        user_message?: { id?: string; content_text?: string };
        assistant_message?: { id?: string; content_text?: string };
        food_analysis?: FoodPhotoAnalysisResponse['food_analysis'];
      };
      const messages: ChatMessage[] = [
        {
          id: response.assistant_message?.id ?? response.message?.id ?? `assistant-${Date.now()}`,
          role: 'assistant',
          text: response.assistant_message?.content_text ?? response.message?.content_text ?? '已记录。',
        },
      ];
      if (response.food_analysis) {
        const mapped = toFoodAnalysis({ food_analysis: response.food_analysis, assistant_message: response.assistant_message });
        const state = getState();
        setState({
          ...state,
          activeFoodAnalysis: mapped,
          records: mapped.status === 'analysis_only' ? state.records : upsertFoodRecord(state.records, mapped, mapped.status),
          chatMessages: [...state.chatMessages, toFoodAnalysisMessage(mapped), ...messages],
        });
        return;
      }
      addMessages(getState, setState, messages);
    },

    async analyzeFoodPhoto(input: PhotoUploadInput) {
      const userPhotoMessage: ChatMessage = {
        id: `user-photo-${Date.now()}`,
        role: 'user',
        text: input.userNote?.trim() || '',
        imageUri: input.imageUri,
      };
      const processingMessage = photoProcessingMessage(1);
      addMessages(getState, setState, [userPhotoMessage, processingMessage]);
      await yieldToUi();
      const analysis = await runWithPhotoProcessing(getState, setState, processingMessage.id, async () => {
        const backendInput = api
          ? {
            ...input,
            threadId: await ensureBackendThread(api, getState, setState, input.threadId, {
              title: 'Food photo',
              kind: 'food',
            }, [userPhotoMessage, processingMessage]),
          }
          : input;
        return api
          ? api.food.analyzePhoto(backendInput)
          : mockFoodPhotoResponse(backendInput.filename);
      });
      const mapped = toFoodAnalysis(analysis, {
        imageUri: input.imageUri,
        filename: input.filename,
        mimeType: input.mimeType,
        userNote: input.userNote ?? undefined,
      });
      const state = getState();
      const existingMessages = state.chatMessages.some((message) => message.id === userPhotoMessage.id)
        ? state.chatMessages
        : [...state.chatMessages, userPhotoMessage];
      const assistantReply = analysis.assistant_message?.content_text?.trim()
        || `${mapped.title} 已完成估算：${mapped.calories} kcal，蛋白 ${mapped.protein}。请确认、编辑份量或丢弃。`;
      const assistantMessages: ChatMessage[] = [
        {
          id: analysis.assistant_message?.id ?? `assistant-photo-${Date.now()}`,
          role: 'assistant',
          text: assistantReply,
        },
      ];
      if (mapped.needsFollowUp && mapped.followUpQuestion) {
        assistantMessages.push({
          id: `assistant-follow-up-${Date.now()}`,
          role: 'assistant',
          text: mapped.followUpQuestion,
        });
      }
      setState({
        ...state,
        activeFoodAnalysis: mapped,
        records: mapped.status === 'analysis_only'
          ? state.records
          : upsertFoodRecord(state.records, mapped, mapped.status),
        chatMessages: [...existingMessages, toFoodAnalysisMessage(mapped), ...assistantMessages],
      });
    },

    async analyzeFoodPhotos(inputs: PhotoUploadInput[]) {
      const photos = inputs.filter((input) => input.imageUri);
      if (!photos.length) {
        return;
      }
      if (photos.length === 1) {
        const [photo] = photos;
        const userPhotoMessage: ChatMessage = {
          id: `user-photo-${Date.now()}`,
          role: 'user',
          text: photo.userNote?.trim() || '',
          imageUri: photo.imageUri,
        };
        const processingMessage = photoProcessingMessage(1);
        addMessages(getState, setState, [userPhotoMessage, processingMessage]);
        await yieldToUi();
        const analysis = await runWithPhotoProcessing(getState, setState, processingMessage.id, async () => {
          const backendInput = api
            ? {
              ...photo,
              threadId: await ensureBackendThread(api, getState, setState, photo.threadId, {
                title: 'Food photo',
                kind: 'food',
              }, [userPhotoMessage, processingMessage]),
            }
            : photo;
          return api
            ? api.food.analyzePhoto(backendInput)
            : mockFoodPhotoResponse(backendInput.filename);
        });
        appendFoodPhotoAnalysis(getState, setState, analysis, {
          imageUri: photo.imageUri,
          filename: photo.filename,
          mimeType: photo.mimeType,
          userNote: photo.userNote ?? undefined,
        }, userPhotoMessage);
        return;
      }
      const firstNote = photos.find((photo) => photo.userNote?.trim())?.userNote?.trim() ?? '';
      const userPhotoMessage: ChatMessage = {
        id: `user-photos-${Date.now()}`,
        role: 'user',
        text: firstNote,
        images: photos.map((photo) => ({
          uri: photo.imageUri,
          filename: photo.filename,
          mimeType: photo.mimeType,
        })),
      };
      const processingMessage = photoProcessingMessage(photos.length);
      addMessages(getState, setState, [userPhotoMessage, processingMessage]);
      await yieldToUi();
      const results = await runWithPhotoProcessing(getState, setState, processingMessage.id, async () => {
        const backendThreadId = api
          ? await ensureBackendThread(api, getState, setState, photos[0].threadId, {
            title: 'Food photo',
            kind: 'food',
          }, [userPhotoMessage, processingMessage])
          : photos[0].threadId;
        return api?.food.analyzePhotos
          ? analyzeFoodPhotoBatch(api, backendThreadId, photos, firstNote)
          : analyzeFoodPhotosIndividually(api, backendThreadId, photos, firstNote);
      });
      appendGroupedFoodPhotoAnalyses(getState, setState, results.map((item, index) => {
        const mapped = toFoodAnalysis(item.response, item.source);
        return {
          response: item.response,
          analysis: item.response.food_analysis.food_log_id ? mapped : {
            ...mapped,
            id: `${mapped.id}-${index + 1}`,
          },
          source: item.source,
        };
      }));
    },

    async createManualFoodLog() {
      const manual: FoodAnalysis = {
        id: `manual-food-${Date.now()}`,
        title: '手动食物记录',
        status: 'pending',
        confidence: 0.5,
        calories: '0',
        protein: '0g',
        carbs: '0g',
        fat: '0g',
        caloriesKcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        detail: '',
        advice: '请点“编辑份量”写下食物和份量，保存后再确认写入今日记录。',
      };
      setActiveFoodAnalysis(getState, setState, manual, '已打开手动食物记录，请先编辑份量。');
    },

    async createCheckin(input: CheckinInput) {
      let backendCheckin: { id?: string } | undefined;
      if (api) {
        backendCheckin = await api.records.createCheckin({
          weight_kg: input.weightKg,
          hunger_level: input.hungerLevel,
          mood_level: input.moodLevel,
          craving_level: input.cravingLevel,
          notes: input.notes,
        }) as { id?: string };
      }
      const state = getState();
      const title = input.weightKg !== undefined ? '体重打卡' : '心情日记';
      const text = [
        input.weightKg !== undefined ? `${input.weightKg} kg` : null,
        input.hungerLevel !== undefined ? `饥饿 ${input.hungerLevel}/10` : null,
        input.moodLevel !== undefined ? `心情 ${input.moodLevel}/10` : null,
        input.cravingLevel !== undefined ? `嘴馋 ${input.cravingLevel}/10` : null,
        input.notes,
      ].filter(Boolean).join(' · ');
      setState({
        ...state,
        dailySummary: {
          ...state.dailySummary,
          weightKg: input.weightKg ?? state.dailySummary.weightKg,
          hungerScore: input.hungerLevel ? `${input.hungerLevel}/10` : state.dailySummary.hungerScore,
        },
        records: [
          {
            id: backendCheckin?.id ?? `checkin-${Date.now()}`,
            kind: input.weightKg !== undefined ? 'weight' : 'mood',
            title,
            status: '已记录',
            text: text || input.notes || '已同步到今日记录',
            recordedAt: new Date().toISOString(),
            done: true,
            weightKg: input.weightKg,
            hungerLevel: input.hungerLevel,
            moodLevel: input.moodLevel,
            cravingLevel: input.cravingLevel,
            detail: input.notes,
          },
          ...state.records,
        ],
      });
    },

    async createWorkoutLog(text: string) {
      const detail = text.trim();
      if (!detail) {
        return;
      }
      const response = api ? await api.workouts.analyze(detail) as {
        assistant_message?: { id?: string; content_text?: string };
        workout_analysis?: {
          workout_log_id?: string | null;
          workout_type?: string;
          duration_minutes?: number;
          intensity?: string;
          calories_burned_range_kcal?: number[];
          confidence?: number | null;
          model_provider?: string | null;
          model_name?: string | null;
          fallback_used?: boolean;
          fallback_source?: string | null;
          fallback_error_code?: string | null;
          analysis_source?: string | null;
          summary?: string | null;
          status?: string;
        };
      } : null;
      const analysis = response?.workout_analysis;
      const record = toWorkoutRecord(analysis, detail);
      const state = getState();
      setState({
        ...state,
        records: [record, ...state.records],
        chatMessages: [
          ...state.chatMessages,
          {
            id: response?.assistant_message?.id ?? `workout-assistant-${Date.now()}`,
            role: 'assistant',
            text: response?.assistant_message?.content_text ?? `已生成运动记录：${record.text}`,
          },
        ],
      });
    },

    async attachFile(file: PickedFile, userPrompt?: string) {
      if (!api) {
        throw new Error('File insight requires the backend API. Current app runtime has no backend API, so no insight card can be generated. Restart Expo and make sure it is not Local preview mode.');
      }
      const state = getState();
      const threadId = await ensureBackendThread(api, getState, setState, state.threads[0]?.id, {
        title: 'File insight',
        kind: 'files',
      });
      const response = await api.files.upload({
        threadId,
        fileUri: file.uri,
        filename: file.name,
        mimeType: file.mimeType,
        userPrompt: userPrompt?.trim() || null,
      });
      const fileInsight = toFileInsight(response);
      addMessages(getState, setState, [
        {
          id: `file-user-${Date.now()}`,
          role: 'user',
          text: userPrompt?.trim()
            ? `${userPrompt.trim()}\n\nAttached file: ${file.name}`
            : `Uploading file: ${file.name}`,
        },
        {
          id: response.assistant_message?.id ?? `file-assistant-${Date.now()}`,
          role: 'assistant',
          text: response.assistant_message?.content_text ?? response.file_upload?.summary_text ?? `Uploaded ${file.name}.`,
          fileInsight,
        },
      ]);
      return { uploaded: true, hasInsight: Boolean(fileInsight) };
    },
    async syncFileInsightMetrics(messageId: string) {
      const state = getState();
      const message = state.chatMessages.find((item) => item.id === messageId);
      const insight = message?.fileInsight;
      const syncPayload = buildFileInsightSyncPayload(insight);
      if (!insight || !syncPayload) {
        addMessages(getState, setState, [
          { id: `file-sync-unavailable-${Date.now()}`, role: 'assistant', text: '这个文件暂时没有可同步的指标。' },
        ]);
        return;
      }
      if (insight.syncStatus === 'synced') {
        addMessages(getState, setState, [
          { id: `file-sync-duplicate-${Date.now()}`, role: 'assistant', text: '这个文件指标已经同步过了。' },
        ]);
        return;
      }
      if (syncPayload.profilePatch) {
        await api?.profile.patchProfile(syncPayload.profilePatch);
      }
      const backendCheckin = syncPayload.checkinPayload
        ? await api?.records.createCheckin(syncPayload.checkinPayload) as { id?: string } | undefined
        : undefined;
      const backendFoodLog = syncPayload.foodPayload
        ? await api?.food.createLog(syncPayload.foodPayload) as { id?: string } | undefined
        : undefined;
      const backendWorkoutLog = syncPayload.workoutPayload
        ? await api?.workouts.createLog(syncPayload.workoutPayload) as { id?: string } | undefined
        : undefined;
      const nextState = getState();
      const syncedRecord = {
        ...syncPayload.record,
        id: backendCheckin?.id ?? backendFoodLog?.id ?? backendWorkoutLog?.id ?? syncPayload.record.id,
      };
      setState({
        ...nextState,
        profile: syncPayload.weightKg === undefined ? nextState.profile : {
          ...nextState.profile,
          weightKg: syncPayload.weightKg,
        },
        dailySummary: {
          ...nextState.dailySummary,
          weightKg: syncPayload.weightKg ?? nextState.dailySummary.weightKg,
        },
        records: [
          syncedRecord,
          ...nextState.records,
        ],
        chatMessages: [
          ...nextState.chatMessages.map((item) => (
            item.id === messageId && item.fileInsight
              ? { ...item, fileInsight: { ...item.fileInsight, syncStatus: 'synced' as const } }
              : item
          )),
          {
            id: `file-sync-${Date.now()}`,
            role: 'assistant',
            text: `已从 ${insight.filename} 同步到记录：${syncPayload.record.title}。`,
          },
        ],
      });
    },

    async confirmFoodLog(foodLogId: string) {
      const active = getState().activeFoodAnalysis;
      if (active?.id === foodLogId && active.needsFollowUp) {
        throw new Error(active.followUpQuestion || '请先补充份量信息，再确认写入记录。');
      }
      if (!isLocalOnlyFoodLog(foodLogId)) {
        await api?.food.confirmLog(foodLogId);
      }
      updateFoodLogState(getState, setState, foodLogId, 'confirmed', '确认成功：这条食物记录已写入今日记录。');
    },

    async editFoodLogPortion(foodLogId: string, portionNote: string) {
      if (!isLocalOnlyFoodLog(foodLogId)) {
        await api?.food.patchLog(foodLogId, { user_portion_note: portionNote });
      }
      updateFoodLogState(
        getState,
        setState,
        foodLogId,
        'edited',
        `编辑成功：份量备注已保存为“${portionNote}”。`,
        portionNote,
      );
    },

    async saveFoodLogDetails(foodLogId: string, input: FoodLogEditInput) {
      if (!isLocalOnlyFoodLog(foodLogId)) {
        await api?.food.patchLog(foodLogId, {
          meal_name: input.title,
          user_portion_note: input.detail,
        });
      }
      updateFoodLogDetails(getState, setState, foodLogId, input);
    },

    async discardFoodLog(foodLogId: string) {
      if (!isLocalOnlyFoodLog(foodLogId)) {
        await api?.food.discardLog(foodLogId);
      }
      updateFoodLogState(getState, setState, foodLogId, 'discarded', '丢弃成功：这条食物不会计入今日记录。');
    },

    async updateRecord(recordId: string, input: Partial<FoodLogEditInput & CheckinInput & { title: string; detail: string }>) {
      const state = getState();
      const record = state.records.find((item) => item.id === recordId);
      if (api && record?.kind === 'food' && !isLocalOnlyFoodLog(recordId)) {
        await api.food.patchLog(recordId, {
          meal_name: input.title,
          calories_range_kcal: input.caloriesKcal !== undefined ? [input.caloriesKcal, input.caloriesKcal] : undefined,
          protein_g_range: input.proteinG !== undefined ? [input.proteinG, input.proteinG] : undefined,
          carbs_g_range: input.carbsG !== undefined ? [input.carbsG, input.carbsG] : undefined,
          fat_g_range: input.fatG !== undefined ? [input.fatG, input.fatG] : undefined,
          user_portion_note: input.detail,
        });
      } else if (api && record && (record.kind === 'weight' || record.kind === 'mood' || record.kind === 'checkin')) {
        await api.records.patchCheckin(recordId, {
          weight_kg: input.weightKg,
          hunger_level: input.hungerLevel,
          mood_level: input.moodLevel,
          craving_level: input.cravingLevel,
          notes: input.detail ?? input.notes,
        });
      }
      setState({
        ...state,
        records: state.records.map((record) => {
          if (record.id !== recordId) {
            return record;
          }
          if (record.kind === 'food') {
            const caloriesKcal = input.caloriesKcal ?? record.caloriesKcal ?? 0;
            const proteinG = input.proteinG ?? record.proteinG ?? 0;
            const carbsG = input.carbsG ?? record.carbsG ?? 0;
            const fatG = input.fatG ?? record.fatG ?? 0;
            const detail = input.detail ?? record.detail ?? '';
            return {
              ...record,
              title: input.title ?? record.title,
              caloriesKcal,
              proteinG,
              carbsG,
              fatG,
              detail,
              text: formatFoodRecordText({ caloriesKcal, proteinG, carbsG, fatG, detail }),
            };
          }
          const weightKg = input.weightKg ?? record.weightKg;
          const moodLevel = input.moodLevel ?? record.moodLevel;
          const hungerLevel = input.hungerLevel ?? record.hungerLevel;
          const cravingLevel = input.cravingLevel ?? record.cravingLevel;
          const detail = input.detail ?? input.notes ?? record.detail ?? '';
          return {
            ...record,
            title: input.title ?? record.title,
            weightKg,
            moodLevel,
            hungerLevel,
            cravingLevel,
            detail,
            text: formatCheckinRecordText({ weightKg, moodLevel, hungerLevel, cravingLevel, notes: detail }),
          };
        }),
      });
    },

    async deleteRecord(recordId: string) {
      const state = getState();
      const record = state.records.find((item) => item.id === recordId);
      if (api && record?.kind === 'food' && !isLocalOnlyFoodLog(recordId)) {
        await api.food.deleteLog(recordId);
      } else if (api && record && (record.kind === 'weight' || record.kind === 'mood' || record.kind === 'checkin')) {
        await api.records.deleteCheckin(recordId);
      }
      setState({
        ...state,
        activeFoodAnalysis: state.activeFoodAnalysis?.id === recordId ? null : state.activeFoodAnalysis,
        records: state.records.filter((record) => record.id !== recordId),
      });
    },

    async restoreSubscription(productId: string, receipt: string) {
      if (!api) {
        const tier = tierFromProductId(productId);
        setEntitlements(getState, setState, entitlementsForTier(tier));
        return;
      }
      const status = await api.subscription.restore({
        provider: 'app_store',
        productId,
        receipt,
      });
      setEntitlements(getState, setState, status.entitlements);
    },

    async updateProfile(input: ProfileUpdateInput) {
      if (api) {
        await api.profile.patchProfile({
          height_cm: input.heightCm,
          current_weight_kg: input.weightKg,
          age: input.age,
          sex: input.gender,
          goal_label: input.goalLabel,
          food_preferences: input.dietPreference ? { summary: input.dietPreference } : undefined,
          training_baseline: input.trainingFrequency ? { summary: input.trainingFrequency } : undefined,
          risk_flags: input.healthRiskNote ? { summary: input.healthRiskNote } : undefined,
        });
      }
      const state = getState();
      const profile = {
        ...state.profile,
        ...input,
      };
      setState({
        ...state,
        profile: {
          ...profile,
          avatarInitial: profile.displayName.slice(0, 1).toUpperCase() || state.profile.avatarInitial,
        },
      });
    },

    async deletePhotos() {
      await api?.privacy.deletePhotos();
      addMessages(getState, setState, [
        { id: `privacy-${Date.now()}`, role: 'assistant', text: '照片删除请求已提交。' },
      ]);
    },

    async deleteAccount() {
      await api?.privacy.deleteAccount();
      addMessages(getState, setState, [
        { id: `privacy-${Date.now()}`, role: 'assistant', text: '账号删除请求已提交。' },
      ]);
    },
  };
}

function setEntitlements(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  entitlements: Entitlements,
) {
  const state = getState();
  setState({
    ...state,
    entitlements,
  });
}

function updateFoodLogState(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  foodLogId: string,
  status: FoodAnalysis['status'],
  message: string,
  portionNote?: string,
) {
  const state = getState();
  const statusLabel = foodStatusLabel(status);
  const active = findFoodAnalysis(state, foodLogId);
  const nextAnalysis = active
    ? { ...active, status, advice: portionNote ? `份量备注：${portionNote}` : active.advice }
    : null;
  const nextActive = status === 'discarded'
    ? null
    : nextAnalysis
      ? nextAnalysis
      : state.activeFoodAnalysis;
  const nextRecords = status === 'discarded'
    ? state.records.filter((record) => record.id !== foodLogId)
    : upsertFoodRecord(
      state.records.map((record) => (record.id === foodLogId
        ? {
          ...record,
          status: statusLabel,
          text: portionNote ? `${record.text} · 份量备注：${portionNote}` : record.text,
          done: status === 'confirmed',
        }
        : record)),
      nextAnalysis,
      status,
      portionNote,
    );
  const nextChatMessages = nextAnalysis
    ? updateFoodAnalysisInMessages(state.chatMessages, nextAnalysis)
    : state.chatMessages;
  setState({
    ...state,
    activeFoodAnalysis: nextActive,
    records: nextRecords,
    chatMessages: [
      ...nextChatMessages,
      { id: `food-${status}-${Date.now()}`, role: 'assistant', text: message },
    ],
  });
}

function updateFoodLogDetails(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  foodLogId: string,
  input: FoodLogEditInput,
) {
  const state = getState();
  const active = findFoodAnalysis(state, foodLogId);
  const nextAnalysis = active
    ? {
      ...active,
      title: input.title,
      status: active.status === 'confirmed' ? 'confirmed' as const : 'edited' as const,
      calories: String(input.caloriesKcal),
      protein: `${input.proteinG}g`,
      carbs: `${input.carbsG}g`,
      fat: `${input.fatG}g`,
      caloriesKcal: input.caloriesKcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      detail: input.detail,
      advice: input.detail || '营养信息已编辑，请确认后写入今日记录。',
      needsFollowUp: false,
      followUpQuestion: undefined,
    }
    : null;
  setState({
    ...state,
    activeFoodAnalysis: nextAnalysis ?? state.activeFoodAnalysis,
    records: upsertFoodRecord(state.records, nextAnalysis, nextAnalysis?.status ?? 'edited'),
    chatMessages: [
      ...(nextAnalysis ? updateFoodAnalysisInMessages(state.chatMessages, nextAnalysis) : state.chatMessages),
      {
        id: `food-edit-${Date.now()}`,
        role: 'assistant',
        text: `已更新 ${input.title}：${input.caloriesKcal} kcal，蛋白 ${input.proteinG}g，碳水 ${input.carbsG}g。`,
      },
    ],
  });
}

async function applyFoodFollowUpAnswer(
  api: AppActionsApi | undefined,
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  threadId: string,
  answer: string,
  userMessage: ChatMessage,
) {
  const state = getState();
  const pendingAnalyses = pendingFoodFollowUps(state);
  if (!pendingAnalyses.length) {
    return false;
  }
  if (!api) {
    const nextState = getState();
    setState({
      ...nextState,
      chatMessages: appendMissingMessages(nextState.chatMessages, [
        userMessage,
      {
        id: `food-follow-up-missing-image-${Date.now()}`,
        role: 'assistant',
        text: '我收到了补充信息，但当前卡片没有保留原图，不能重新让 AI 计算。请重新发送图片，或点“编辑内容”手动修正。',
      },
      ]),
    });
    return true;
  }
  const thinkingState = getState();
  const plural = pendingAnalyses.length > 1;
  setState({
    ...thinkingState,
    chatMessages: appendMissingMessages(thinkingState.chatMessages, [
      userMessage,
    {
      id: `food-follow-up-thinking-${Date.now()}`,
      role: 'assistant',
      text: plural
        ? `收到，我会把这条回复拆给 ${pendingAnalyses.length} 张待补充的食物卡片，分别结合原图重新分析。`
        : '收到，我会结合原图和你的补充重新分析这张食物卡片。',
    },
    ]),
  });
  const backendThreadId = await ensureBackendThread(api, getState, setState, threadId, {
    title: 'Food photo',
    kind: 'food',
  });
  const updatedAnalyses: FoodAnalysis[] = [];
  const assistantMessages: ChatMessage[] = [];
  for (const active of pendingAnalyses) {
    const activeSourceImages = active.sourceImages?.length
      ? active.sourceImages
      : active.sourceImageUri
        ? [{ uri: active.sourceImageUri, filename: active.sourceFilename, mimeType: active.sourceMimeType }]
        : [];
    const validSourceImages = activeSourceImages.filter((image) => image.uri && image.filename && image.mimeType);
    if (!validSourceImages.length) {
      assistantMessages.push({
        id: `food-follow-up-missing-image-${active.id}-${Date.now()}`,
        role: 'assistant',
        text: `${active.title} 收到了补充信息，但当前卡片没有保留原图，不能重新让 AI 计算。请重新发送图片，或点“编辑内容”手动修正。`,
      });
      continue;
    }
    const relevantAnswer = relevantFollowUpAnswer(active, answer, plural);
    if (!relevantAnswer) {
      assistantMessages.push({
        id: `food-follow-up-ambiguous-${active.id}-${Date.now()}`,
        role: 'assistant',
        text: `${active.title} 这张卡我还没法确定你刚才回答的是它。请补一句食物名或点开卡片手动编辑，我再帮你重算。`,
      });
      continue;
    }
    const combinedNote = [
      plural ? `This follow-up answer may contain details for multiple food cards. Extract only the details relevant to this card: ${active.title}.` : null,
      active.sourceUserNote ? `Original user note for this card: ${active.sourceUserNote}` : null,
      active.followUpQuestion ? `Assistant follow-up question for this card: ${active.followUpQuestion}` : null,
      plural ? `Likely relevant user answer for this card: ${relevantAnswer}` : null,
      `Full user follow-up answer for reference: ${answer.trim()}`,
      'Re-analyze the original image using only the relevant follow-up details for this card. Return updated food details and nutrition ranges in Chinese.',
    ].filter(Boolean).join('\n');
    const response = validSourceImages.length > 1 && api.food.analyzePhotos
      ? {
        food_analysis: (await api.food.analyzePhotos({
          threadId: backendThreadId,
          userNote: combinedNote,
          photos: validSourceImages.map((image) => ({
            imageUri: image.uri,
            filename: image.filename ?? 'food-photo.jpg',
            mimeType: image.mimeType ?? 'image/jpeg',
          })),
        })).food_analyses[0],
      }
      : await api.food.analyzePhoto({
        threadId: backendThreadId,
        imageUri: validSourceImages[0].uri,
        filename: validSourceImages[0].filename ?? 'food-photo.jpg',
        mimeType: validSourceImages[0].mimeType ?? 'image/jpeg',
        userNote: combinedNote,
      });
    const mapped = toFoodAnalysis(response, {
      imageUri: validSourceImages[0].uri,
      filename: validSourceImages[0].filename,
      mimeType: validSourceImages[0].mimeType,
      images: validSourceImages,
      sourcePhotoIndexes: active.sourcePhotoIndexes,
      groupId: active.groupId,
      groupMealName: active.groupMealName,
      userNote: combinedNote,
    });
    const nextAnalysis: FoodAnalysis = {
      ...mapped,
      id: active.id,
      status: mapped.status === 'confirmed' ? 'confirmed' : 'edited',
    };
    updatedAnalyses.push(nextAnalysis);
    assistantMessages.push({
      id: `food-follow-up-done-${active.id}-${Date.now()}`,
      role: 'assistant',
      text: `${nextAnalysis.title} 已根据你的补充重新分析。请检查新的食物卡片，确认无误后写入 Records。`,
    });
    if (nextAnalysis.needsFollowUp && nextAnalysis.followUpQuestion) {
      assistantMessages.push({
        id: `food-follow-up-again-${active.id}-${Date.now()}`,
        role: 'assistant',
        text: nextAnalysis.followUpQuestion,
      });
    }
  }
  const nextState = getState();
  const nextActive = updatedAnalyses[updatedAnalyses.length - 1] ?? nextState.activeFoodAnalysis;
  const nextRecords = updatedAnalyses.reduce(
    (records, analysis) => upsertFoodRecord(records, analysis, analysis.status),
    nextState.records,
  );
  const nextMessages = updatedAnalyses.reduce(
    (messages, analysis) => updateFoodAnalysisInMessages(messages, analysis),
    appendMissingMessages(nextState.chatMessages, [userMessage, ...assistantMessages]),
  );
  setState({
    ...nextState,
    activeFoodAnalysis: nextActive,
    records: nextRecords,
    chatMessages: nextMessages,
  });
  return true;
}

function pendingFoodFollowUps(state: AppDataState) {
  const analyses = [
    ...state.chatMessages.map((message) => message.foodAnalysis).filter(Boolean),
    state.activeFoodAnalysis,
  ].filter(Boolean) as FoodAnalysis[];
  const seen = new Set<string>();
  return analyses.filter((analysis) => {
    if (!analysis.needsFollowUp || seen.has(analysis.id)) {
      return false;
    }
    seen.add(analysis.id);
    return true;
  });
}

function relevantFollowUpAnswer(analysis: FoodAnalysis, answer: string, plural: boolean) {
  const cleaned = answer.trim();
  if (!plural || !cleaned) {
    return cleaned || null;
  }
  const segments = splitFollowUpAnswer(cleaned);
  const keywords = foodAnalysisKeywords(analysis);
  const scored = segments
    .map((segment, index) => ({
      segment,
      index,
      score: segmentRelevanceScore(segment, keywords),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (!scored.length) {
    return null;
  }
  const bestScore = scored[0].score;
  return scored
    .filter((item) => item.score >= Math.max(1, bestScore - 1))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.segment)
    .join('；');
}

function splitFollowUpAnswer(answer: string) {
  return answer
    .split(/[;；。.!！?\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function foodAnalysisKeywords(analysis: FoodAnalysis) {
  const source = [
    analysis.title,
    analysis.groupMealName,
    analysis.detail,
    analysis.followUpQuestion,
    ...(analysis.detectedItems ?? []),
  ].filter(Boolean).join(' ');
  const normalized = source.toLowerCase();
  const words = new Set<string>();
  const latinWords = normalized.match(/[a-z0-9]{3,}/g) ?? [];
  latinWords.forEach((word) => words.add(word));
  Array.from(normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)).forEach((match) => {
    const text = match[0];
    words.add(text);
    for (let size = 2; size <= Math.min(4, text.length); size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        words.add(text.slice(index, index + size));
      }
    }
  });
  return Array.from(words).filter((word) => word.length >= 2);
}

function segmentRelevanceScore(segment: string, keywords: string[]) {
  const normalized = segment.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (!keyword || !normalized.includes(keyword)) {
      return score;
    }
    return score + Math.min(4, keyword.length);
  }, 0);
}

function appendMissingMessages(
  messages: ChatMessage[],
  candidates: ChatMessage[],
) {
  const existingIds = new Set(messages.map((message) => message.id));
  const next = [...messages];
  candidates.forEach((candidate) => {
    if (!existingIds.has(candidate.id)) {
      next.push(candidate);
      existingIds.add(candidate.id);
    }
  });
  return next;
}

function removeMessagesById(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  ids: string[],
) {
  replaceMessagesById(getState, setState, ids, []);
}

function replaceMessagesById(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  ids: string[],
  replacements: ChatMessage[],
) {
  const state = getState();
  const removeIds = new Set(ids);
  let inserted = false;
  const chatMessages = state.chatMessages.flatMap((message) => {
    if (!removeIds.has(message.id)) {
      return [message];
    }
    if (inserted) {
      return [];
    }
    inserted = true;
    return replacements;
  });
  const nextMessages = inserted ? chatMessages : appendMissingMessages(chatMessages, replacements);
  setState(syncCurrentThreadMessages({ ...state, chatMessages: nextMessages }, replacements));
}

async function runWithPhotoProcessing<T>(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  processingMessageId: string,
  task: () => Promise<T> | T,
) {
  try {
    const result = await task();
    removeMessagesById(getState, setState, [processingMessageId]);
    return result;
  } catch (error) {
    replaceMessagesById(getState, setState, [processingMessageId], [photoAnalysisErrorMessage()]);
    throw error;
  }
}

function photoProcessingMessage(photoCount: number): ChatMessage {
  return {
    id: `assistant-photo-processing-${Date.now()}`,
    role: 'assistant',
    text: photoCount > 1
      ? `我在看这 ${photoCount} 张照片，会先判断哪些是同一道食物，再生成卡片。`
      : '我在看这张照片，先帮你估出一个可编辑的食物卡片。',
  };
}

function photoAnalysisErrorMessage(): ChatMessage {
  return {
    id: `assistant-photo-error-${Date.now()}`,
    role: 'assistant',
    text: '这次图片分析没跑通。照片和你写的话还在上面，你可以重试，或者先用文字描述这餐。',
  };
}

function appendFoodPhotoAnalysis(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  analysis: FoodPhotoAnalysisResponse,
  source: {
    imageUri?: string;
    filename?: string;
    mimeType?: string;
    images?: Array<{ uri: string; filename?: string; mimeType?: string; index?: number }>;
    sourcePhotoIndexes?: number[];
    groupId?: string;
    groupMealName?: string;
    userNote?: string;
  },
  optimisticMessage?: ChatMessage,
) {
  const mapped = toFoodAnalysis(analysis, source);
  const state = getState();
  const existingMessages = optimisticMessage && !state.chatMessages.some((message) => message.id === optimisticMessage.id)
    ? [...state.chatMessages, optimisticMessage]
    : state.chatMessages;
  const assistantReply = analysis.assistant_message?.content_text?.trim()
    || `${mapped.title} 已完成估算：${mapped.calories} kcal，蛋白 ${mapped.protein}。请确认、编辑份量或丢弃。`;
  const assistantMessages: ChatMessage[] = [
    {
      id: analysis.assistant_message?.id
        ? `${analysis.assistant_message.id}-${Date.now()}`
        : `assistant-photo-${Date.now()}`,
      role: 'assistant',
      text: assistantReply,
    },
  ];
  if (mapped.needsFollowUp && mapped.followUpQuestion) {
    assistantMessages.push({
      id: `assistant-follow-up-${Date.now()}`,
      role: 'assistant',
      text: mapped.followUpQuestion,
    });
  }
  setState({
    ...state,
    activeFoodAnalysis: mapped,
    records: mapped.status === 'analysis_only'
      ? state.records
      : upsertFoodRecord(state.records, mapped, mapped.status),
    chatMessages: [...existingMessages, toFoodAnalysisMessage(mapped), ...assistantMessages],
  });
}

async function analyzeFoodPhotoBatch(
  api: AppActionsApi,
  backendThreadId: string,
  photos: PhotoUploadInput[],
  firstNote: string,
) {
  const response = await api.food.analyzePhotos!({
    threadId: backendThreadId,
    userNote: firstNote,
    photos: photos.map((photo) => ({
      imageUri: photo.imageUri,
      filename: photo.filename,
      mimeType: photo.mimeType,
      uploadUri: photo.uploadUri,
      uploadFilename: photo.uploadFilename,
      uploadMimeType: photo.uploadMimeType,
    })),
  });
  return response.food_analyses.map((analysis, index) => {
    const group = groupForAnalysis(response.groups, index);
    const sourcePhotoIndexes = sourcePhotoIndexesForGroup(group, index, photos.length);
    const sourcePhotos = sourcePhotoIndexes.map((photoIndex) => photos[photoIndex]).filter(Boolean);
    const photo = sourcePhotos[0] ?? photos[index] ?? photos[0];
    return {
      response: {
        food_analysis: analysis,
        assistant_message: response.assistant_messages?.[index],
      },
      source: {
        imageUri: photo.imageUri,
        filename: photo.filename,
        mimeType: photo.mimeType,
        images: sourcePhotos.map((sourcePhoto, photoIndex) => ({
          uri: sourcePhoto.imageUri,
          filename: sourcePhoto.filename,
          mimeType: sourcePhoto.mimeType,
          index: sourcePhotoIndexes[photoIndex],
        })),
        sourcePhotoIndexes,
        groupId: group?.group_id,
        groupMealName: group?.meal_name,
        userNote: buildMultiPhotoUserNote(firstNote, index, photos.length),
      },
    };
  });
}

async function analyzeFoodPhotosIndividually(
  api: AppActionsApi | undefined,
  backendThreadId: string,
  photos: PhotoUploadInput[],
  firstNote: string,
) {
  const results: Array<{
    response: FoodPhotoAnalysisResponse;
    source: {
      imageUri: string;
      filename: string;
      mimeType: string;
      userNote: string;
    };
  }> = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const userNote = buildMultiPhotoUserNote(firstNote, index, photos.length);
    const backendInput = {
      ...photo,
      threadId: backendThreadId,
      userNote,
    };
    const analysis = api
      ? await api.food.analyzePhoto(backendInput)
      : mockFoodPhotoResponse(backendInput.filename);
    results.push({
      response: analysis,
      source: {
        imageUri: photo.imageUri,
        filename: photo.filename,
        mimeType: photo.mimeType,
        userNote,
      },
    });
  }
  return results;
}

function appendGroupedFoodPhotoAnalyses(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  items: Array<{
    response: FoodPhotoAnalysisResponse;
    analysis: FoodAnalysis;
    source: {
      imageUri?: string;
      filename?: string;
      mimeType?: string;
      userNote?: string;
    };
  }>,
) {
  const groups: Array<{
    key: string;
    analysis: FoodAnalysis;
    count: number;
    reply: string;
  }> = [];
  for (const item of items) {
    const key = normalizedFoodGroupKey(item.analysis);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.count += 1;
      existing.analysis = mergeSameFoodAnalysis(existing.analysis, item.analysis);
      continue;
    }
    groups.push({
      key,
      analysis: item.analysis,
      count: 1,
      reply: item.response.assistant_message?.content_text?.trim()
        || `${item.analysis.title} 已完成估算：${item.analysis.calories} kcal，蛋白 ${item.analysis.protein}。请确认、编辑份量或丢弃。`,
    });
  }
  const state = getState();
  const chatMessages = [...state.chatMessages];
  let activeFoodAnalysis = state.activeFoodAnalysis;
  let records = state.records;
  groups.forEach((group) => {
    activeFoodAnalysis = group.analysis;
    records = group.analysis.status === 'analysis_only'
      ? records
      : upsertFoodRecord(records, group.analysis, group.analysis.status);
    chatMessages.push(toFoodAnalysisMessage(group.analysis));
    chatMessages.push({
      id: `assistant-photo-${group.analysis.id}-${Date.now()}`,
      role: 'assistant',
      text: group.count > 1
        ? `我把 ${group.count} 张看起来属于同一食物的照片合并成一张 ${group.analysis.title} 卡片。请确认、编辑份量或丢弃。`
        : group.reply,
    });
    if (group.analysis.needsFollowUp && group.analysis.followUpQuestion) {
      chatMessages.push({
        id: `assistant-follow-up-${group.analysis.id}-${Date.now()}`,
        role: 'assistant',
        text: group.analysis.followUpQuestion,
      });
    }
  });
  setState({
    ...state,
    activeFoodAnalysis,
    records,
    chatMessages,
  });
}

function normalizedFoodGroupKey(analysis: FoodAnalysis) {
  if (analysis.groupId) {
    return `group:${analysis.groupId}`;
  }
  const title = analysis.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  if (title) {
    return title;
  }
  return (analysis.detectedItems ?? []).join('|').toLowerCase();
}

function mergeSameFoodAnalysis(base: FoodAnalysis, next: FoodAnalysis): FoodAnalysis {
  const detectedItems = Array.from(new Set([...(base.detectedItems ?? []), ...(next.detectedItems ?? [])]));
  const sourceImages = mergeSourceImages(base.sourceImages, next.sourceImages);
  const sourcePhotoIndexes = Array.from(new Set([...(base.sourcePhotoIndexes ?? []), ...(next.sourcePhotoIndexes ?? [])])).sort((a, b) => a - b);
  return {
    ...base,
    confidence: Math.max(base.confidence, next.confidence),
    needsFollowUp: Boolean(base.needsFollowUp || next.needsFollowUp),
    followUpQuestion: base.followUpQuestion ?? next.followUpQuestion,
    detectedItems,
    sourceImages: sourceImages.length ? sourceImages : base.sourceImages,
    sourcePhotoIndexes: sourcePhotoIndexes.length ? sourcePhotoIndexes : base.sourcePhotoIndexes,
    sourceImageUri: sourceImages[0]?.uri ?? base.sourceImageUri,
    sourceFilename: sourceImages[0]?.filename ?? base.sourceFilename,
    sourceMimeType: sourceImages[0]?.mimeType ?? base.sourceMimeType,
    detail: detectedItems.length ? detectedItems.join(', ') : base.detail,
  };
}

function groupForAnalysis(
  groups: FoodPhotoBatchAnalysisResponse['groups'] | undefined,
  analysisIndex: number,
) {
  return groups?.find((group) => Array.isArray(group.analysis_indexes) && group.analysis_indexes.includes(analysisIndex));
}

function sourcePhotoIndexesForGroup(
  group: NonNullable<FoodPhotoBatchAnalysisResponse['groups']>[number] | undefined,
  analysisIndex: number,
  photoCount: number,
) {
  const rawIndexes = Array.isArray(group?.source_photo_indexes)
    ? group?.source_photo_indexes
    : Array.isArray(group?.analysis_indexes)
      ? group?.analysis_indexes
      : [analysisIndex];
  const indexes = (rawIndexes ?? [])
    .filter((item): item is number => Number.isInteger(item) && item >= 0 && item < photoCount);
  return Array.from(new Set(indexes.length ? indexes : [Math.min(analysisIndex, Math.max(photoCount - 1, 0))])).sort((a, b) => a - b);
}

function mergeSourceImages(
  base: FoodAnalysis['sourceImages'],
  next: FoodAnalysis['sourceImages'],
) {
  const seen = new Set<string>();
  return [...(base ?? []), ...(next ?? [])].filter((image) => {
    const key = `${image.uri}|${image.filename ?? ''}|${image.index ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildMultiPhotoUserNote(userNote: string, index: number, total: number) {
  const context = [
    `这是用户一次发送的第 ${index + 1}/${total} 张食物照片。`,
    '请先独立识别这张照片里的食物；如果它明显和其他照片是同一道菜或同一餐的一部分，仍然在标题和 detected_items 中说清楚。不要把不同照片的食物混在同一张卡里。',
    userNote ? `用户补充：${userNote}` : null,
  ].filter(Boolean);
  return context.join('\n');
}

function buildChatContext(state: AppDataState) {
  const intake = summarizeFoodIntake(state.records);
  const energy = calculateEnergyTarget({ profile: state.profile, foodCaloriesKcal: intake.caloriesKcal });
  return {
    profile: {
      goalLabel: state.profile.goalLabel,
      trainingFrequency: state.profile.trainingFrequency,
      dietPreference: state.profile.dietPreference,
    },
    dailySummary: {
      ...state.dailySummary,
      foodCaloriesKcal: intake.caloriesKcal,
      foodProteinG: intake.proteinG,
      foodCarbsG: intake.carbsG,
      foodFatG: intake.fatG,
      dailyTargetCalories: energy.dailyTargetCalories,
      caloriesLeft: energy.caloriesLeft,
      calorieProgress: energy.progress,
    },
    records: {
      food: state.records
        .filter((record) => record.kind === 'food' && record.status !== '已丢弃' && record.done)
        .slice(0, 6)
        .map((record) => ({
          id: record.id,
          title: record.title,
          status: record.status,
          done: Boolean(record.done),
          caloriesKcal: record.caloriesKcal,
          proteinG: record.proteinG,
          carbsG: record.carbsG,
          fatG: record.fatG,
          detail: record.detail ?? record.text,
        })),
      pendingFood: state.records
        .filter((record) => record.kind === 'food' && record.status !== '已丢弃' && !record.done)
        .slice(0, 4)
        .map((record) => ({
          id: record.id,
          title: record.title,
          status: record.status,
          done: Boolean(record.done),
          caloriesKcal: record.caloriesKcal,
          proteinG: record.proteinG,
          carbsG: record.carbsG,
          fatG: record.fatG,
          detail: record.detail ?? record.text,
        })),
      workout: state.records
        .filter((record) => record.kind === 'workout')
        .slice(0, 4)
        .map((record) => ({
          id: record.id,
          title: record.title,
          status: record.status,
          detail: record.detail ?? record.text,
        })),
    },
    activeFoodAnalysis: state.activeFoodAnalysis
      ? {
        id: state.activeFoodAnalysis.id,
        title: state.activeFoodAnalysis.title,
        status: state.activeFoodAnalysis.status,
        caloriesKcal: state.activeFoodAnalysis.caloriesKcal,
        proteinG: state.activeFoodAnalysis.proteinG,
        carbsG: state.activeFoodAnalysis.carbsG,
        fatG: state.activeFoodAnalysis.fatG,
        needsFollowUp: state.activeFoodAnalysis.needsFollowUp,
      }
      : null,
  };
}

function toFoodAnalysisMessage(analysis: FoodAnalysis): ChatMessage {
  return {
    id: `food-card-${analysis.id}-${Date.now()}`,
    role: 'assistant',
    text: '',
    foodAnalysis: analysis,
  };
}

function findFoodAnalysis(state: AppDataState, foodLogId: string) {
  if (state.activeFoodAnalysis?.id === foodLogId) {
    return state.activeFoodAnalysis;
  }
  return state.chatMessages.find((message) => message.foodAnalysis?.id === foodLogId)?.foodAnalysis ?? null;
}

function updateFoodAnalysisInMessages(messages: ChatMessage[], analysis: FoodAnalysis) {
  return messages.map((message) => {
    if (message.foodAnalysis?.id !== analysis.id) {
      return message;
    }
    return {
      ...message,
      foodAnalysis: {
        ...message.foodAnalysis,
        ...analysis,
      },
    };
  });
}

function setActiveFoodAnalysis(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  analysis: FoodAnalysis,
  message?: string,
) {
  const state = getState();
  setState({
    ...state,
    activeFoodAnalysis: analysis,
    records: analysis.status === 'analysis_only' ? state.records : upsertFoodRecord(state.records, analysis, analysis.status),
    chatMessages: message
      ? [...state.chatMessages, toFoodAnalysisMessage(analysis), { id: `food-open-${Date.now()}`, role: 'assistant', text: message }]
      : [...state.chatMessages, toFoodAnalysisMessage(analysis)],
  });
}

function upsertFoodRecord(
  records: AppDataState['records'],
  analysis: FoodAnalysis | null,
  status: FoodAnalysis['status'],
  portionNote?: string,
) {
  if (!analysis || status === 'analysis_only' || status === 'discarded') {
    return records;
  }
  const nextRecord = {
    id: analysis.id,
    kind: 'food' as const,
    title: analysis.title,
    recordedAt: records.find((record) => record.id === analysis.id)?.recordedAt ?? new Date().toISOString(),
    status: foodStatusLabel(status),
    text: formatFoodRecordText({
      caloriesKcal: analysis.caloriesKcal,
      proteinG: analysis.proteinG,
      carbsG: analysis.carbsG,
      fatG: analysis.fatG,
      detail: portionNote ?? analysis.detail,
      fallbackCalories: analysis.calories,
      fallbackProtein: analysis.protein,
      fallbackCarbs: analysis.carbs,
    }),
    done: status === 'confirmed',
    caloriesKcal: analysis.caloriesKcal,
    proteinG: analysis.proteinG,
    carbsG: analysis.carbsG,
    fatG: analysis.fatG,
    detail: portionNote ?? analysis.detail,
  };
  const exists = records.some((record) => record.id === analysis.id);
  return exists
    ? records.map((record) => (record.id === analysis.id ? { ...record, ...nextRecord } : record))
    : [nextRecord, ...records];
}

function formatFoodRecordText(input: {
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  detail?: string;
  fallbackCalories?: string;
  fallbackProtein?: string;
  fallbackCarbs?: string;
}) {
  return [
    input.caloriesKcal !== undefined ? `${input.caloriesKcal} kcal` : input.fallbackCalories ? `${input.fallbackCalories} kcal` : null,
    input.proteinG !== undefined ? `蛋白 ${input.proteinG}g` : input.fallbackProtein ? `蛋白 ${input.fallbackProtein}` : null,
    input.carbsG !== undefined ? `碳水 ${input.carbsG}g` : input.fallbackCarbs ? `碳水 ${input.fallbackCarbs}` : null,
    input.fatG !== undefined ? `脂肪 ${input.fatG}g` : null,
    input.detail,
  ].filter(Boolean).join(' · ');
}

function formatCheckinRecordText(input: CheckinInput) {
  return [
    input.weightKg !== undefined ? `${input.weightKg} kg` : null,
    input.hungerLevel !== undefined ? `饥饿 ${input.hungerLevel}/10` : null,
    input.moodLevel !== undefined ? `心情 ${input.moodLevel}/10` : null,
    input.cravingLevel !== undefined ? `嘴馋 ${input.cravingLevel}/10` : null,
    input.notes,
  ].filter(Boolean).join(' · ') || '已同步到今日记录';
}

function toWorkoutRecord(
  analysis: {
    workout_log_id?: string | null;
    workout_type?: string;
    duration_minutes?: number;
    intensity?: string;
    calories_burned_range_kcal?: number[];
    confidence?: number | null;
    model_provider?: string | null;
    model_name?: string | null;
    fallback_used?: boolean;
    fallback_source?: string | null;
    fallback_error_code?: string | null;
    analysis_source?: string | null;
    summary?: string | null;
    status?: string;
  } | undefined,
  fallbackText: string,
) {
  const duration = analysis?.duration_minutes;
  const calories = rangeLabel(analysis?.calories_burned_range_kcal ?? []);
  const status = analysis?.status === 'pending'
    ? '待确认'
    : analysis?.status === 'confirmed'
      ? '已记录'
      : analysis?.status === 'edited'
        ? '已编辑'
        : '已记录';
  const title = workoutTitle(analysis?.workout_type, fallbackText);
  const metadata = [
    analysis?.confidence === undefined || analysis.confidence === null ? null : `confidence ${analysis.confidence.toFixed(2)}`,
    analysis?.model_provider && analysis?.model_name ? `${analysis.model_provider}/${analysis.model_name}` : analysis?.model_name ?? analysis?.model_provider ?? null,
    analysis?.summary,
  ].filter(Boolean).join(' · ');
  return {
    id: analysis?.workout_log_id ?? `workout-${Date.now()}`,
    kind: 'workout' as const,
    title,
    recordedAt: new Date().toISOString(),
    status,
    text: [
      duration !== undefined ? `${duration} 分钟` : fallbackText,
      analysis?.intensity ? `强度 ${workoutIntensityLabel(analysis.intensity)}` : null,
      analysis?.calories_burned_range_kcal?.length ? `消耗 ${calories} kcal` : null,
      metadata || null,
      fallbackText,
    ].filter(Boolean).join(' · '),
    done: analysis?.status !== 'pending',
    fallbackUsed: analysis?.fallback_used,
    fallbackSource: analysis?.fallback_source ?? undefined,
    fallbackErrorCode: analysis?.fallback_error_code ?? undefined,
    analysisSource: analysis?.analysis_source ?? undefined,
    detail: metadata ? `${metadata} · ${fallbackText}` : fallbackText,
  };
}

function workoutTitle(type: string | undefined, fallbackText: string) {
  if (type === 'cardio_plus_strength') return '有氧 + 力量训练';
  if (type === 'running') return '跑步训练';
  if (type === 'strength') return '力量训练';
  if (type === 'mixed') return '综合训练';
  return fallbackText.length > 18 ? `${fallbackText.slice(0, 18)}...` : fallbackText;
}

function workoutIntensityLabel(intensity: string) {
  if (intensity === 'high') return '高';
  if (intensity === 'low') return '低';
  return '中';
}

function isLocalOnlyFoodLog(foodLogId: string) {
  return foodLogId.startsWith('manual-food-') || foodLogId.startsWith('analysis-');
}

function foodStatusLabel(status: FoodAnalysis['status']) {
  if (status === 'confirmed') {
    return '已确认写入';
  }
  if (status === 'edited') {
    return '已编辑待确认';
  }
  if (status === 'discarded') {
    return '已丢弃';
  }
  if (status === 'analysis_only') {
    return '仅分析';
  }
  return '待确认';
}

function toFoodAnalysis(response: FoodPhotoAnalysisResponse, source?: {
  imageUri?: string;
  filename?: string;
  mimeType?: string;
  images?: Array<{ uri: string; filename?: string; mimeType?: string; index?: number }>;
  sourcePhotoIndexes?: number[];
  groupId?: string;
  groupMealName?: string;
  userNote?: string;
}): FoodAnalysis {
  const analysis = response.food_analysis;
  const detectedItems = Array.isArray(analysis.detected_items)
    ? analysis.detected_items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const followUpQuestion = analysis.needs_follow_up && analysis.follow_up_question
    ? analysis.follow_up_question
    : undefined;
  return {
    id: analysis.food_log_id ?? `analysis-${Date.now()}`,
    title: analysis.meal_name,
    status: toFoodStatus(analysis.status),
    confidence: analysis.confidence,
    modelProvider: analysis.model_provider,
    modelName: analysis.model_name,
    fallbackUsed: analysis.fallback_used,
    fallbackSource: analysis.fallback_source ?? undefined,
    fallbackErrorCode: analysis.fallback_error_code ?? undefined,
    analysisSource: analysis.analysis_source ?? undefined,
    providerLatencyMs: typeof analysis.provider_latency_ms === 'number' ? analysis.provider_latency_ms : undefined,
    requestLatencyMs: typeof analysis.request_latency_ms === 'number' ? analysis.request_latency_ms : undefined,
    needsFollowUp: analysis.needs_follow_up,
    followUpQuestion,
    detectedItems,
    sourceImageUri: source?.imageUri,
    sourceFilename: source?.filename,
    sourceMimeType: source?.mimeType,
    sourceImages: source?.images?.length
      ? source.images
      : source?.imageUri
        ? [{ uri: source.imageUri, filename: source.filename, mimeType: source.mimeType }]
        : undefined,
    sourcePhotoIndexes: source?.sourcePhotoIndexes ?? analysis.source_photo_indexes ?? analysis.source_group?.source_photo_indexes ?? undefined,
    groupId: source?.groupId ?? analysis.source_group?.group_id,
    groupMealName: source?.groupMealName ?? analysis.source_group?.meal_name,
    sourceUserNote: source?.userNote,
    calories: rangeLabel(analysis.calories_range_kcal),
    protein: `${rangeLabel(analysis.protein_g_range)}g`,
    carbs: `${rangeLabel(analysis.carbs_g_range)}g`,
    fat: `${rangeLabel(analysis.fat_g_range)}g`,
    caloriesKcal: rangeMidpoint(analysis.calories_range_kcal),
    proteinG: rangeMidpoint(analysis.protein_g_range),
    carbsG: rangeMidpoint(analysis.carbs_g_range),
    fatG: rangeMidpoint(analysis.fat_g_range),
    detail: detectedItems.join(', '),
    advice: foodCardAdvice(analysis),
  };
}

function foodCardAdvice(analysis: FoodPhotoAnalysisResponse['food_analysis']) {
  if (analysis.needs_follow_up && analysis.follow_up_question) {
    return '需要补充份量后再确认写入。';
  }
  return '营养估算已生成，请确认、编辑份量或丢弃。';
}

function toFileInsight(response: FileUploadResponse): FileInsight | undefined {
  const upload = response.file_upload;
  if (!upload.document_type || !upload.insights?.length) {
    return undefined;
  }
  return {
    documentType: upload.document_type,
    filename: upload.filename,
    confidence: upload.confidence,
    modelProvider: upload.model_provider,
    modelName: upload.model_name,
    fallbackUsed: upload.fallback_used,
    fallbackSource: upload.fallback_source ?? undefined,
    fallbackErrorCode: upload.fallback_error_code ?? undefined,
    analysisSource: upload.analysis_source ?? undefined,
    syncStatus: hasSyncableFileInsight(upload.document_type, upload.insights)
      ? 'available'
      : 'unavailable',
    insights: upload.insights.map((item) => ({
      label: item.label,
      value: item.value,
      source: item.source,
      sourceText: item.source_text,
      confidence: item.confidence,
    })),
    recommendations: upload.recommendations ?? [],
  };
}

function hasSyncableFileInsight(documentType: string | undefined, insights: Array<{ label: string; value: string }> | undefined) {
  if (!documentType || !insights?.length) {
    return false;
  }
  const labels = new Set(insights.map((item) => item.label));
  if (documentType === 'body_report') {
    return labels.has('weight_kg') || labels.has('body_fat_percent');
  }
  if (documentType === 'menu') {
    return labels.has('calories_kcal') || labels.has('protein_g');
  }
  if (documentType === 'workout_plan') {
    return labels.has('training_frequency');
  }
  return false;
}

function buildFileInsightSyncPayload(insight: FileInsight | undefined): {
  weightKg?: number;
  profilePatch?: Record<string, unknown>;
  checkinPayload?: Record<string, unknown>;
  foodPayload?: Record<string, unknown>;
  workoutPayload?: Record<string, unknown>;
  record: AppDataState['records'][number];
} | undefined {
  if (!insight) {
    return undefined;
  }
  const sourceText = `来自文件 ${insight.filename}`;
  if (insight.documentType === 'body_report') {
    const weightKg = parseInsightNumber(insight, 'weight_kg');
    const bodyFatPercent = parseInsightNumber(insight, 'body_fat_percent');
    if (weightKg === undefined && bodyFatPercent === undefined) {
      return undefined;
    }
    const text = [
      weightKg !== undefined ? `${weightKg} kg` : null,
      bodyFatPercent !== undefined ? `体脂 ${bodyFatPercent}%` : null,
      sourceText,
    ].filter(Boolean).join(' · ');
    return {
      weightKg,
      profilePatch: weightKg === undefined ? undefined : { current_weight_kg: weightKg },
      checkinPayload: weightKg === undefined ? undefined : {
        weight_kg: weightKg,
        notes: `Synced from file: ${insight.filename}${bodyFatPercent !== undefined ? `; body fat ${bodyFatPercent}%` : ''}`,
      },
      record: {
        id: `file-body-${Date.now()}`,
        kind: 'weight',
        title: '体检指标同步',
        status: '已同步',
        text,
        recordedAt: new Date().toISOString(),
        done: true,
        weightKg,
        bodyFatPercent,
        detail: sourceText,
      },
    };
  }
  if (insight.documentType === 'menu') {
    const caloriesKcal = parseInsightNumber(insight, 'calories_kcal');
    const proteinG = parseInsightNumber(insight, 'protein_g');
    if (caloriesKcal === undefined && proteinG === undefined) {
      return undefined;
    }
    return {
      record: {
        id: `file-menu-${Date.now()}`,
        kind: 'food',
        title: '文件菜单营养',
        status: '已同步',
        text: [
          caloriesKcal !== undefined ? `${caloriesKcal} kcal` : null,
          proteinG !== undefined ? `蛋白 ${proteinG}g` : null,
          sourceText,
        ].filter(Boolean).join(' · '),
        recordedAt: new Date().toISOString(),
        done: true,
        caloriesKcal,
        proteinG,
        detail: sourceText,
      },
      foodPayload: {
        meal_name: 'File menu nutrition',
        calories_range_kcal: rangeOrZero(caloriesKcal),
        protein_g_range: rangeOrZero(proteinG),
        carbs_g_range: [0, 0],
        fat_g_range: [0, 0],
        status: 'confirmed',
        user_portion_note: `Synced from file: ${insight.filename}`,
      },
    };
  }
  if (insight.documentType === 'workout_plan') {
    const frequency = insight.insights.find((item) => item.label === 'training_frequency')?.value;
    if (!frequency) {
      return undefined;
    }
    return {
      record: {
        id: `file-workout-${Date.now()}`,
        kind: 'workout',
        title: '文件训练计划',
        status: '已同步',
        text: `训练频率 ${frequency} · ${sourceText}`,
        recordedAt: new Date().toISOString(),
        done: true,
        detail: `训练频率 ${frequency} · ${sourceText}`,
      },
      workoutPayload: {
        workout_type: 'file_plan',
        duration_minutes: 0,
        intensity: 'medium',
        calories_burned_range_kcal: [0, 0],
        status: 'confirmed',
      },
    };
  }
  return undefined;
}

function rangeOrZero(value: number | undefined) {
  return value === undefined ? [0, 0] : [value, value];
}

function parseInsightNumber(insight: FileInsight | undefined, label: string) {
  const value = insight?.insights.find((item) => item.label === label)?.value;
  if (!value) {
    return undefined;
  }
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rangeMidpoint(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function toFoodStatus(status: string): FoodAnalysis['status'] {
  if (status === 'pending' || status === 'confirmed' || status === 'edited' || status === 'discarded' || status === 'analysis_only') {
    return status;
  }
  return 'confirmed';
}

function rangeLabel(values: number[]) {
  if (values.length >= 2) {
    return `${values[0]}-${values[1]}`;
  }
  return values[0]?.toString() ?? '0';
}

function mockFoodPhotoResponse(filename: string): FoodPhotoAnalysisResponse {
  return {
    food_analysis: {
      food_log_id: `mock-food-${Date.now()}`,
      meal_name: filename.replace(/\.[^.]+$/, '') || '餐食照片',
      calories_range_kcal: [450, 650],
      protein_g_range: [25, 40],
      carbs_g_range: [45, 70],
      fat_g_range: [12, 24],
      confidence: 0.7,
      status: 'pending',
      needs_follow_up: false,
      follow_up_question: null,
      model_provider: 'mock',
      model_name: 'local-preview',
    },
    assistant_message: { id: 'mock-photo-analysis' },
  };
}

function tierFromProductId(productId: string): SubscriptionTier {
  if (productId.includes('elite')) {
    return 'elite';
  }
  if (productId.includes('pro')) {
    return 'pro';
  }
  return 'free';
}

function entitlementsForTier(tier: SubscriptionTier): Entitlements {
  return {
    tier,
    automaticRecording: tier !== 'free',
    memoryRetentionDays: tier === 'free' ? 7 : 'extended',
    preferredVisionProvider: 'xiaomi',
  };
}

function addThread(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  thread: ConversationThread,
) {
  const state = syncCurrentThreadMessages(getState());
  const nextThread = {
    ...thread,
    title: shouldReplaceThreadTitle(thread.title) ? summarizeThreadTitle(thread.messages ?? []) || thread.title : thread.title,
    subtitle: threadSubtitleFromMessages(thread.messages ?? [], thread.subtitle),
    updatedAt: new Date().toISOString(),
    messages: thread.messages ?? [],
  };
  setState({
    ...state,
    activeThreadId: nextThread.id,
    chatMessages: nextThread.messages,
    threads: [nextThread, ...state.threads.filter((item) => item.id !== nextThread.id)],
  });
}

function addMessages(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  messages: ChatMessage[],
) {
  const state = getState();
  const chatMessages = [...state.chatMessages, ...messages];
  setState(syncCurrentThreadMessages({
    ...state,
    chatMessages,
  }, messages));
}

function syncCurrentThreadMessages(state: AppDataState, addedMessages: ChatMessage[] = []) {
  const activeThreadId = state.activeThreadId || state.threads[0]?.id || 'food-today';
  const titleCandidate = summarizeThreadTitle(addedMessages);
  const updatedAt = new Date().toISOString();
  let found = false;
  const threads = state.threads.map((thread) => {
    if (thread.id !== activeThreadId) {
      return thread;
    }
    found = true;
    return {
      ...thread,
      title: (shouldReplaceThreadTitle(thread.title) || (thread.messages?.length ?? 0) === 0) && titleCandidate ? titleCandidate : thread.title,
      subtitle: threadSubtitleFromMessages(state.chatMessages, thread.subtitle),
      updatedAt,
      messages: state.chatMessages,
    };
  });
  if (!found) {
    threads.unshift({
      id: activeThreadId,
      title: titleCandidate || '新对话',
      subtitle: threadSubtitleFromMessages(state.chatMessages, 'general'),
      updatedAt,
      messages: state.chatMessages,
    });
  }
  return {
    ...state,
    activeThreadId,
    threads,
  };
}

function summarizeThreadTitle(messages: ChatMessage[]) {
  const firstUserText = messages.find((message) => message.role === 'user' && message.text.trim())?.text;
  if (!firstUserText) {
    return '';
  }
  return firstUserText
    .replace(/\s+/g, ' ')
    .replace(/^照片[:：]\s*/i, '')
    .replace(/^Uploading file:\s*/i, '')
    .slice(0, 18);
}

function shouldReplaceThreadTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return !normalized || normalized === '新对话' || normalized === 'fitmate chat' || normalized === 'food photo' || normalized === 'file insight';
}

function threadSubtitleFromMessages(messages: ChatMessage[], fallback: string) {
  const latest = [...messages].reverse().find((message) => message.text.trim());
  if (!latest) {
    return fallback;
  }
  const prefix = latest.role === 'user' ? '你' : 'FitMate';
  return `${prefix}: ${latest.text.replace(/\s+/g, ' ').slice(0, 26)}`;
}

async function ensureBackendThread(
  api: AppActionsApi,
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  currentThreadId: string | undefined,
  fallback: { title: string; kind: string },
  preserveMessages: ChatMessage[] = [],
) {
  if (currentThreadId && isBackendThreadId(currentThreadId)) {
    return currentThreadId;
  }
  const created = await api.chat.createThread({ title: fallback.title, kind: fallback.kind }) as { id?: string; title?: string; kind?: string };
  const threadId = created.id ?? `thread-${Date.now()}`;
  const state = getState();
  const messages = appendMissingMessages(state.chatMessages, preserveMessages);
  addThread(getState, setState, {
    id: threadId,
    title: created.title ?? fallback.title,
    subtitle: created.kind ?? fallback.kind,
    messages,
  });
  return threadId;
}

function isBackendThreadId(threadId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(threadId);
}

function formatAttachmentFileSize(sizeBytes?: number) {
  if (!sizeBytes || sizeBytes <= 0) {
    return '大小未知';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
