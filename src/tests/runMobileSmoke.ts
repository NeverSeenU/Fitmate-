import { ApiError } from '../services/apiClient';
import { createAppActions } from '../services/appActions';
import { initialAppState } from '../state/appState';
import type { AppDataState } from '../domain/models';

type SmokeResult = {
  name: string;
  status: 'passed';
  detail: string;
};

const results: SmokeResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function pass(name: string, detail: string) {
  results.push({ name, status: 'passed', detail });
}

async function smokeChatWorkoutFileAndWeightFlows() {
  let state: AppDataState = {
    ...initialAppState,
    records: [],
    chatMessages: [],
  };
  const actions = createAppActions({
    api: {
      chat: {
        async createThread() {
          return {};
        },
        async sendTextMessage(payload: { threadId: string; text: string }) {
          return { assistant_message: { id: 'assistant-smoke', content_text: `reply:${payload.text}` } };
        },
      },
      records: {
        async createCheckin() {
          return { id: 'checkin-smoke' };
        },
        async patchCheckin() {
          return {};
        },
        async deleteCheckin() {
          return {};
        },
      },
      workouts: {
        async analyze() {
          return {
            assistant_message: { id: 'assistant-workout-smoke', content_text: 'workout reply' },
            workout_analysis: {
              workout_log_id: 'workout-smoke',
              workout_type: 'strength',
              duration_minutes: 45,
              intensity: 'medium',
              calories_burned_range_kcal: [180, 260],
              status: 'pending',
            },
          };
        },
        async confirmLog() {
          return {};
        },
        async patchLog() {
          return {};
        },
      },
      files: {
        async upload(input: { threadId: string; fileUri: string; filename: string; mimeType: string }) {
          return {
            assistant_message: { id: 'assistant-file-smoke', content_text: 'parsed body report' },
            file_upload: {
              id: 'file-smoke',
              filename: input.filename,
              content_type: input.mimeType,
              size_bytes: 4096,
              status: 'parsed',
              summary_text: 'parsed body report',
              document_type: 'body_report',
              insights: [{ label: 'weight_kg', value: '70 kg', source: 'file_text' }],
              recommendations: ['Sync the weight value to the profile or check-in record before comparing trends.'],
              insight_schema_version: 1,
            },
          };
        },
      },
    } as unknown as NonNullable<Parameters<typeof createAppActions>[0]['api']>,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  });

  await actions.sendText('food-today', '今天训练后很饿');
  assert(state.chatMessages.some((message) => message.role === 'user'), 'chat user bubble must render');
  assert(state.chatMessages.some((message) => message.role === 'assistant'), 'chat assistant bubble must render');
  pass('chat-send', 'user and assistant messages are visible');

  await actions.createWorkoutLog('力量训练 45 分钟，最后跑步 15 分钟');
  assert(state.records[0].kind === 'workout', 'workout action must create a records card');
  pass('workout-record', 'workout creates a records-page card');

  await actions.createCheckin({ weightKg: 70.5, notes: 'morning empty stomach' });
  assert(state.records[0].kind === 'weight', 'weight check-in must create a records card');
  pass('weight-checkin', 'weight check-in creates a records-page card');

  await actions.attachFile({
    uri: 'file:///body-check.pdf',
    name: 'body-check.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
  });
  assert(state.chatMessages.some((message) => message.text.includes('body-check.pdf')), 'file metadata must appear in chat');
  assert(state.chatMessages.some((message) => message.fileInsight?.documentType === 'body_report'), 'file insight card data must appear in chat state');
  pass('file-selection', 'selected file metadata and structured insight data are visible in chat');
}

async function smokeFairUseErrorMessage() {
  const error = new ApiError(429, {
    detail: {
      code: 'fair_use_limit_reached',
      purpose: 'chat',
      message: 'Daily fair-use limit reached for your current plan.',
    },
  });

  assert(error.message.includes('公平使用上限'), 'fair-use API errors must map to user-readable Chinese copy');
  pass('fair-use-copy', '429 fair-use errors map to readable mobile copy');
}

async function run() {
  await smokeChatWorkoutFileAndWeightFlows();
  await smokeFairUseErrorMessage();
  console.log(JSON.stringify({ smoke: 'mobile-core', results }, null, 2));
}

void run();
