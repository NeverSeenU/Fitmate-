export type Screen =
  | 'login'
  | 'register'
  | 'forgot'
  | 'onboarding'
  | 'chat'
  | 'records'
  | 'subscription'
  | 'settings';

export type Sheet = 'subscription' | 'settings' | 'profile' | null;

export type ChatPanel = 'attach' | 'new' | 'threads' | null;
