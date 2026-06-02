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
  initialAccessToken?: string | null;
  onAuthInvalid?: () => void;
  fetchImpl?: FetchLike;
};

export type PhotoUploadInput = {
  threadId: string;
  imageUri: string;
  filename: string;
  mimeType: string;
  uploadUri?: string;
  uploadFilename?: string;
  uploadMimeType?: string;
  userNote?: string | null;
};

export type PhotoBatchUploadInput = {
  threadId: string;
  photos: Array<{
    imageUri: string;
    filename: string;
    mimeType: string;
    uploadUri?: string;
    uploadFilename?: string;
    uploadMimeType?: string;
  }>;
  userNote?: string | null;
};

export type FileUploadInput = {
  threadId: string;
  fileUri: string;
  filename: string;
  mimeType: string;
  userPrompt?: string | null;
};

export type FileUploadResponse = {
  file_upload: {
    id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    status: string;
    summary_text: string;
    document_type?: string;
    confidence?: number;
    insights?: Array<{ label: string; value: string; source?: string; source_text?: string; confidence?: number }>;
    recommendations?: string[];
    insight_schema_version?: number;
    model_provider?: string;
    model_name?: string;
    fallback_used?: boolean;
    fallback_source?: string | null;
    fallback_error_code?: string | null;
    analysis_source?: string | null;
  };
  assistant_message?: { id?: string; content_text?: string; message_type?: string; structured_json?: unknown };
};

export type FoodPhotoAnalysisResponse = {
  food_analysis: {
    food_log_id: string | null;
    meal_name: string;
    detected_items?: string[];
    calories_range_kcal: number[];
    protein_g_range: number[];
    carbs_g_range: number[];
    fat_g_range: number[];
    confidence: number;
    status: string;
    needs_follow_up: boolean;
    follow_up_question: string | null;
    fat_loss_advice?: string;
    model_provider?: string;
    model_name?: string;
    provider_latency_ms?: number | null;
    request_latency_ms?: number | null;
    fallback_used?: boolean;
    fallback_source?: string | null;
    fallback_error_code?: string | null;
    analysis_source?: string | null;
    source_group?: { group_id?: string; analysis_indexes?: number[]; source_photo_indexes?: number[]; meal_name?: string } | null;
    source_photo_indexes?: number[] | null;
    source_images?: Array<{ index?: number; filename?: string | null; content_type?: string | null; image_object_key?: string; size_bytes?: number }> | null;
  };
  assistant_message?: { id?: string; content_text?: string; message_type?: string; structured_json?: unknown };
};

export type FoodPhotoBatchAnalysisResponse = {
  food_analyses: FoodPhotoAnalysisResponse['food_analysis'][];
  assistant_messages?: Array<{ id?: string; content_text?: string; message_type?: string; structured_json?: unknown }>;
  groups?: Array<{ group_id: string; analysis_indexes: number[]; source_photo_indexes?: number[]; meal_name: string }>;
  performance?: {
    provider?: string;
    model_name?: string;
    provider_latency_ms?: number;
    request_latency_ms?: number;
    photo_count?: number;
    analysis_count?: number;
    fallback_used?: boolean;
    fallback_source?: string | null;
  };
};

