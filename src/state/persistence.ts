import type { AppDataState, AuthSession, ConversationThread, DailyRecord, UserProfile } from '../domain/models';
import type { LocalStore } from '../storage/localStore';

export type PersistedFitMateState = {
  profile: UserProfile;
  records: DailyRecord[];
  conversations: ConversationThread[];
  session: AuthSession | null;
};

export async function saveFitMateState(
  store: LocalStore,
  state: AppDataState,
  session: AuthSession | null,
) {
  await Promise.all([
    store.set('fitmate.profile', state.profile),
    store.set('fitmate.records', state.records),
    store.set('fitmate.conversations', state.threads),
    session ? store.set('fitmate.session', session) : store.remove('fitmate.session'),
  ]);
}

export async function loadFitMateState(store: LocalStore): Promise<Partial<PersistedFitMateState>> {
  const [profile, records, conversations, session] = await Promise.all([
    store.get<UserProfile>('fitmate.profile'),
    store.get<DailyRecord[]>('fitmate.records'),
    store.get<ConversationThread[]>('fitmate.conversations'),
    store.get<AuthSession>('fitmate.session'),
  ]);

  return {
    ...(profile ? { profile } : {}),
    ...(records ? { records } : {}),
    ...(conversations ? { conversations } : {}),
    session,
  };
}
