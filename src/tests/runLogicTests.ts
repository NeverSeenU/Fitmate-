import { createBackendApi, createFitMateServices, type ApiRequestRecord } from '../services/apiClient';
import { createAppActions } from '../services/appActions';
import { loadAppDataFromBackend } from '../services/appBackend';
import { createAiVisionService, type FoodVisionInput, type VisionProvider } from '../services/aiVision';
import { evaluateEntitlement, entitlementsForTier } from '../services/subscription';
import { initialAppState } from '../state/appState';
import type { AppDataState } from '../domain/models';
import { saveFitMateState, loadFitMateState } from '../state/persistence';
import { createMemoryStore } from '../storage/localStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testSubscriptionEntitlements() {
  assert(entitlementsForTier('free').memoryRetentionDays === 7, 'free memory retention must be 7 days');
  assert(!entitlementsForTier('free').automaticRecording, 'free users must not auto-record');
  assert(entitlementsForTier('pro').automaticRecording, 'pro users should auto-record');

  const freeAutoRecord = evaluateEntitlement('autoRecord', {
    tier: 'free',
    imageRequestsToday: 0,
    chatMessagesToday: 0,
  });
  assert(!freeAutoRecord.allowed && freeAutoRecord.reason === 'subscription_required', 'free auto-record must require subscription');

  const fairUse = evaluateEntitlement('image', {
    tier: 'pro',
    imageRequestsToday: 81,
    chatMessagesToday: 0,
  });
  assert(!fairUse.allowed && fairUse.reason === 'fair_use_review', 'paid excessive image usage must enter fair-use review');
}

async function testVisionFallback() {
  const failingProvider: VisionProvider = {
    id: 'xiaomi',
    async estimateFood() {
      throw new Error('provider unavailable');
    },
  };
  const service = createAiVisionService({ primary: failingProvider });
  const input: FoodVisionInput = {
    imageUri: 'mock://bibimbap.jpg',
    locale: 'zh-CN',
  };
  const estimate = await service.estimateFood(input);
  assert(estimate.provider === 'qwen', 'vision service must fallback to Qwen');
  assert(estimate.requiresUserConfirmation, 'food estimates must require user confirmation');
}

async function testPersistenceRoundTrip() {
  const store = createMemoryStore();
  await saveFitMateState(store, initialAppState, null);
  const loaded = await loadFitMateState(store);

  assert(loaded.profile?.weightKg === 72, 'profile weight should round-trip');
  assert(loaded.records?.length === initialAppState.records.length, 'records should round-trip');
  assert(loaded.conversations?.length === initialAppState.threads.length, 'conversations should round-trip');
  assert(loaded.session === null, 'missing session should load as null');
}

async function testApiClientAuthHeadersAndJsonBody() {
  const requests: ApiRequestRecord[] = [];
  const api = createBackendApi({
    baseUrl: 'https://api.example.test',
    getAccessToken: () => 'token-123',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse({
        access_token: 'server-token',
        user: {
          id: 'user-1',
          email: 'jason@example.com',
          display_name: 'Jason',
        },
      });
    },
  });

  const session = await api.auth.login({
    identifier: 'jason@example.com',
    password: 'StrongPass123',
  });

  assert(session.accessToken === 'server-token', 'login must map backend access token');
  assert(requests[0].url === 'https://api.example.test/v1/auth/login', 'login must call backend v1 auth endpoint');
  assert(requests[0].init.method === 'POST', 'login must use POST');
  assert(requests[0].init.headers.Authorization === 'Bearer token-123', 'client must attach bearer token when available');
  assert(requests[0].init.headers['Content-Type'] === 'application/json', 'JSON requests must set content type');
  assert(requests[0].init.body === JSON.stringify({ email: 'jason@example.com', password: 'StrongPass123' }), 'login must map identifier to backend email');
}

