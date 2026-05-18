import { createAppActions } from '../services/appActions';
import { initialAppState } from '../state/appState';
import type { AppDataState, FileInsight } from '../domain/models';
import type { FileUploadResponse } from '../services/apiClient';

declare const process: {
  env?: Record<string, string | undefined>;
};

const baseUrl = trimTrailingSlash(process.env?.FITMATE_LIVE_API_BASE_URL ?? 'http://127.0.0.1:8000');

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function jsonRequest<T>(path: string, options: {
  method?: string;
  token?: string;
  body?: Record<string, unknown>;
} = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function uploadFile(threadId: string, token: string): Promise<FileUploadResponse> {
  const form = new FormData();
  form.append('thread_id', threadId);
  form.append(
    'file',
    new Blob(['body report weight 70kg body fat 21% protein 120g'], { type: 'text/plain' }),
    'body-report-smoke.txt',
  );
  const response = await fetch(`${baseUrl}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`POST /files/upload failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<FileUploadResponse>;
}

async function run() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const session = await jsonRequest<{
    access_token: string;
    user: { email: string };
  }>('/auth/register', {
    method: 'POST',
    body: {
      email: `live-file-${suffix}@example.com`,
      password: 'StrongPass123',
      display_name: 'Live File Smoke',
    },
  });

  const thread = await jsonRequest<{ id: string }>('/chat/threads', {
    method: 'POST',
    token: session.access_token,
    body: { title: 'Live File Insight Smoke', kind: 'files' },
  });

  const upload = await uploadFile(thread.id, session.access_token);
  const fileUpload = upload.file_upload;
  const labels = new Set((fileUpload.insights ?? []).map((item) => item.label));
  assert(fileUpload.document_type === 'body_report', 'live upload must classify the file as a body report');
  assert(labels.has('weight_kg'), 'live upload must extract weight_kg');
  assert(labels.has('body_fat_percent'), 'live upload must extract body_fat_percent');

  let state: AppDataState = {
    ...initialAppState,
    records: [],
    chatMessages: [{
      id: 'assistant-live-file',
      role: 'assistant',
      text: upload.assistant_message?.content_text ?? fileUpload.summary_text,
      fileInsight: toFileInsight(upload),
    }],
  };
  const actions = createAppActions({
    api: {
      profile: {
        patchProfile: (payload: Record<string, unknown>) => jsonRequest('/me/profile', {
          method: 'PATCH',
          token: session.access_token,
          body: payload,
        }),
      },
      records: {
        createCheckin: (payload: Record<string, unknown>) => jsonRequest('/checkins', {
          method: 'POST',
          token: session.access_token,
          body: payload,
        }),
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  });

  await actions.syncFileInsightMetrics('assistant-live-file');
  assert(state.profile.weightKg === 70, 'mobile action must sync file weight into local profile');
  assert(state.records[0]?.kind === 'weight' && state.records[0].weightKg === 70, 'mobile action must create a local weight record');
  assert(state.chatMessages.some((message) => message.fileInsight?.syncStatus === 'synced'), 'mobile action must mark the file card synced');

  const me = await jsonRequest<{
    profile: { current_weight_kg?: string | number | null } | null;
  }>('/me', { token: session.access_token });
  const records = await jsonRequest<{
    checkins?: Array<{ weight_kg?: string | number | null; notes?: string | null }>;
  }>('/records/today', { token: session.access_token });

  assert(Number(me.profile?.current_weight_kg) === 70, 'backend profile must persist synced weight');
  assert((records.checkins ?? []).some((checkin) => Number(checkin.weight_kg) === 70), 'backend records must include synced weight check-in');

  console.log(JSON.stringify({
    smoke: 'live-file-insight',
    status: 'passed',
    apiBaseUrl: baseUrl,
    documentType: fileUpload.document_type,
    labels: [...labels].sort(),
    syncedWeightKg: state.profile.weightKg,
  }, null, 2));
}

function toFileInsight(response: FileUploadResponse): FileInsight {
  return {
    documentType: response.file_upload.document_type ?? 'general',
    filename: response.file_upload.filename,
    syncStatus: 'available',
    insights: response.file_upload.insights ?? [],
    recommendations: response.file_upload.recommendations ?? [],
  };
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

void run();
