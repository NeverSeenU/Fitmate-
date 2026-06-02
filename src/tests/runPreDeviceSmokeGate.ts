import { createBackendApi } from '../services/apiClient';
import { runPreDeviceSmokeGate } from '../services/smokeGate';
import { createRuntimeConfig } from '../config/env';

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

async function run() {
  const config = createRuntimeConfig({
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_USE_MOCK_API: 'false',
  });
  const api = createBackendApi({ config });
  const result = await runPreDeviceSmokeGate(api);
  console.log(JSON.stringify({
    smoke: 'pre-device-backend',
    apiBaseUrl: config.apiBaseUrl,
    status: result.status,
    checks: result.checks,
    diagnostics: result.diagnostics
      ? {
        environment: result.diagnostics.environment,
        features: result.diagnostics.features,
        providers: result.diagnostics.providers,
        readiness: result.diagnostics.readiness,
        routing: result.diagnostics.routing,
      }
      : undefined,
  }, null, 2));
  if (result.status !== 'passed') {
    process.exitCode = 1;
  }
}

void run();