async function testApiClientMultipartPhotoUpload() {
  const requests: ApiRequestRecord[] = [];
  const api = createBackendApi({
    baseUrl: 'https://api.example.test/',
    getAccessToken: () => 'photo-token',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse({
        food_analysis: {
          food_log_id: 'food-1',
          meal_name: 'bibimbap',
          calories_range_kcal: [600, 900],
          protein_g_range: [25, 40],
          carbs_g_range: [70, 100],
          fat_g_range: [18, 35],
          confidence: 0.72,
          status: 'pending',
          needs_follow_up: false,
          follow_up_question: null,
          model_provider: 'xiaomi',
          model_name: 'mimo-v2-omni',
        },
        assistant_message: { id: 'msg-1' },
      });
    },
  });

  const result = await api.food.analyzePhoto({
    threadId: 'thread-1',
    imageUri: 'file:///food.jpg',
    filename: 'food.jpg',
    mimeType: 'image/jpeg',
    userNote: 'dinner',
  });

  assert(result.food_analysis.food_log_id === 'food-1', 'photo upload must return backend food analysis');
  assert(requests[0].url === 'https://api.example.test/v1/chat/photo', 'photo upload must call chat photo endpoint');
  assert(requests[0].init.method === 'POST', 'photo upload must use POST');
  assert(requests[0].init.headers.Authorization === 'Bearer photo-token', 'photo upload must attach bearer token');
  assert(!('Content-Type' in requests[0].init.headers), 'multipart requests must not force JSON content type');
  assert(String(requests[0].init.body).includes('thread_id=thread-1'), 'photo upload body must include thread id');
  assert(String(requests[0].init.body).includes('food.jpg'), 'photo upload body must include image file metadata');
}

async function testMockFallbackServicesStayAvailable() {
  const services = createFitMateServices({
    useMockApi: true,
    subscriptionStatus: {
      tier: 'pro',
      active: true,
      entitlements: entitlementsForTier('pro'),
    },
  });

  const session = await services.auth.login({
    identifier: 'mock@example.com',
    password: 'StrongPass123',
  });
  const subscription = await services.subscription.getStatus(session.user.id);

  assert(session.accessToken === 'mock-access-token', 'mock auth service must remain available');
  assert(subscription.tier === 'pro', 'mock subscription service must remain available');
}

async function testBackendServiceFactoryReusesLoginToken() {
  const requests: ApiRequestRecord[] = [];
  const services = createFitMateServices({
    baseUrl: 'https://api.example.test',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/v1/auth/login')) {
        return jsonResponse({
          access_token: 'live-token',
          user: { id: 'user-1', email: 'live@example.com', display_name: 'Live User' },
        });
      }
      return jsonResponse({
        user: { id: 'user-1', email: 'live@example.com', display_name: 'Live User' },
        profile: null,
        subscription: null,
      });
    },
  });

  await services.auth.login({ identifier: 'live@example.com', password: 'StrongPass123' });
  await services.api?.profile.getMe();

  assert(requests[1].init.headers.Authorization === 'Bearer live-token', 'backend service factory must reuse login token');
}

async function testBackendAppDataHydratesUiState() {
  const api = {
    profile: {
      async getMe() {
        return {
          user: {
            id: 'user-1',
            email: 'live@example.com',
            display_name: 'Live User',
          },
          profile: {
            age: 24,
            sex: 'female',
            height_cm: 176,
            current_weight_kg: 70.5,
            goal_label: 'wedding cut',
            food_preferences: { summary: 'spicy, less oil' },
            training_baseline: { summary: '5 days per week' },
            risk_flags: { summary: 'none' },
          },
          subscription: {
            plan: 'elite',
            status: 'active',
            entitlements: {
              automatic_recording: true,
              memory_retention: 'extended',
            },
          },
        };
      },
    },
    subscription: {
      async getStatus() {
        return {
          tier: 'elite' as const,
          active: true,
          entitlements: {
            tier: 'elite' as const,
            automaticRecording: true,
            memoryRetentionDays: 'extended' as const,
            preferredVisionProvider: 'xiaomi' as const,
          },
        };
      },
    },
    chat: {
      async listThreads() {
        return {
          threads: [
            { id: 'thread-1', title: 'Food today', kind: 'food', created_at: '2026-05-09T00:00:00Z' },
          ],
        };
      },
    },
    records: {
      async today() {
        return {
          summary: {
            calorie_range: '1300-1500',
            protein_floor_g: 88,
            current_weight_kg: 70.5,
            hunger_level: 4,
          },
          food_logs: [
            {
              id: 'food-1',
              meal_name: 'Bibimbap',
              status: 'pending',
              calories_range_kcal: [600, 900],
            },
          ],
          workout_logs: [
            {
              id: 'workout-1',
              workout_type: 'strength',
              status: 'confirmed',
              duration_minutes: 80,
            },
          ],
        };
      },
    },
  };

  const state = await loadAppDataFromBackend(api, initialAppState);

  assert(state.profile.displayName === 'Live User', 'backend profile must hydrate display name');
  assert(state.profile.email === 'live@example.com', 'backend profile must hydrate email');
  assert(state.profile.weightKg === 70.5, 'backend profile must hydrate weight');
  assert(state.entitlements.tier === 'elite', 'backend subscription must hydrate entitlements');
  assert(state.threads[0].id === 'thread-1', 'backend threads must hydrate drawer state');
  assert(state.dailySummary.calorieRange === '1300-1500', 'backend records summary must hydrate daily calories');
  assert(state.records[0].title === 'Bibimbap', 'backend food logs must hydrate records');
  assert(state.records[1].done === true, 'confirmed workout logs must hydrate done records');
}

