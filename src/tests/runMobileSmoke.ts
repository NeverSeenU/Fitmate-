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
  pass('file-selection', 'selected file metadata is visible in chat');
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
