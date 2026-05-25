export type Screen =
  | 'login'
  | 'register'
  | 'forgot'
  | 'onboarding'
  | 'chat'
  | 'records'
  | 'subscription'
  | 'settings';

export type Sheet =
  | 'subscription'
  | 'settings'
  | 'profile'
  | 'accountInfo'
  | 'healthSafety'
  | 'appLanguage'
  | 'appearance'
  | 'notifications'
  | 'personalization'
  | 'dataControl'
  | 'safetyDisclaimer'
  | 'helpCenter'
  | 'bugReport'
  | 'terms'
  | 'privacyPolicy'
  | 'appVersion'
  | null;

export type ChatPanel = 'attach' | 'threads' | null;
