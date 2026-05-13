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

export const runtimeConfig: RuntimeConfig = {
  environment: parseEnvironment(process.env?.EXPO_PUBLIC_APP_ENV),
  apiBaseUrl: process.env?.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.fitmate.local',
  appVersion: '0.1.0',
  useMockApi: process.env?.EXPO_PUBLIC_USE_MOCK_API !== 'false',
};

function parseEnvironment(value: string | undefined): AppEnvironment {
  if (value === 'staging' || value === 'production') {
    return value;
  }
  return 'development';
}
