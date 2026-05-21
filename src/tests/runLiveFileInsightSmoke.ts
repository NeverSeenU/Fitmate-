import { createAppActions } from '../services/appActions';
import { initialAppState } from '../state/appState';
import type { AppDataState, FileInsight } from '../domain/models';
import type { FileUploadResponse } from '../services/apiClient';

declare const process: {
  env?: Record<string, string | undefined>;
  argv?: string[];
};

const baseUrl = trimTrailingSlash(process.env?.FITMATE_LIVE_API_BASE_URL ?? 'http://127.0.0.1:8000');
const requireAiMetadata = process.env?.FITMATE_REQUIRE_AI_FILE_METADATA === 'true'
  || process.argv?.includes('--require-ai-metadata') === true;

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

type LiveFileFixture = {
  id: string;
  filename: string;
  content: string;
  expectedDocumentType: string;
  requiredLabels: string[];
};

const fileFixtures: LiveFileFixture[] = [
  {
    id: 'body',
    filename: 'body-report-smoke.txt',
    content: 'body report weight 70kg body fat 21% protein 120g',
    expectedDocumentType: 'body_report',
    requiredLabels: ['weight_kg', 'body_fat_percent'],
  },
  {
    id: 'menu',
    filename: 'menu-smoke.txt',
    content: 'daily menu lunch chicken rice protein 35g calories 550 kcal',
    expectedDocumentType: 'menu',
    requiredLabels: ['protein_g', 'calories_kcal'],
  },
  {
    id: 'workout',
    filename: 'workout-plan-smoke.txt',
    content: 'workout plan strength training 4 days/week sets reps mobility',
    expectedDocumentType: 'workout_plan',
    requiredLabels: ['training_frequency'],
  },
];

async function uploadFile(threadId: string, token: string, fixture: LiveFileFixture): Promise<FileUploadResponse> {
  const form = new FormData();
  form.append('thread_id', threadId);
  form.append(
    'file',
    new Blob([fixture.content], { type: 'text/plain' }),
    fixture.filename,
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

  const uploads: Array<{ fixture: LiveFileFixture; response: FileUploadResponse; labels: Set<string> }> = [];
  for (const fixture of fileFixtures) {
    const response = await uploadFile(thread.id, session.access_token, fixture);
    const labels = new Set((response.file_upload.insights ?? []).map((item) => item.label));
    assert(
      response.file_upload.document_type === fixture.expectedDocumentType,
      `live upload must classify ${fixture.filename} as ${fixture.expectedDocumentType}`,
    );
    for (const label of fixture.requiredLabels) {
      assert(labels.has(label), `live upload must extract ${label} from ${fixture.filename}`);
    }
    if (requireAiMetadata) {
      assert(response.file_upload.model_provider === 'xiaomi' || response.file_upload.model_provider === 'qwen', `${fixture.filename} must use a real AI provider`);
      assert(Boolean(response.file_upload.model_name), `${fixture.filename} must include model name`);
      assert(typeof response.file_upload.confidence === 'number', `${fixture.filename} must include top-level confidence`);
      for (const label of fixture.requiredLabels) {
        const insight = response.file_upload.insights?.find((item) => item.label === label);
        assert(typeof insight?.confidence === 'number', `${fixture.filename} ${label} must include field confidence`);
        assert(Boolean(insight?.source_text), `${fixture.filename} ${label} must include source_text`);
      }
    }
    uploads.push({ fixture, response, labels });
  }

  let state: AppDataState = {
    ...initialAppState,
    records: [],
    chatMessages: uploads.map(({ fixture, response }) => ({
      id: `assistant-live-file-${fixture.id}`,
      role: 'assistant',
      text: response.assistant_message?.content_text ?? response.file_upload.summary_text,
      fileInsight: toFileInsight(response),
    })),
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
      food: {
        createLog: (payload: Record<string, unknown>) => jsonRequest('/food/logs', {
          method: 'POST',
          token: session.access_token,
          body: payload,
        }),
      },
      workouts: {
        createLog: (payload: Record<string, unknown>) => jsonRequest('/workouts/logs', {
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

  for (const fixture of fileFixtures) {
    await actions.syncFileInsightMetrics(`assistant-live-file-${fixture.id}`);
  }
  assert(state.profile.weightKg === 70, 'mobile action must sync file weight into local profile');
  assert(state.records.some((record) => record.kind === 'weight' && record.weightKg === 70), 'mobile action must create a local weight record');
  assert(state.records.some((record) => record.kind === 'food' && record.caloriesKcal === 550), 'mobile action must create a local menu nutrition record');
  assert(state.records.some((record) => record.kind === 'workout' && record.detail?.includes('4 days/week')), 'mobile action must create a local workout plan record');
  assert(
    state.chatMessages.filter((message) => message.fileInsight?.syncStatus === 'synced').length === fileFixtures.length,
    'mobile action must mark every file card synced',
  );

  const me = await jsonRequest<{
    profile: { current_weight_kg?: string | number | null } | null;
  }>('/me', { token: session.access_token });
  const records = await jsonRequest<{
    checkins?: Array<{ weight_kg?: string | number | null; notes?: string | null }>;
    food_logs?: Array<{ meal_name?: string | null; calories_range_kcal?: number[]; user_portion_note?: string | null }>;
    workout_logs?: Array<{ workout_type?: string | null; status?: string | null }>;
  }>('/records/today', { token: session.access_token });

  assert(Number(me.profile?.current_weight_kg) === 70, 'backend profile must persist synced weight');
  assert((records.checkins ?? []).some((checkin) => Number(checkin.weight_kg) === 70), 'backend records must include synced weight check-in');
  assert(
    (records.food_logs ?? []).some((food) => food.meal_name === 'File menu nutrition' && food.user_portion_note?.includes('menu-smoke.txt')),
    'backend records must include synced menu nutrition log',
  );
  assert(
    (records.workout_logs ?? []).some((workout) => workout.workout_type === 'file_plan' && workout.status === 'confirmed'),
    'backend records must include synced workout plan log',
  );

  console.log(JSON.stringify({
    smoke: 'live-file-insight',
    status: 'passed',
    apiBaseUrl: baseUrl,
    uploads: uploads.map(({ fixture, response, labels }) => ({
      filename: fixture.filename,
      documentType: response.file_upload.document_type,
      confidence: response.file_upload.confidence,
      modelProvider: response.file_upload.model_provider,
      modelName: response.file_upload.model_name,
      labels: [...labels].sort(),
      metadataMode: requireAiMetadata ? 'required' : 'optional',
    })),
    syncedRecordKinds: state.records.map((record) => record.kind),
    syncedWeightKg: state.profile.weightKg,
  }, null, 2));
}

function toFileInsight(response: FileUploadResponse): FileInsight {
  return {
    documentType: response.file_upload.document_type ?? 'general',
    filename: response.file_upload.filename,
    confidence: response.file_upload.confidence,
    modelProvider: response.file_upload.model_provider,
    modelName: response.file_upload.model_name,
    syncStatus: 'available',
    insights: (response.file_upload.insights ?? []).map((item) => ({
      label: item.label,
      value: item.value,
      source: item.source,
      sourceText: item.source_text,
      confidence: item.confidence,
    })),
    recommendations: response.file_upload.recommendations ?? [],
  };
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

void run();