export type DiagnosticsSmokeResponse = {
  status: string;
  service: string;
  environment: string;
  local_runtime: boolean;
  features: {
    chat_ai_reply_enabled: boolean;
    text_food_ai_analysis_enabled: boolean;
    file_ai_extraction_enabled: boolean;
    workout_ai_analysis_enabled: boolean;
    food_vision_provider: string;
  };
  providers: {
    xiaomi: { configured: boolean; model: string };
    qwen: { configured: boolean; model: string };
  };
  readiness: {
    backend_reachable: boolean;
    chat_ai_ready: boolean;
    food_vision_ready: boolean;
    file_ai_ready: boolean;
    workout_ai_ready: boolean;
    text_food_ai_ready: boolean;
  };
  routing: {
    food_vision_provider_order: string[];
    chat_reply_provider_order: string[];
  };
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
    diagnostics: {
      smoke: () => client.get('/diagnostics/smoke', { authenticated: false }) as Promise<DiagnosticsSmokeResponse>,
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
      analyzePhotos: (input: PhotoBatchUploadInput) => (
        client.multipart('/chat/photos', new PhotoBatchUploadBody(input)) as Promise<FoodPhotoBatchAnalysisResponse>
      ),
      listLogs: (date?: string) => client.get(date ? `/food/logs?date=${encodeURIComponent(date)}` : '/food/logs'),
      createLog: (payload: Record<string, unknown>) => client.post('/food/logs', payload),
      confirmLog: (foodLogId: string) => client.post(`/food/logs/${encodeURIComponent(foodLogId)}/confirm`, {}),
      patchLog: (foodLogId: string, payload: Record<string, unknown>) => client.patch(`/food/logs/${encodeURIComponent(foodLogId)}`, payload),
      discardLog: (foodLogId: string) => client.post(`/food/logs/${encodeURIComponent(foodLogId)}/discard`, {}),
      deleteLog: (foodLogId: string) => client.delete(`/food/logs/${encodeURIComponent(foodLogId)}`),
    },
    files: {
      upload: (input: FileUploadInput) => client.multipart('/files/upload', new FileUploadBody(input)) as Promise<FileUploadResponse>,
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
      createLog: (payload: Record<string, unknown>) => client.post('/workouts/logs', payload),
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

  let accessToken = options.initialAccessToken ?? options.getAccessToken?.() ?? null;
  const api = createBackendApi({
    ...options,
    getAccessToken: () => accessToken ?? options.getAccessToken?.(),
    onAuthInvalid: () => {
      accessToken = null;
      options.onAuthInvalid?.();
    },
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
  private readonly onAuthInvalid?: () => void;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions) {
    const config = options.config ?? runtimeConfig;
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? config.apiBaseUrl);
    this.getAccessToken = options.getAccessToken;
    this.onAuthInvalid = options.onAuthInvalid;
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

  multipart(path: string, body: PhotoUploadBody | PhotoBatchUploadBody | FileUploadBody) {
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
      const detail = await readErrorDetail(response);
      if (response.status === 401 && isAuthInvalidDetail(detail)) {
        this.onAuthInvalid?.();
      }
      throw new ApiError(response.status, detail);
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
      uri: this.input.uploadUri ?? this.input.imageUri,
      name: this.input.uploadFilename ?? this.input.filename,
      type: this.input.uploadMimeType ?? this.input.mimeType,
    } as unknown as Blob);
    return data;
  }

  toString() {
    const params = [
      `thread_id=${this.input.threadId}`,
      `image=${this.input.uploadFilename ?? this.input.filename}`,
      `type=${this.input.uploadMimeType ?? this.input.mimeType}`,
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

class PhotoBatchUploadBody {
  constructor(private readonly input: PhotoBatchUploadInput) {}

  toFormData() {
    const data = new FormData();
    data.append('thread_id', this.input.threadId);
    if (this.input.userNote) {
      data.append('user_note', this.input.userNote);
    }
    this.input.photos.forEach((photo) => {
      data.append('images', {
        uri: photo.uploadUri ?? photo.imageUri,
        name: photo.uploadFilename ?? photo.filename,
        type: photo.uploadMimeType ?? photo.mimeType,
      } as unknown as Blob);
    });
    return data;
  }

  toString() {
    const params = [
      `thread_id=${this.input.threadId}`,
      ...this.input.photos.map((photo) => `images=${photo.uploadFilename ?? photo.filename}`),
      ...this.input.photos.map((photo) => `types=${photo.uploadMimeType ?? photo.mimeType}`),
    ];
    if (this.input.userNote) {
      params.push(`user_note=${this.input.userNote}`);
    }
    return params.join('&');
  }
}

class FileUploadBody {
  constructor(private readonly input: FileUploadInput) {}

  toFormData() {
    const data = new FormData();
    data.append('thread_id', this.input.threadId);
    if (this.input.userPrompt) {
      data.append('user_prompt', this.input.userPrompt);
    }
    data.append('file', {
      uri: this.input.fileUri,
      name: this.input.filename,
      type: this.input.mimeType,
    } as unknown as Blob);
    return data;
  }

  toString() {
    const params = [
      `thread_id=${this.input.threadId}`,
      `file=${this.input.filename}`,
    ];
    if (this.input.userPrompt) {
      params.push(`user_prompt=${this.input.userPrompt}`);
    }
    return params.join('&');
  }
}

async function defaultFetch(url: string, init: ApiRequestInit): Promise<ApiResponseLike> {
  const requestInit = {
    ...init,
    body: init.body instanceof PhotoUploadBody || init.body instanceof PhotoBatchUploadBody || init.body instanceof FileUploadBody
      ? init.body.toFormData()
      : init.body,
  };
  const response = await fetch(url, requestInit as RequestInit);
  return response as ApiResponseLike;
}

async function readErrorDetail(response: ApiResponseLike) {
  const clone = 'clone' in response && typeof (response as { clone?: unknown }).clone === 'function'
    ? (response as Response).clone()
    : undefined;
  try {
    return await (clone ?? response).json();
  } catch (jsonError) {
    try {
      return await response.text();
    } catch {
      return jsonError instanceof Error ? jsonError.message : `HTTP ${response.status}`;
    }
  }
}

function apiErrorMessage(status: number, detail: unknown) {
  if (status === 401 && isAuthInvalidDetail(detail)) {
    return '登录已过期，请重新登录。';
  }
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }
  const body = detail as { detail?: unknown; message?: unknown };
  const nested = body?.detail as { code?: unknown; message?: unknown } | string | undefined;
  if (typeof nested === 'object' && isVisionProviderErrorCode(nested.code)) {
    return visionProviderErrorMessage(String(nested.code));
  }
  if (typeof nested === 'object' && nested?.code === 'image_conversion_unavailable') {
    return '照片转换暂时不可用，请稍后再试。';
  }
  if (typeof nested === 'object' && nested?.code === 'image_conversion_failed') {
    return '这张照片暂时无法解析，请重新选择原图再试。';
  }
  if (typeof nested === 'object' && nested?.code === 'unsupported_image_type') {
    return '这个照片格式暂时不支持，请从系统相册重新选择原图。';
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

function isVisionProviderErrorCode(code: unknown) {
  return typeof code === 'string' && (
    code === 'vision_unavailable'
    || code === 'vision_provider_not_configured'
    || code === 'vision_provider_auth_failed'
    || code === 'vision_provider_rate_limited'
    || code === 'vision_provider_timeout'
    || code === 'vision_provider_network_error'
    || code === 'vision_provider_invalid_response'
  );
}

function visionProviderErrorMessage(code: string) {
  if (code === 'vision_provider_timeout' || code === 'vision_provider_network_error') {
    return 'AI 响应有点慢或网络不稳定。请稍后重试，刚才的内容不会丢。';
  }
  if (code === 'vision_provider_rate_limited') {
    return 'AI 服务现在有点拥挤，请过一会儿再试。';
  }
  if (code === 'vision_provider_auth_failed' || code === 'vision_provider_not_configured') {
    return '当前环境的图片 AI 服务还没准备好。请稍后再试，或先用文字描述这餐。';
  }
  if (code === 'vision_provider_invalid_response') {
    return 'AI 返回的识别结果格式不稳定，这次没有自动写入记录。请重试或用文字补充。';
  }
  return '图片识别暂时不可用。你可以稍后再试，或先用文字描述这餐，我会先帮你估算。';
}

function isAuthInvalidDetail(detail: unknown) {
  if (detail === 'invalid_token' || detail === 'not_authenticated') {
    return true;
  }
  if (!detail || typeof detail !== 'object') {
    return false;
  }
  const body = detail as { detail?: unknown; code?: unknown };
  if (body.detail === 'invalid_token' || body.detail === 'not_authenticated') {
    return true;
  }
  if (body.code === 'invalid_token' || body.code === 'not_authenticated') {
    return true;
  }
  const nested = body.detail as { code?: unknown; message?: unknown } | undefined;
  return typeof nested === 'object' && (
    nested.code === 'invalid_token' || nested.code === 'not_authenticated'
  );
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
