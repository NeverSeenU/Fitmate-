import { runtimeConfig, type RuntimeConfig } from '../config/env';
import type { AuthSession, SubscriptionStatus } from '../domain/models';
import { createMockAuthService, type AuthService, type LoginInput, type RegisterInput, type ResetPasswordInput } from './auth';
import { createMockSubscriptionService, evaluateEntitlement, type SubscriptionService, type UsageKind, type UsageSnapshot } from './subscription';
import type { BackendApiForAppData } from './appBackend';

export type ApiHeaders = Record<string, string>;

export type ApiRequestInit = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers: ApiHeaders;
  body?: unknown;
};

export type ApiRequestRecord = {
  url: string;
  init: ApiRequestInit;
};

export type ApiResponseLike = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type FetchLike = (url: string, init: ApiRequestInit) => Promise<ApiResponseLike>;

export type ApiClientOptions = {
  baseUrl?: string;
  config?: RuntimeConfig;
  getAccessToken?: () => string | null | undefined;
  fetchImpl?: FetchLike;
};

export type PhotoUploadInput = {
  threadId: string;
  imageUri: string;
  filename: string;
  mimeType: string;
  userNote?: string | null;
};

export type FoodPhotoAnalysisResponse = {
  food_analysis: {
    food_log_id: string | null;
    meal_name: string;
    calories_range_kcal: number[];
    protein_g_range: number[];
    carbs_g_range: number[];
    fat_g_range: number[];
    confidence: number;
    status: string;
    needs_follow_up: boolean;
    follow_up_question: string | null;
    model_provider?: string;
    model_name?: string;
  };
  assistant_message: unknown;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(apiErrorMessage(status, detail));
  }
}

export type BackendApi = ReturnType<typeof createBackendApi>;

export function createBackendApi(options: ApiClientOptions = {}) {
  const client = new ApiClient(options);

  return {
    auth: {
      login(input: LoginInput): Promise<AuthSession> {
        return client.post('/auth/login', {
          email: input.identifier,
          password: input.password,
        }).then(toAuthSession);
      },
      register(input: RegisterInput): Promise<AuthSession> {
        return client.post('/auth/register', {
          email: input.identifier,
          password: input.password,
          display_name: input.displayName,
        }).then(toAuthSession);
      },
      requestPasswordReset(input: ResetPasswordInput): Promise<{ sent: boolean }> {
        return client.post('/auth/password-reset/request', {
          email: input.identifier,
        }).then(() => ({ sent: true }));
      },
      logout(): Promise<void> {
        return Promise.resolve();
      },
    },
    profile: {
      getMe: () => client.get('/me') as ReturnType<BackendApiForAppData['profile']['getMe']>,
      patchProfile: (payload: Record<string, unknown>) => client.patch('/me/profile', payload),
      saveOnboarding: (payload: Record<string, unknown>) => client.post('/me/onboarding', payload),
    },
    subscription: {
      getStatus: () => client.get('/subscription').then(toSubscriptionStatus),
      checkout: () => client.post('/subscription/checkout', {}),
      restore: (payload: { provider: string; productId: string; receipt: string }) => (
        client.post('/subscription/restore', {
          provider: payload.provider,
          product_id: payload.productId,
          receipt: payload.receipt,
        }).then(toSubscriptionStatus)
      ),
    },
    chat: {
      listThreads: () => client.get('/chat/threads') as ReturnType<BackendApiForAppData['chat']['listThreads']>,
      createThread: (payload: { title: string; kind?: string }) => client.post('/chat/threads', payload),
      listMessages: (threadId: string) => client.get(`/chat/threads/${encodeURIComponent(threadId)}/messages`),
      sendTextMessage: (payload: { threadId: string; text: string; context?: Record<string, unknown> }) => (
        client.post('/chat/messages', {
          thread_id: payload.threadId,
          text: payload.text,
          context: payload.context,
        })
      ),
    },
    food: {
      analyzePhoto: (input: PhotoUploadInput) => (
        client.multipart('/chat/photo', createPhotoUploadBody(input)) as Promise<FoodPhotoAnalysisResponse>
      ),
      listLogs: (date?: string) => client.get(date ? `/food/logs?date=${encodeURIComponent(date)}` : '/food/logs'),
      confirmLog: (foodLogId: string) => client.post(`/food/logs/${encodeURIComponent(foodLogId)}/confirm`, {}),
      patchLog: (foodLogId: string, payload: Record<string, unknown>) => client.patch(`/food/logs/${encodeURIComponent(foodLogId)}`, payload),
      discardLog: (foodLogId: string) => client.post(`/food/logs/${encodeURIComponent(foodLogId)}/discard`, {}),
      deleteLog: (foodLogId: string) => client.delete(`/food/logs/${encodeURIComponent(foodLogId)}`),
    },
    records: {
      today: (date?: string) => (
        client.get(date ? `/records/today?date=${encodeURIComponent(date)}` : '/records/today') as ReturnType<BackendApiForAppData['records']['today']>
      ),
      createCheckin: (payload: Record<string, unknown>) => client.post('/checkins', payload),
      patchCheckin: (checkinId: string, payload: Record<string, unknown>) => client.patch(`/checkins/${encodeURIComponent(checkinId)}`, payload),
      deleteCheckin: (checkinId: string) => client.delete(`/checkins/${encodeURIComponent(checkinId)}`),
    },
    workouts: {
      analyze: (text: string) => client.post('/workouts/analyze', { text }),
      confirmLog: (workoutLogId: string) => client.post(`/workouts/logs/${encodeURIComponent(workoutLogId)}/confirm`, {}),
      patchLog: (workoutLogId: string, payload: Record<string, unknown>) => client.patch(`/workouts/logs/${encodeURIComponent(workoutLogId)}`, payload),
    },
    safety: {
      disclaimer: () => client.get('/safety/disclaimer', { authenticated: false }),
      classify: (payload: { text: string; sourceMessageId?: string }) => (
        client.post('/safety/classify', {
          text: payload.text,
          source_message_id: payload.sourceMessageId,
        })
      ),
    },
    privacy: {
      exportData: () => client.get('/privacy/export'),
      deletePhotos: () => client.delete('/me/photos'),
      deleteAccount: () => client.delete('/me'),
    },
  };
}

