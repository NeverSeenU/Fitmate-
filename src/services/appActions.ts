import type { AppDataState, ChatMessage, ConversationThread, Entitlements, FileInsight, FoodAnalysis, SubscriptionTier, UserProfile } from '../domain/models';
import type { FileUploadResponse, FoodPhotoAnalysisResponse, PhotoUploadInput } from './apiClient';
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
    sendTextMessage(payload: { threadId: string; text: string }): Promise<unknown>;
  };
  records: {
    createCheckin(payload: Record<string, unknown>): Promise<unknown>;
    patchCheckin(checkinId: string, payload: Record<string, unknown>): Promise<unknown>;
    deleteCheckin(checkinId: string): Promise<unknown>;
  };
  workouts: {
    analyze(text: string): Promise<unknown>;
    confirmLog(workoutLogId: string): Promise<unknown>;
    patchLog(workoutLogId: string, payload: Record<string, unknown>): Promise<unknown>;
  };
  food: {
    analyzePhoto(input: PhotoUploadInput): Promise<FoodPhotoAnalysisResponse>;
    confirmLog(foodLogId: string): Promise<unknown>;
    patchLog(foodLogId: string, payload: Record<string, unknown>): Promise<unknown>;
    discardLog(foodLogId: string): Promise<unknown>;
    deleteLog(foodLogId: string): Promise<unknown>;
  };
  files: {
    upload(input: { threadId: string; fileUri: string; filename: string; mimeType: string }): Promise<FileUploadResponse>;
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

    async sendText(threadId: string, text: string) {
      if (!text.trim()) {
        return;
      }
      const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
      if (!api) {
        addMessages(getState, setState, [
          userMessage,
          { id: `assistant-${Date.now()}`, role: 'assistant', text: '收到，我会按当前记录继续分析。' },
        ]);
        return;
      }
      addMessages(getState, setState, [userMessage]);
      const response = await api.chat.sendTextMessage({ threadId, text }) as {
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
        const mapped = toFoodAnalysis({ food_analysis: response.food_analysis, assistant_message: response.assistant_message ?? null });
        const state = getState();
        setState({
          ...state,
          activeFoodAnalysis: mapped,
          records: mapped.status === 'analysis_only' ? state.records : upsertFoodRecord(state.records, mapped, mapped.status),
          chatMessages: [...state.chatMessages, ...messages],
        });
        return;
      }
      addMessages(getState, setState, messages);
    },

    async analyzeFoodPhoto(input: PhotoUploadInput) {
      const analysis = api
        ? await api.food.analyzePhoto(input)
        : mockFoodPhotoResponse(input.filename);
      const mapped = toFoodAnalysis(analysis);
      const state = getState();
      setState({
        ...state,
        activeFoodAnalysis: mapped,
        records: mapped.status === 'analysis_only'
          ? state.records
          : upsertFoodRecord(state.records, mapped, mapped.status),
        chatMessages: [
          ...state.chatMessages,
          {
            id: `assistant-photo-${Date.now()}`,
            role: 'assistant',
            text: `${mapped.title} 已完成估算：${mapped.calories} kcal，蛋白 ${mapped.protein}。请确认、编辑份量或丢弃。`,
          },
        ],
      });
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

    async attachFile(file: PickedFile) {
      if (api) {
        const response = await api.files.upload({
          threadId: getState().threads[0]?.id ?? 'food-today',
          fileUri: file.uri,
          filename: file.name,
          mimeType: file.mimeType,
        });
        addMessages(getState, setState, [
          {
            id: `file-user-${Date.now()}`,
            role: 'user',
            text: `上传文件：${file.name}`,
          },
          {
            id: response.assistant_message?.id ?? `file-assistant-${Date.now()}`,
            role: 'assistant',
            text: response.assistant_message?.content_text ?? response.file_upload?.summary_text ?? `已上传 ${file.name}。`,
            fileInsight: toFileInsight(response),
          },
        ]);
        return;
      }
      addMessages(getState, setState, [
        {
          id: `file-user-${Date.now()}`,
          role: 'user',
          text: `选择了文件：${file.name}`,
        },
        {
          id: `file-assistant-${Date.now()}`,
          role: 'assistant',
          text: `已读取文件信息：${file.name} · ${file.mimeType} · ${formatAttachmentFileSize(file.sizeBytes)}。当前版本只记录文件信息，暂不上传或解析文件内容。`,
        },
      ]);
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
      const nextState = getState();
      const syncedRecord = {
        ...syncPayload.record,
        id: backendCheckin?.id ?? syncPayload.record.id,
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
  const active = state.activeFoodAnalysis?.id === foodLogId ? state.activeFoodAnalysis : null;
  const nextActive = status === 'discarded'
    ? null
    : active
      ? { ...active, status, advice: portionNote ? `份量备注：${portionNote}` : active.advice }
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
      active,
      status,
      portionNote,
    );
  setState({
    ...state,
    activeFoodAnalysis: nextActive,
    records: nextRecords,
    chatMessages: [
      ...state.chatMessages,
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
  const active = state.activeFoodAnalysis?.id === foodLogId ? state.activeFoodAnalysis : null;
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
    }
    : null;
  setState({
    ...state,
    activeFoodAnalysis: nextAnalysis ?? state.activeFoodAnalysis,
    records: upsertFoodRecord(state.records, nextAnalysis, nextAnalysis?.status ?? 'edited'),
    chatMessages: [
      ...state.chatMessages,
      {
        id: `food-edit-${Date.now()}`,
        role: 'assistant',
        text: `已更新 ${input.title}：${input.caloriesKcal} kcal，蛋白 ${input.proteinG}g，碳水 ${input.carbsG}g。`,
      },
    ],
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
      ? [...state.chatMessages, { id: `food-open-${Date.now()}`, role: 'assistant', text: message }]
      : state.chatMessages,
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
  return {
    id: analysis?.workout_log_id ?? `workout-${Date.now()}`,
    kind: 'workout' as const,
    title,
    status,
    text: [
      duration !== undefined ? `${duration} 分钟` : fallbackText,
      analysis?.intensity ? `强度 ${workoutIntensityLabel(analysis.intensity)}` : null,
      analysis?.calories_burned_range_kcal?.length ? `消耗 ${calories} kcal` : null,
      fallbackText,
    ].filter(Boolean).join(' · '),
    done: analysis?.status !== 'pending',
    detail: fallbackText,
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

function toFoodAnalysis(response: FoodPhotoAnalysisResponse): FoodAnalysis {
  const analysis = response.food_analysis;
  return {
    id: analysis.food_log_id ?? `analysis-${Date.now()}`,
    title: analysis.meal_name,
    status: toFoodStatus(analysis.status),
    confidence: analysis.confidence,
    calories: rangeLabel(analysis.calories_range_kcal),
    protein: `${rangeLabel(analysis.protein_g_range)}g`,
    carbs: `${rangeLabel(analysis.carbs_g_range)}g`,
    fat: `${rangeLabel(analysis.fat_g_range)}g`,
    caloriesKcal: rangeMidpoint(analysis.calories_range_kcal),
    proteinG: rangeMidpoint(analysis.protein_g_range),
    carbsG: rangeMidpoint(analysis.carbs_g_range),
    fatG: rangeMidpoint(analysis.fat_g_range),
    detail: analysis.needs_follow_up && analysis.follow_up_question ? analysis.follow_up_question : '',
    advice: analysis.needs_follow_up && analysis.follow_up_question
      ? analysis.follow_up_question
      : '已按图片估算营养区间，请确认份量后记录。',
  };
}

function toFileInsight(response: FileUploadResponse): FileInsight | undefined {
  const upload = response.file_upload;
  if (!upload.document_type || !upload.insights?.length) {
    return undefined;
  }
  return {
    documentType: upload.document_type,
    filename: upload.filename,
    syncStatus: hasSyncableFileInsight(upload.document_type, upload.insights)
      ? 'available'
      : 'unavailable',
    insights: upload.insights.map((item) => ({
      label: item.label,
      value: item.value,
      source: item.source,
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
        done: true,
        caloriesKcal,
        proteinG,
        detail: sourceText,
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
        done: true,
        detail: `训练频率 ${frequency} · ${sourceText}`,
      },
    };
  }
  return undefined;
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
  const state = getState();
  setState({
    ...state,
    threads: [thread, ...state.threads],
  });
}

function addMessages(
  getState: () => AppDataState,
  setState: (state: AppDataState) => void,
  messages: ChatMessage[],
) {
  const state = getState();
  setState({
    ...state,
    chatMessages: [...state.chatMessages, ...messages],
  });
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
