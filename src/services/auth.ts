import type { AuthSession } from '../domain/models';

export type LoginInput = {
  identifier: string;
  password: string;
};

export type RegisterInput = {
  identifier: string;
  password: string;
  displayName?: string;
};

export type ResetPasswordInput = {
  identifier: string;
};

export type AuthService = {
  login(input: LoginInput): Promise<AuthSession>;
  register(input: RegisterInput): Promise<AuthSession>;
  requestPasswordReset(input: ResetPasswordInput): Promise<{ sent: boolean }>;
  logout(session: AuthSession): Promise<void>;
};

export function createMockAuthService(): AuthService {
  return {
    async login(input) {
      return createMockSession(input.identifier, 'jason xu');
    },
    async register(input) {
      return createMockSession(input.identifier, input.displayName ?? 'FitMate user');
    },
    async requestPasswordReset() {
      return { sent: true };
    },
    async logout() {
      return undefined;
    },
  };
}

function createMockSession(identifier: string, displayName: string): AuthSession {
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    user: {
      id: 'mock-user-id',
      displayName,
      email: identifier.includes('@') ? identifier : 'jiang@example.com',
      phone: identifier.includes('@') ? undefined : identifier,
    },
  };
}