async function testBackendAppDataHydratesLiveRecordsShape() {
  const api = {
    profile: {
      async getMe() {
        return {
          user: { email: 'live@example.com', display_name: 'Live User' },
          profile: null,
        };
      },
    },
    subscription: {
      async getStatus() {
        return {
          tier: 'free' as const,
          active: true,
          entitlements: entitlementsForTier('free'),
        };
      },
    },
    chat: {
      async listThreads() {
        return { threads: [] };
      },
    },
    records: {
      async today() {
        return {
          date: '2026-05-09',
          calories_range_kcal: [0, 0],
          protein_floor_g: 114,
          weight_kg: 71.2,
          hunger_score: 4,
          mood_score: 6,
          craving_score: null,
          food_logs: [],
          workout_logs: [],
          checkins: [],
        };
      },
    },
  };

  const state = await loadAppDataFromBackend(api, initialAppState);

  assert(state.dailySummary.calorieRange === '0-0', 'live records calories must hydrate from top-level range');
  assert(state.dailySummary.proteinFloor === '114g', 'live records protein must hydrate from top-level field');
  assert(state.dailySummary.weightKg === 71.2, 'live records weight must hydrate from top-level field');
  assert(state.dailySummary.hungerScore === '4/10', 'live records hunger must hydrate from top-level field');
}

async function testAppActionsCallBackendMutationsAndUpdateState() {
  const calls: string[] = [];
  const actions = createAppActions({
    api: {
      profile: {
        async patchProfile(payload: Record<string, unknown>) {
          calls.push(`profile:${payload.current_weight_kg}:${payload.goal_label}`);
          return { id: 'profile-live' };
        },
      },
      chat: {
        async createThread(payload: { title: string; kind?: string }) {
          calls.push(`createThread:${payload.title}:${payload.kind}`);
          return { id: 'thread-new', title: payload.title, kind: payload.kind ?? 'general' };
        },
        async sendTextMessage(payload: { threadId: string; text: string }) {
          calls.push(`sendText:${payload.threadId}:${payload.text}`);
          return {
            user_message: { id: 'user-live', content_text: payload.text },
            assistant_message: { id: 'assistant-live', content_text: 'backend reply' },
          };
        },
      },
      records: {
        async createCheckin(payload: Record<string, unknown>) {
          calls.push(`checkin:${payload.weight_kg}:${payload.mood_level}`);
          return { id: 'checkin-live' };
        },
      },
      food: {
        async analyzePhoto(input: {
          threadId: string;
          imageUri: string;
          filename: string;
          mimeType: string;
          userNote?: string | null;
        }) {
          calls.push(`photo:${input.threadId}:${input.filename}:${input.mimeType}`);
          return {
            food_analysis: {
              food_log_id: 'food-live',
              meal_name: 'Chicken bowl',
              calories_range_kcal: [520, 680],
              protein_g_range: [35, 48],
              carbs_g_range: [50, 70],
              fat_g_range: [12, 22],
              confidence: 0.81,
              status: 'pending',
              needs_follow_up: false,
              follow_up_question: null,
              model_provider: 'xiaomi',
              model_name: 'mimo-v2-omni',
            },
            assistant_message: { id: 'assistant-photo' },
          };
        },
        async confirmLog(foodLogId: string) {
          calls.push(`confirmFood:${foodLogId}`);
          return { id: foodLogId, meal_name: 'Chicken bowl', status: 'confirmed' };
        },
        async patchLog(foodLogId: string, payload: Record<string, unknown>) {
          calls.push(`patchFood:${foodLogId}:${payload.user_portion_note}`);
          return { id: foodLogId, meal_name: payload.meal_name ?? 'Chicken bowl', status: 'edited' };
        },
        async discardLog(foodLogId: string) {
          calls.push(`discardFood:${foodLogId}`);
          return { id: foodLogId, meal_name: 'Chicken bowl', status: 'discarded' };
        },
      },
      subscription: {
        async restore(payload: { provider: string; productId: string; receipt: string }) {
          calls.push(`restore:${payload.productId}`);
          return {
            tier: 'pro' as const,
            active: true,
            entitlements: entitlementsForTier('pro'),
          };
        },
      },
      privacy: {
        async deletePhotos() {
          calls.push('deletePhotos');
          return { status: 'scheduled' };
        },
        async deleteAccount() {
          calls.push('deleteAccount');
          return { status: 'scheduled' };
        },
      },
    },
    getState: () => initialAppState,
    setState: (next: AppDataState) => {
      assert(next.threads[0].id === 'thread-new' || next.chatMessages.length > 0, 'actions must update state');
    },
  });

  await actions.createThread('Live food', 'food');
  await actions.sendText('food-today', 'hello');
  await actions.analyzeFoodPhoto({
    threadId: 'food-today',
    imageUri: 'file:///meal.jpg',
    filename: 'meal.jpg',
    mimeType: 'image/jpeg',
    userNote: 'lunch',
  });
  await actions.confirmFoodLog('food-live');
  await actions.editFoodLogPortion('food-live', '米饭吃了一半');
  await actions.discardFoodLog('food-live');
  await actions.createCheckin({ weightKg: 71.2, moodLevel: 6 });
  await actions.restoreSubscription('fitmate.pro.monthly', 'receipt');
  await actions.updateProfile({ weightKg: 70.8, goalLabel: 'Lean wedding cut' });
  await actions.deletePhotos();
  await actions.deleteAccount();

  assert(calls.includes('createThread:Live food:food'), 'createThread action must call backend');
  assert(calls.includes('sendText:food-today:hello'), 'sendText action must call backend');
  assert(calls.includes('photo:food-today:meal.jpg:image/jpeg'), 'photo action must call backend');
  assert(calls.includes('confirmFood:food-live'), 'confirm food action must call backend');
  assert(calls.includes('patchFood:food-live:米饭吃了一半'), 'edit food action must call backend');
  assert(calls.includes('discardFood:food-live'), 'discard food action must call backend');
  assert(calls.includes('checkin:71.2:6'), 'checkin action must map payload');
  assert(calls.includes('restore:fitmate.pro.monthly'), 'restore action must call backend');
  assert(calls.includes('profile:70.8:Lean wedding cut'), 'profile action must map backend payload');
  assert(calls.includes('deletePhotos'), 'deletePhotos action must call backend');
  assert(calls.includes('deleteAccount'), 'deleteAccount action must call backend');
}

