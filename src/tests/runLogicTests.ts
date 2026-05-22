import { createBackendApi, createFitMateServices, type ApiRequestRecord } from '../services/apiClient';
import { createAppActions } from '../services/appActions';
import { loadAppDataFromBackend } from '../services/appBackend';
import { createRuntimeConfig } from '../config/env';
import { createAiVisionService, type FoodVisionInput, type VisionProvider } from '../services/aiVision';
import { normalizeFileMimeType, normalizeImageMimeType } from '../services/mimeTypes';
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

async function testPickerMimeNormalizationPreservesExplicitHeic() {
  assert(normalizeImageMimeType('image/heic', 'food-photo.jpg') === 'image/heic', 'photo picker must not disguise explicit HEIC as JPEG');
  assert(normalizeImageMimeType(undefined, 'meal.jpeg') === 'image/jpeg', 'photo picker may infer JPEG when MIME is missing');
  assert(normalizeImageMimeType('image/jpg', 'meal') === 'image/jpeg', 'photo picker must normalize image/jpg');
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  assert(normalizeFileMimeType('application/octet-stream', 'menu.png', supportedTypes) === 'image/png', 'file picker must normalize octet-stream by supported extension');
  assert(normalizeFileMimeType('image/jpg', 'food', supportedTypes) === 'image/jpeg', 'file picker must normalize image/jpg');
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

async function testApiClientHandlesEmptyDeleteResponses() {
  const api = createBackendApi({
    baseUrl: 'https://api.example.test',
    getAccessToken: () => 'token-123',
    fetchImpl: async () => emptyResponse(204),
  });

  const result = await api.food.deleteLog('food-1');

  assert(JSON.stringify(result) === '{}', 'delete calls must tolerate 204 empty responses');
}

async function testApiClientDoesNotMaskErrorDetailsWithAlreadyRead() {
  const api = createBackendApi({
    baseUrl: 'https://api.example.test',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        throw new Error('invalid json');
      },
      async text() {
        return 'thread_not_found';
      },
    }),
  });

  let message = '';
  try {
    await api.files.upload({
      threadId: 'food-today',
      fileUri: 'file:///report.txt',
      filename: 'report.txt',
      mimeType: 'text/plain',
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert(message === 'thread_not_found', 'API errors must preserve backend text instead of masking with Already read');
}

async function testBackendServiceClearsInvalidToken() {
  const requests: ApiRequestRecord[] = [];
  let invalidated = 0;
  const services = createFitMateServices({
    baseUrl: 'https://api.example.test',
    onAuthInvalid: () => {
      invalidated += 1;
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/v1/auth/login')) {
        return jsonResponse({
          access_token: 'stale-token',
          user: {
            id: 'user-1',
            email: 'jason@example.com',
            display_name: 'Jason',
          },
        });
      }
      if (url.endsWith('/v1/chat/messages')) {
        return jsonResponse({ detail: 'invalid_token' }, 401);
      }
      return jsonResponse({ id: 'thread-1', title: 'FitMate', kind: 'general' });
    },
  });

  await services.auth.login({ identifier: 'jason@example.com', password: 'StrongPass123' });
  let message = '';
  try {
    await services.api?.chat.sendTextMessage({ threadId: 'thread-1', text: 'hello' });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  await services.api?.chat.createThread({ title: 'FitMate' });

  assert(invalidated === 1, 'invalid token responses must notify the app once');
  assert(message === '登录已过期，请重新登录。', 'invalid token must show a re-login message');
  assert(requests[1].init.headers.Authorization === 'Bearer stale-token', 'first authenticated call must use the login token');
  assert(!requests[2].init.headers.Authorization, 'invalid token must be cleared before the next authenticated call');
}

async function testApiClientMapsUnsupportedHeicPhotoErrors() {
  const api = createBackendApi({
    baseUrl: 'https://api.example.test',
    fetchImpl: async () => jsonResponse({
      detail: {
        code: 'unsupported_heic_image',
        message: 'HEIC/HEIF photos are not supported yet.',
      },
    }, 415),
  });

  let message = '';
  try {
    await api.food.analyzePhoto({
      threadId: 'thread-1',
      imageUri: 'file:///photo.heic',
      filename: 'photo.heic',
      mimeType: 'image/heic',
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert(message.includes('HEIC/HEIF'), 'HEIC upload errors must show a readable format message');
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
            detected_items: ['rice', 'egg', 'vegetables'],
            calories_range_kcal: [600, 900],
            protein_g_range: [25, 40],
            carbs_g_range: [70, 100],
            fat_g_range: [18, 35],
            confidence: 0.72,
            status: 'pending',
            needs_follow_up: false,
            follow_up_question: null,
            fat_loss_advice: 'Keep sauce light.',
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
  assert(String(requests[0].init.body).includes('user_note=dinner'), 'photo upload body must include the user question as image context');
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

async function testRuntimeConfigUsesBackendWhenApiBaseUrlIsProvided() {
  const config = createRuntimeConfig({
    EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.71:8000',
  });

  assert(config.apiBaseUrl === 'http://192.168.1.71:8000', 'runtime config must preserve Expo LAN backend URL');
  assert(!config.useMockApi, 'runtime config must use backend when a real API base URL is provided');
}

async function testRuntimeConfigDefaultsToBackendForExpoGoDevelopment() {
  const config = createRuntimeConfig(undefined);

  assert(config.apiBaseUrl === 'http://192.168.1.71:8000', 'Expo Go development must default to the LAN backend URL');
  assert(!config.useMockApi, 'Expo Go development must not silently fall back to local preview mode');
}

async function testRuntimeConfigAllowsExplicitLocalPreviewMode() {
  const config = createRuntimeConfig({
    EXPO_PUBLIC_USE_MOCK_API: 'true',
  });

  assert(config.useMockApi, 'runtime config must still allow explicit local preview mode');
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
  const snapshots: AppDataState[] = [];
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
          return { id: '11111111-1111-4111-8111-111111111111', title: payload.title, kind: payload.kind ?? 'general' };
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
        async patchCheckin(checkinId: string, payload: Record<string, unknown>) {
          calls.push(`patchCheckin:${checkinId}:${payload.notes}`);
          return { id: checkinId };
        },
        async deleteCheckin(checkinId: string) {
          calls.push(`deleteCheckin:${checkinId}`);
          return {};
        },
      },
      workouts: {
        async analyze(text: string) {
          calls.push(`workout:${text}`);
          return {
            assistant_message: { id: 'assistant-workout', content_text: 'workout reply' },
            workout_analysis: {
              workout_log_id: 'workout-live',
              workout_type: 'strength',
              duration_minutes: 45,
              intensity: 'medium',
              calories_burned_range_kcal: [180, 270],
              confidence: 0.78,
              model_provider: 'xiaomi',
              model_name: 'mimo-v2-omni',
              summary: 'Strength training session.',
              status: 'pending',
            },
          };
        },
        async createLog(payload: Record<string, unknown>) {
          calls.push(`createWorkout:${payload.workout_type}`);
          return { id: 'workout-created' };
        },
        async confirmLog(workoutLogId: string) {
          calls.push(`confirmWorkout:${workoutLogId}`);
          return { id: workoutLogId, status: 'confirmed' };
        },
        async patchLog(workoutLogId: string, payload: Record<string, unknown>) {
          calls.push(`patchWorkout:${workoutLogId}:${payload.duration_minutes}`);
          return { id: workoutLogId, status: 'edited' };
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
        async createLog(payload: Record<string, unknown>) {
          calls.push(`createFood:${payload.meal_name}`);
          return { id: 'food-created' };
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
        async deleteLog(foodLogId: string) {
          calls.push(`deleteFood:${foodLogId}`);
          return {};
        },
      },
      files: {
        async upload(input: { threadId: string; fileUri: string; filename: string; mimeType: string; userPrompt?: string | null }) {
          calls.push(`file:${input.threadId}:${input.filename}:${input.mimeType}:${input.userPrompt ?? ''}`);
          return {
            assistant_message: { id: 'assistant-file', content_text: 'file summary reply' },
            file_upload: {
              id: 'file-live',
              filename: input.filename,
              content_type: input.mimeType,
              size_bytes: 128,
              status: 'parsed',
              summary_text: 'file summary fallback',
              document_type: 'body_report',
              insights: [{ label: 'weight_kg', value: '70 kg', source: 'file_text' }],
              recommendations: ['Sync the weight value to the profile or check-in record before comparing trends.'],
              insight_schema_version: 1,
            },
          };
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
      assert(next.threads[0].id === '11111111-1111-4111-8111-111111111111' || next.chatMessages.length > 0, 'actions must update state');
      snapshots.push(next);
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
  assert(snapshots.some((snapshot) => snapshot.activeFoodAnalysis?.modelProvider === 'xiaomi' && snapshot.activeFoodAnalysis.modelName === 'mimo-v2-omni'), 'food card must preserve AI provider metadata');
  await actions.confirmFoodLog('food-live');
  await actions.editFoodLogPortion('food-live', '米饭吃了一半');
  await actions.discardFoodLog('food-live');
  await actions.createCheckin({ weightKg: 71.2, moodLevel: 6 });
  await actions.createWorkoutLog('力量训练 45 分钟');
  await actions.attachFile({
    uri: 'file:///report.txt',
    name: 'report.txt',
    mimeType: 'text/plain',
    sizeBytes: 128,
  }, 'Summarize this report');
  await actions.restoreSubscription('fitmate.pro.monthly', 'receipt');
  await actions.updateProfile({ weightKg: 70.8, goalLabel: 'Lean wedding cut' });
  await actions.deletePhotos();
  await actions.deleteAccount();

  assert(calls.includes('createThread:Live food:food'), 'createThread action must call backend');
  assert(calls.includes('sendText:11111111-1111-4111-8111-111111111111:hello'), 'sendText action must use a backend-created thread when current thread is local fallback');
  assert(calls.includes('photo:11111111-1111-4111-8111-111111111111:meal.jpg:image/jpeg'), 'photo action must use a backend-created thread when current thread is local fallback');
  assert(calls.includes('confirmFood:food-live'), 'confirm food action must call backend');
  assert(calls.includes('patchFood:food-live:米饭吃了一半'), 'edit food action must call backend');
  assert(calls.includes('discardFood:food-live'), 'discard food action must call backend');
  assert(calls.includes('checkin:71.2:6'), 'checkin action must map payload');
  assert(calls.includes('workout:力量训练 45 分钟'), 'workout action must call backend');
  assert(snapshots.some((snapshot) => snapshot.records.some((record) => record.kind === 'workout' && record.detail?.includes('xiaomi/mimo-v2-omni') && record.detail.includes('confidence 0.78'))), 'workout record must preserve AI provider metadata');
  assert(calls.includes('createThread:File insight:files'), 'file upload must create a backend file thread when only a local fallback thread exists');
  assert(calls.includes('file:11111111-1111-4111-8111-111111111111:report.txt:text/plain:Summarize this report'), 'file upload action must use the backend-created thread id and user prompt');
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

  await actions.saveFoodLogDetails(firstFoodId ?? '', {
    title: 'Chicken rice bowl',
    caloriesKcal: 620,
    proteinG: 42,
    carbsG: 68,
    fatG: 18,
    detail: '米饭半碗，鸡胸一掌心，酱少放',
  });
  assert(state.activeFoodAnalysis?.title === 'Chicken rice bowl', 'food detail edit must update active card title');
  assert(state.records[0].caloriesKcal === 620 && state.records[0].proteinG === 42, 'food detail edit must store editable nutrition');
  assert(state.records[0].text.includes('碳水 68g'), 'food detail edit must render nutrition in record text');

  await actions.confirmFoodLog(firstFoodId ?? '');
  assert(state.activeFoodAnalysis?.status === 'confirmed', 'confirm must mark active food card confirmed');
  assert(state.records[0].status === '已确认写入' && state.records[0].done === true, 'confirm must mark record done');

  await actions.updateRecord(firstFoodId ?? '', {
    title: 'Edited chicken bowl',
    caloriesKcal: 580,
    proteinG: 45,
    carbsG: 55,
    fatG: 16,
    detail: '用户在记录页修正后的内容',
  });
  assert(state.records[0].title === 'Edited chicken bowl', 'record edit must update food title');
  assert(state.records[0].caloriesKcal === 580 && state.records[0].carbsG === 55, 'record edit must update nutrition after confirmation');

  await actions.createManualFoodLog();
  const secondFoodId = state.activeFoodAnalysis?.id;
  await actions.discardFoodLog(secondFoodId ?? '');
  assert(state.activeFoodAnalysis === null, 'discard must remove active food card');
  assert(!state.records.some((record) => record.id === secondFoodId), 'discard must remove the pending food record');

  await actions.deleteRecord(firstFoodId ?? '');
  assert(!state.records.some((record) => record.id === firstFoodId), 'delete record must remove confirmed food record');

  await actions.createWorkoutLog('力量训练 45 分钟，卧推和深蹲');
  assert(state.records[0].kind === 'workout', 'workout action must create a records-page workout card');
  assert(state.records[0].text.includes('力量训练 45 分钟'), 'workout card must preserve user-entered workout detail');
  assert(state.chatMessages.some((message) => message.text.includes('已生成运动记录')), 'workout action must give visible chat feedback');
  let fileError = '';
  try {
    await actions.attachFile({
      uri: 'file:///body-check.pdf',
      name: 'body-check.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });
  } catch (error) {
    fileError = error instanceof Error ? error.message : String(error);
  }
  assert(fileError.includes('backend API'), 'file insight must fail loudly when backend API is not connected');
}

async function testAnalysisOnlyFoodCardCanBeManaged() {
  let state: AppDataState = {
    ...initialAppState,
    activeFoodAnalysis: {
      id: 'analysis-qwen-photo',
      title: 'Qwen photo meal',
      status: 'analysis_only',
      confidence: 0.86,
      modelProvider: 'qwen',
      modelName: 'qwen3-vl-plus',
      calories: '500-620',
      protein: '28-36g',
      carbs: '52-64g',
      fat: '14-20g',
      caloriesKcal: 560,
      proteinG: 32,
      carbsG: 58,
      fatG: 17,
      detail: 'AI image analysis only',
      advice: 'Confirm before writing to records.',
    },
    records: [],
    chatMessages: [],
  };
  const actions = createAppActions({
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  assert(state.records.length === 0, 'analysis-only food card must not auto-create a record');
  await actions.confirmFoodLog('analysis-qwen-photo');
  assert(state.activeFoodAnalysis?.status === 'confirmed', 'analysis-only food card must be confirmable');
  assert(state.records.length === 1 && state.records[0].id === 'analysis-qwen-photo', 'confirming analysis-only food must write a record');
  assert(state.records[0].done === true && state.records[0].caloriesKcal === 560, 'confirmed analysis-only record must preserve nutrition values');

  state = {
    ...state,
    activeFoodAnalysis: {
      id: 'analysis-qwen-edit',
      title: 'Qwen editable meal',
      status: 'analysis_only',
      confidence: 0.76,
      calories: '300-420',
      protein: '18-24g',
      carbs: '34-42g',
      detail: 'Before edit',
      advice: 'Editable analysis.',
    },
    records: [],
  };
  await actions.saveFoodLogDetails('analysis-qwen-edit', {
    title: 'Edited Qwen meal',
    caloriesKcal: 410,
    proteinG: 26,
    carbsG: 44,
    fatG: 12,
    detail: 'User corrected the AI estimate',
  });
  assert(state.activeFoodAnalysis?.status === 'edited', 'editing analysis-only food must move it to editable pending state');
  assert(state.records.length === 1 && state.records[0].title === 'Edited Qwen meal', 'editing analysis-only food must create an editable record draft');

  await actions.discardFoodLog('analysis-qwen-edit');
  assert(state.activeFoodAnalysis === null, 'discarding analysis-only food must remove the active card');
  assert(!state.records.some((record) => record.id === 'analysis-qwen-edit'), 'discarding analysis-only food must remove its record draft');
}

async function testFoodAnalysisUsesDetectedItemsForDetailAndFollowUpForAdvice() {
  let state: AppDataState = {
    ...initialAppState,
    activeFoodAnalysis: null,
    records: [],
    chatMessages: [],
  };
  const actions = createAppActions({
    api: {
      chat: {
        async createThread() {
          return { id: '11111111-1111-4111-8111-111111111111', title: 'Food photo', kind: 'food' };
        },
        async sendTextMessage() {
          return {};
        },
      },
      food: {
        async analyzePhoto(input: { userNote?: string | null }) {
          assert(input.userNote === '少饭，酱料不确定', 'photo analysis must receive the user note typed with the image');
          return {
            food_analysis: {
              food_log_id: null,
              meal_name: 'Mixed plate',
              detected_items: ['rice', 'chicken', 'dark sauce'],
              calories_range_kcal: [520, 760],
              protein_g_range: [30, 45],
              carbs_g_range: [55, 80],
              fat_g_range: [12, 28],
              confidence: 0.48,
              status: 'analysis_only',
              needs_follow_up: true,
              follow_up_question: '这份是一个人吃完的吗？酱料大概用了多少？',
              fat_loss_advice: '补充份量后再计算更稳。',
              model_provider: 'qwen',
              model_name: 'qwen3-vl-plus',
            },
            assistant_message: { id: 'assistant-photo' },
          };
        },
        async createLog() { return {}; },
        async confirmLog() { return {}; },
        async patchLog() { return {}; },
        async discardLog() { return {}; },
        async deleteLog() { return {}; },
      },
      profile: { async patchProfile() { return {}; } },
      records: { async createCheckin() { return {}; }, async patchCheckin() { return {}; }, async deleteCheckin() { return {}; } },
      workouts: { async analyze() { return {}; }, async createLog() { return {}; }, async confirmLog() { return {}; }, async patchLog() { return {}; } },
      files: { async upload() { return {} as never; } },
      subscription: { async restore() { return { entitlements: initialAppState.entitlements }; } },
      privacy: { async deletePhotos() { return {}; }, async deleteAccount() { return {}; } },
    },
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  await actions.analyzeFoodPhoto({
    threadId: 'food-today',
    imageUri: 'file:///meal.jpg',
    filename: 'meal.jpg',
    mimeType: 'image/jpeg',
    userNote: '少饭，酱料不确定',
  });

  assert(state.activeFoodAnalysis?.detail === 'rice, chicken, dark sauce', 'food detail must list detected food items, not the follow-up question');
  assert(state.activeFoodAnalysis?.needsFollowUp === true, 'food card must preserve that AI needs more user input');
  assert(state.activeFoodAnalysis?.followUpQuestion?.includes('酱料') === true, 'food card must keep the follow-up question separately');
  assert(state.activeFoodAnalysis?.advice.includes('酱料') === true, 'food card advice should ask the follow-up question when AI is uncertain');

  await actions.saveFoodLogDetails(state.activeFoodAnalysis?.id ?? '', {
    title: 'Corrected mixed plate',
    caloriesKcal: 620,
    proteinG: 38,
    carbsG: 62,
    fatG: 18,
    detail: '一个人吃完，酱料约一汤匙',
  });

  assert(state.activeFoodAnalysis?.needsFollowUp === false, 'saving user corrections must clear follow-up blocking state');
  assert(state.activeFoodAnalysis?.followUpQuestion === undefined, 'saving user corrections must remove the follow-up question from the active card');
}

async function testPhotoUploadShowsUserBubbleEvenWhenAnalysisFails() {
  let state: AppDataState = {
    ...initialAppState,
    activeFoodAnalysis: null,
    records: [],
    chatMessages: [],
  };
  const actions = createAppActions({
    api: {
      chat: {
        async createThread() {
          return { id: '11111111-1111-4111-8111-111111111111', title: 'Food photo', kind: 'food' };
        },
        async sendTextMessage() {
          return {};
        },
      },
      food: {
        async analyzePhoto() {
          throw new Error('vision unavailable');
        },
        async createLog() { return {}; },
        async confirmLog() { return {}; },
        async patchLog() { return {}; },
        async discardLog() { return {}; },
        async deleteLog() { return {}; },
      },
      profile: { async patchProfile() { return {}; } },
      records: { async createCheckin() { return {}; }, async patchCheckin() { return {}; }, async deleteCheckin() { return {}; } },
      workouts: { async analyze() { return {}; }, async createLog() { return {}; }, async confirmLog() { return {}; }, async patchLog() { return {}; } },
      files: { async upload() { return {} as never; } },
      subscription: { async restore() { return { entitlements: initialAppState.entitlements }; } },
      privacy: { async deletePhotos() { return {}; }, async deleteAccount() { return {}; } },
    },
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  let failed = false;
  try {
    await actions.analyzeFoodPhoto({
      threadId: 'food-today',
      imageUri: 'file:///meal.jpg',
      filename: 'meal.jpg',
      mimeType: 'image/jpeg',
      userNote: '这是一人份意大利面，帮我估热量',
    });
  } catch {
    failed = true;
  }

  assert(failed, 'photo analysis failure must still surface to caller');
  assert(state.chatMessages.some((message) => message.role === 'user' && message.text.includes('meal.jpg') && message.text.includes('意大利面')), 'failed photo uploads must still show the user photo bubble with typed context');
}

async function testBackendFileUploadCreatesStructuredInsightMessage() {
  let state: AppDataState = {
    ...initialAppState,
    chatMessages: [],
  };
  const actions = createAppActions({
    api: {
      chat: {
        async createThread(payload: { title: string; kind?: string }) {
          return { id: 'thread-file-insight', title: payload.title, kind: payload.kind ?? 'files' };
        },
        async sendTextMessage() {
          return {};
        },
      },
      files: {
        async upload() {
          return {
            assistant_message: { id: 'assistant-file-insight', content_text: 'parsed body report' },
            file_upload: {
              id: 'file-1',
              filename: 'body-report.txt',
              content_type: 'text/plain',
              size_bytes: 128,
              status: 'parsed',
              summary_text: 'parsed body report',
              document_type: 'body_report',
              confidence: 0.82,
              model_provider: 'xiaomi',
              model_name: 'mimo-v2-omni',
              insights: [
                { label: 'weight_kg', value: '70 kg', source: 'ai', source_text: 'weight 70 kg', confidence: 0.84 },
                { label: 'body_fat_percent', value: '21%', source: 'ai', source_text: 'body fat 21%', confidence: 0.79 },
              ],
              recommendations: ['Sync the weight value to the profile or check-in record before comparing trends.'],
              insight_schema_version: 1,
            },
          };
        },
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  const uploadResult = await actions.attachFile({
    uri: 'file:///body-report.txt',
    name: 'body-report.txt',
    mimeType: 'text/plain',
    sizeBytes: 128,
  });

  assert(uploadResult.uploaded && uploadResult.hasInsight, 'backend file action must report uploaded insight data to the UI');
  const insightMessage = state.chatMessages.find((message) => message.id === 'assistant-file-insight');
  assert(Boolean(insightMessage), 'backend file upload must append an assistant message');
  assert(insightMessage?.fileInsight?.documentType === 'body_report', 'backend file upload must preserve document type for UI cards');
  assert(insightMessage?.fileInsight?.insights.some((item) => item.label === 'weight_kg' && item.value === '70 kg') === true, 'file insight card must preserve typed insight values');
  assert(insightMessage?.fileInsight?.confidence === 0.82, 'file insight card must preserve top-level confidence');
  assert(insightMessage?.fileInsight?.modelProvider === 'xiaomi', 'file insight card must preserve model provider');
  assert(insightMessage?.fileInsight?.modelName === 'mimo-v2-omni', 'file insight card must preserve model name');
  assert(insightMessage?.fileInsight?.insights.some((item) => item.sourceText === 'weight 70 kg' && item.confidence === 0.84) === true, 'file insight card must preserve per-field source text and confidence');
  assert(insightMessage?.fileInsight?.recommendations.length === 1, 'file insight card must preserve recommendations');
}

async function testFileInsightSyncRequiresUserActionAndCreatesWeightCheckin() {
  let state: AppDataState = {
    ...initialAppState,
    profile: { ...initialAppState.profile, weightKg: 72 },
    dailySummary: { ...initialAppState.dailySummary, weightKg: 72 },
    records: [],
    chatMessages: [
      {
        id: 'assistant-file-insight',
        role: 'assistant',
        text: 'parsed body report',
        fileInsight: {
          documentType: 'body_report',
          filename: 'body-report.txt',
          insights: [
            { label: 'weight_kg', value: '70 kg', source: 'file_text' },
            { label: 'body_fat_percent', value: '21%', source: 'file_text' },
          ],
          recommendations: [],
        },
      },
    ],
  };
  const calls: string[] = [];
  const actions = createAppActions({
    api: {
      profile: {
        async patchProfile(payload: Record<string, unknown>) {
          calls.push(`profile:${payload.current_weight_kg}`);
          return {};
        },
      },
      records: {
        async createCheckin(payload: Record<string, unknown>) {
          calls.push(`checkin:${payload.weight_kg}:${payload.notes}`);
          return { id: 'checkin-from-file' };
        },
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  assert(state.records.length === 0 && state.profile.weightKg === 72, 'file insights must not sync before user confirmation');
  await actions.syncFileInsightMetrics('assistant-file-insight');

  assert(calls.includes('profile:70'), 'sync must patch profile weight through backend when available');
  assert(calls.some((call) => call.startsWith('checkin:70:')), 'sync must create a backend weight check-in');
  assert(state.profile.weightKg === 70, 'sync must update local profile weight');
  assert(state.dailySummary.weightKg === 70, 'sync must update local daily summary weight');
  assert(state.records[0].id === 'checkin-from-file', 'sync must create a records-page weight card');
  assert(state.records[0].text.includes('body-report.txt'), 'sync record must keep the source filename visible');
}

async function testExpandedFileInsightSyncCreatesMenuAndWorkoutRecords() {
  let state: AppDataState = {
    ...initialAppState,
    records: [],
    chatMessages: [
      {
        id: 'assistant-menu-file',
        role: 'assistant',
        text: 'parsed menu',
        fileInsight: {
          documentType: 'menu',
          filename: 'menu.csv',
          insights: [
            { label: 'calories_kcal', value: '550 kcal', source: 'file_text' },
            { label: 'protein_g', value: '35g', source: 'file_text' },
          ],
          recommendations: [],
        },
      },
      {
        id: 'assistant-workout-file',
        role: 'assistant',
        text: 'parsed workout',
        fileInsight: {
          documentType: 'workout_plan',
          filename: 'workout.txt',
          insights: [
            { label: 'training_frequency', value: '4 days/week', source: 'file_text' },
          ],
          recommendations: [],
        },
      },
    ],
  };
  const calls: string[] = [];
  const actions = createAppActions({
    api: {
      food: {
        async createLog(payload: Record<string, unknown>) {
          calls.push(`food:${payload.meal_name}:${JSON.stringify(payload.calories_range_kcal)}:${JSON.stringify(payload.protein_g_range)}`);
          return { id: 'food-from-file' };
        },
      },
      workouts: {
        async createLog(payload: Record<string, unknown>) {
          calls.push(`workout:${payload.workout_type}:${payload.status}`);
          return { id: 'workout-from-file' };
        },
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  await actions.syncFileInsightMetrics('assistant-menu-file');
  assert(state.records[0].kind === 'food', 'menu file sync must create a nutrition record');
  assert(state.records[0].id === 'food-from-file', 'menu file sync must use backend food log id');
  assert(state.records[0].caloriesKcal === 550 && state.records[0].proteinG === 35, 'menu sync must preserve parsed calories and protein');
  assert(state.records[0].text.includes('menu.csv'), 'menu sync record must keep the source filename visible');
  assert(calls.some((call) => call.startsWith('food:File menu nutrition:')), 'menu sync must persist through backend food log creation');

  await actions.syncFileInsightMetrics('assistant-workout-file');
  assert(state.records[0].kind === 'workout', 'workout-plan file sync must create a workout record');
  assert(state.records[0].id === 'workout-from-file', 'workout-plan file sync must use backend workout log id');
  assert(state.records[0].text.includes('4 days/week'), 'workout-plan sync must preserve training frequency');
  assert(state.records[0].text.includes('workout.txt'), 'workout-plan sync record must keep the source filename visible');
  assert(calls.includes('workout:file_plan:confirmed'), 'workout-plan sync must persist through backend workout log creation');
}

async function testSendTextShowsUserMessageBeforeBackendReply() {
  let state: AppDataState = {
    ...initialAppState,
    chatMessages: [],
  };
  let releaseReply: (() => void) | undefined;
  const actions = createAppActions({
    api: {
      chat: {
        async createThread() {
          return {};
        },
        async sendTextMessage(payload: { threadId: string; text: string }) {
          await new Promise<void>((resolve) => {
            releaseReply = resolve;
          });
          return {
            assistant_message: { id: 'assistant-delayed', content_text: `reply:${payload.text}` },
          };
        },
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next: AppDataState) => {
      state = next;
    },
  });

  const pending = actions.sendText('food-today', 'hello FitMate');
  assert(state.chatMessages.length === 1, 'sendText must immediately show the user bubble before backend reply');
  assert(state.chatMessages[0].role === 'user' && state.chatMessages[0].text === 'hello FitMate', 'optimistic chat bubble must preserve user text');
  releaseReply?.();
  await pending;
  assert(state.chatMessages.length === 2, 'sendText must append only the assistant reply after backend response');
  assert(state.chatMessages.filter((message) => message.role === 'user').length === 1, 'sendText must not duplicate the user bubble');
}

async function run() {
  await testSubscriptionEntitlements();
  await testVisionFallback();
  await testPickerMimeNormalizationPreservesExplicitHeic();
  await testPersistenceRoundTrip();
  await testApiClientAuthHeadersAndJsonBody();
  await testApiClientHandlesEmptyDeleteResponses();
  await testApiClientDoesNotMaskErrorDetailsWithAlreadyRead();
  await testBackendServiceClearsInvalidToken();
  await testApiClientMapsUnsupportedHeicPhotoErrors();
  await testApiClientMultipartPhotoUpload();
  await testMockFallbackServicesStayAvailable();
  await testRuntimeConfigUsesBackendWhenApiBaseUrlIsProvided();
  await testRuntimeConfigDefaultsToBackendForExpoGoDevelopment();
  await testRuntimeConfigAllowsExplicitLocalPreviewMode();
  await testBackendServiceFactoryReusesLoginToken();
  await testBackendAppDataHydratesUiState();
  await testBackendAppDataHydratesLiveRecordsShape();
  await testAppActionsCallBackendMutationsAndUpdateState();
  await testFoodActionStateLifecycle();
  await testAnalysisOnlyFoodCardCanBeManaged();
  await testFoodAnalysisUsesDetectedItemsForDetailAndFollowUpForAdvice();
  await testPhotoUploadShowsUserBubbleEvenWhenAnalysisFails();
  await testBackendFileUploadCreatesStructuredInsightMessage();
  await testFileInsightSyncRequiresUserActionAndCreatesWeightCheckin();
  await testExpandedFileInsightSyncCreatesMenuAndWorkoutRecords();
  await testSendTextShowsUserMessageBeforeBackendReply();
}

void run();

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function emptyResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new Error('empty response body');
    },
    async text() {
      return '';
    },
  };
}