export type FitMateServices = {
  auth: AuthService;
  subscription: SubscriptionService;
  api?: BackendApi;
};

export type FitMateServicesOptions = ApiClientOptions & {
  useMockApi?: boolean;
  subscriptionStatus?: SubscriptionStatus;
};

export function createFitMateServices(options: FitMateServicesOptions = {}): FitMateServices {
  if (options.useMockApi) {
    return {
      auth: createMockAuthService(),
      subscription: createMockSubscriptionService(options.subscriptionStatus ?? {
        tier: 'free',
        active: true,
        entitlements: {
          tier: 'free',
          automaticRecording: false,
          memoryRetentionDays: 7,
          preferredVisionProvider: 'xiaomi',
        },
      }),
    };
  }

  let accessToken = options.getAccessToken?.() ?? null;
  const api = createBackendApi({
    ...options,
    getAccessToken: () => accessToken ?? options.getAccessToken?.(),
  });
  return {
    api,
    auth: {
      async login(input) {
        const session = await api.auth.login(input);
        accessToken = session.accessToken;
        return session;
      },
      async register(input) {
        const session = await api.auth.register(input);
        accessToken = session.accessToken;
        return session;
      },
      requestPasswordReset: api.auth.requestPasswordReset,
      async logout() {
        accessToken = null;
        await api.auth.logout();
      },
    },
    subscription: {
      getStatus: () => api.subscription.getStatus(),
      canUse(kind: UsageKind, usage: UsageSnapshot) {
        return evaluateEntitlement(kind, usage);
      },
    },
  };
}

