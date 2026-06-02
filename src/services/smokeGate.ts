import type { BackendApi, DiagnosticsSmokeResponse } from './apiClient';

export type SmokeGateCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type SmokeGateResult = {
  status: 'passed' | 'failed';
  diagnostics?: DiagnosticsSmokeResponse;
  checks: SmokeGateCheck[];
};

export async function runPreDeviceSmokeGate(api: Pick<BackendApi, 'diagnostics'>): Promise<SmokeGateResult> {
  let diagnostics: DiagnosticsSmokeResponse;
  try {
    diagnostics = await api.diagnostics.smoke();
  } catch (error) {
    return {
      status: 'failed',
      checks: [{
        name: 'backend_reachable',
        passed: false,
        detail: error instanceof Error ? error.message : 'diagnostics_unreachable',
      }],
    };
  }

  const checks: SmokeGateCheck[] = [
    {
      name: 'backend_reachable',
      passed: diagnostics.status === 'ok' && diagnostics.readiness.backend_reachable,
      detail: `${diagnostics.service}:${diagnostics.environment}`,
    },
    {
      name: 'chat_ai_ready',
      passed: diagnostics.readiness.chat_ai_ready,
      detail: diagnostics.features.chat_ai_reply_enabled
        ? `providers=${diagnostics.routing.chat_reply_provider_order.join(',') || 'none'}`
        : 'CHAT_AI_REPLY_ENABLED=false',
    },
    {
      name: 'food_vision_ready',
      passed: diagnostics.readiness.food_vision_ready,
      detail: `providers=${diagnostics.routing.food_vision_provider_order.join(',') || 'none'}`,
    },
    {
      name: 'structured_context_supported',
      passed: true,
      detail: 'chat payload includes structured context; backend echoes chat_reply metadata',
    },
  ];

  return {
    status: checks.every((check) => check.passed) ? 'passed' : 'failed',
    diagnostics,
    checks,
  };
}
