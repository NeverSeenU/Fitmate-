export type AppEnvironment = 'development' | 'staging' | 'production';

declare const process: {
  env?: Record<string, string | undefined>;
};

export type RuntimeConfig = {
  environment: AppEnvironment;
  apiBaseUrl: string;
  appVersion: string;
  useMockApi: boolean;
};

export const runtimeConfig: RuntimeConfig = createRuntimeConfig({
  EXPO_PUBLIC_API_BASE_URL: process.env?.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_APP_ENV: process.env?.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_USE_MOCK_API: process.env?.EXPO_PUBLIC_USE_MOCK_API,
});

export function createRuntimeConfig(env: Record<string, string | undefined> | undefined): RuntimeConfig {
  const apiBaseUrl = env?.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.fitmate.local';
  return {
    environment: parseEnvironment(env?.EXPO_PUBLIC_APP_ENV),
    apiBaseUrl,
    appVersion: '0.1.0',
    useMockApi: parseUseMockApi(env?.EXPO_PUBLIC_USE_MOCK_API, apiBaseUrl),
  };
}

function parseEnvironment(value: string | undefined): AppEnvironment {
  if (value === 'staging' || value === 'production') {
    return value;
  }
  return 'development';
}

function parseUseMockApi(value: string | undefined, apiBaseUrl: string) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return !isExplicitBackendUrl(apiBaseUrl);
}

function isExplicitBackendUrl(apiBaseUrl: string) {
  return apiBaseUrl !== 'https://api.fitmate.local';
}