class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions) {
    const config = options.config ?? runtimeConfig;
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? config.apiBaseUrl);
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
  }

  get(path: string, options: { authenticated?: boolean } = {}) {
    return this.request(path, { method: 'GET', authenticated: options.authenticated });
  }

  post(path: string, body: Record<string, unknown>) {
    return this.request(path, { method: 'POST', body });
  }

  patch(path: string, body: Record<string, unknown>) {
    return this.request(path, { method: 'PATCH', body });
  }

  delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }

  multipart(path: string, body: PhotoUploadBody) {
    return this.request(path, { method: 'POST', body, multipart: true });
  }

  private async request(
    path: string,
    options: {
      method: ApiRequestInit['method'];
      body?: unknown;
      authenticated?: boolean;
      multipart?: boolean;
    },
  ) {
    const headers: ApiHeaders = {};
    if (!options.multipart && options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (options.authenticated !== false) {
      const token = this.getAccessToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const init: ApiRequestInit = {
      method: options.method,
      headers,
    };
    if (options.body !== undefined) {
      init.body = options.multipart ? options.body : JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(this.url(path), init);
    if (!response.ok) {
      throw new ApiError(response.status, await readErrorDetail(response));
    }
    if (response.status === 204) {
      return {};
    }
    return response.json();
  }

  private url(path: string) {
    return `${this.baseUrl}/v1${path.startsWith('/') ? path : `/${path}`}`;
  }
}

class PhotoUploadBody {
  constructor(private readonly input: PhotoUploadInput) {}

  toFormData() {
    const data = new FormData();
    data.append('thread_id', this.input.threadId);
    if (this.input.userNote) {
      data.append('user_note', this.input.userNote);
    }
    data.append('image', {
      uri: this.input.imageUri,
      name: this.input.filename,
      type: this.input.mimeType,
    } as unknown as Blob);
    return data;
  }

  toString() {
    const params = [
      `thread_id=${this.input.threadId}`,
      `image=${this.input.filename}`,
    ];
    if (this.input.userNote) {
      params.push(`user_note=${this.input.userNote}`);
    }
    return params.join('&');
  }
}

function createPhotoUploadBody(input: PhotoUploadInput) {
  return new PhotoUploadBody(input);
}

async function defaultFetch(url: string, init: ApiRequestInit): Promise<ApiResponseLike> {
  const requestInit = {
    ...init,
    body: init.body instanceof PhotoUploadBody ? init.body.toFormData() : init.body,
  };
  const response = await fetch(url, requestInit as RequestInit);
  return response as ApiResponseLike;
}

async function readErrorDetail(response: ApiResponseLike) {
  try {
    return await response.json();
  } catch {
    return response.text();
  }
}

function apiErrorMessage(status: number, detail: unknown) {
  const body = detail as { detail?: unknown; message?: unknown };
  const nested = body?.detail as { code?: unknown; message?: unknown } | string | undefined;
  if (typeof nested === 'object' && nested?.code === 'vision_unavailable') {
    return '图片识别暂时不可用：AI 识别服务还没有接入或当前不可用。你可以先用文字记录食物。';
  }
  if (typeof nested === 'object' && nested?.code === 'fair_use_limit_reached') {
    return '今天的使用次数已达到当前订阅的公平使用上限。你可以明天再试，或升级订阅后继续使用。';
  }
  if (typeof nested === 'object' && typeof nested.message === 'string') {
    return nested.message;
  }
  if (typeof body?.message === 'string') {
    return body.message;
  }
  if (typeof nested === 'string') {
    return nested;
  }
  return `FitMate API request failed with status ${status}`;
}

function toAuthSession(payload: unknown): AuthSession {
  const response = payload as {
    access_token: string;
    user: {
      id: string;
      email: string;
      display_name?: string | null;
    };
  };
  return {
    accessToken: response.access_token,
    refreshToken: '',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    user: {
      id: response.user.id,
      email: response.user.email,
      displayName: response.user.display_name ?? response.user.email,
    },
  };
}

function toSubscriptionStatus(payload: unknown): SubscriptionStatus {
  const response = payload as {
    plan?: SubscriptionStatus['tier'];
    tier?: SubscriptionStatus['tier'];
    status?: string;
    renews_at?: string | null;
    entitlements: {
      automatic_recording?: boolean;
      automaticRecording?: boolean;
      memory_retention?: '7_days' | 'extended';
      memoryRetentionDays?: number | 'extended';
      preferredVisionProvider?: 'xiaomi' | 'qwen';
    };
  };
  const tier = response.tier ?? response.plan ?? 'free';
  return {
    tier,
    active: response.status !== 'inactive',
    renewsAt: response.renews_at ?? undefined,
    entitlements: {
      tier,
      automaticRecording: Boolean(response.entitlements.automaticRecording ?? response.entitlements.automatic_recording),
      memoryRetentionDays: response.entitlements.memoryRetentionDays ?? (
        response.entitlements.memory_retention === 'extended' ? 'extended' : 7
      ),
      preferredVisionProvider: response.entitlements.preferredVisionProvider ?? 'xiaomi',
    },
  };
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
