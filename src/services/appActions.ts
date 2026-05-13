import type { AppDataState, ChatMessage, ConversationThread, Entitlements, FoodAnalysis, SubscriptionTier, UserProfile } from '../domain/models';
import type { FoodPhotoAnalysisResponse, PhotoUploadInput } from './apiClient';

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
  };
  food: {
    analyzePhoto(input: PhotoUploadInput): Promise<FoodPhotoAnalysisResponse>;
    confirmLog(foodLogId: string): Promise<unknown>;
    patchLog(foodLogId: string, payload: Record<string, unknown>): Promise<unknown>;
    discardLog(foodLogId: string): Promise<unknown>;
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
      if (!api) {
        addMessages(getState, setState, [
          { id: `user-${Date.now()}`, role: 'user', text },
          { id: `assistant-${Date.now()}`, role: 'assistant', text: '收到，我会按当前记录继续分析。' },
        ]);
        return;
      }
      const response = await api.chat.sendTextMessage({ threadId, text }) as {
        message?: { id?: string; content_text?: string };
        user_message?: { id?: string; content_text?: string };
        assistant_message?: { id?: string; content_text?: string };
        food_analysis?: FoodPhotoAnalysisResponse['food_analysis'];
      };
      const messages: ChatMessage[] = [
        {
          id: response.user_message?.id ?? `user-${Date.now()}`,
          role: 'user',
          text: response.user_message?.content_text ?? text,
        },
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
        calories: '待填写',
        protein: '待填写',
        carbs: '待填写',
        advice: '请点“编辑份量”写下食物和份量，保存后再确认写入今日记录。',
      };
      setActiveFoodAnalysis(getState, setState, manual, '已打开手动食物记录，请先编辑份量。');
    },

    async createCheckin(input: CheckinInput) {
      if (api) {
        await api.records.createCheckin({
          weight_kg: input.weightKg,
          hunger_level: input.hungerLevel,
          mood_level: input.moodLevel,
          craving_level: input.cravingLevel,
          notes: input.notes,
        });
      }
      const state = getState();
      const title = input.weightKg !== undefined ? '体重打卡' : '心情打卡';
      const text = [
        input.weightKg !== undefined ? `${input.weightKg} kg` : null,
        input.hungerLevel !== undefined ? `饥饿 ${input.hungerLevel}/10` : null,
        input.moodLevel !== undefined ? `心情 ${input.moodLevel}/10` : null,
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
            id: `checkin-${Date.now()}`,
            title,
            status: '已记录',
            text: text || input.notes || '已同步到今日记录',
            done: true,
          },
          ...state.records,
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

    async discardFoodLog(foodLogId: string) {
      if (!isLocalOnlyFoodLog(foodLogId)) {
        await api?.food.discardLog(foodLogId);
      }
      updateFoodLogState(getState, setState, foodLogId, 'discarded', '丢弃成功：这条食物不会计入今日记录。');
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
    title: analysis.title,
    status: foodStatusLabel(status),
    text: [
      `${analysis.calories} kcal`,
      analysis.protein ? `蛋白 ${analysis.protein}` : null,
      portionNote ? `份量备注：${portionNote}` : null,
    ].filter(Boolean).join(' · '),
    done: status === 'confirmed',
  };
  const exists = records.some((record) => record.id === analysis.id);
  return exists
    ? records.map((record) => (record.id === analysis.id ? { ...record, ...nextRecord } : record))
    : [nextRecord, ...records];
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
    advice: analysis.needs_follow_up && analysis.follow_up_question
      ? analysis.follow_up_question
      : '已按图片估算营养区间，请确认份量后记录。',
  };
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