async function testFoodActionStateLifecycle() {
  let state: AppDataState = {
    ...initialAppState,
    activeFoodAnalysis: null,
    records: [],
    chatMessages: [],
  };
  const actions = createAppActions({
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  await actions.createManualFoodLog();
  const firstFoodId = state.activeFoodAnalysis?.id;
  assert(Boolean(firstFoodId), 'manual food action must open an editable food card');
  assert(state.records.length === 1 && state.records[0].status === '待确认', 'manual food card must create a pending record');

  await actions.editFoodLogPortion(firstFoodId ?? '', '米饭半碗，鸡胸一掌心');
  assert(state.activeFoodAnalysis?.status === 'edited', 'portion edit must keep food card visible as edited');
  assert(state.records[0].status === '已编辑待确认', 'portion edit must mark record as edited pending confirmation');

  await actions.confirmFoodLog(firstFoodId ?? '');
  assert(state.activeFoodAnalysis?.status === 'confirmed', 'confirm must mark active food card confirmed');
  assert(state.records[0].status === '已确认写入' && state.records[0].done === true, 'confirm must mark record done');

  await actions.createManualFoodLog();
  const secondFoodId = state.activeFoodAnalysis?.id;
  await actions.discardFoodLog(secondFoodId ?? '');
  assert(state.activeFoodAnalysis === null, 'discard must remove active food card');
  assert(!state.records.some((record) => record.id === secondFoodId), 'discard must remove the pending food record');
}

async function run() {
  await testSubscriptionEntitlements();
  await testVisionFallback();
  await testPersistenceRoundTrip();
  await testApiClientAuthHeadersAndJsonBody();
  await testApiClientMultipartPhotoUpload();
  await testMockFallbackServicesStayAvailable();
  await testBackendServiceFactoryReusesLoginToken();
  await testBackendAppDataHydratesUiState();
  await testBackendAppDataHydratesLiveRecordsShape();
  await testAppActionsCallBackendMutationsAndUpdateState();
  await testFoodActionStateLifecycle();
}

void run();

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}
