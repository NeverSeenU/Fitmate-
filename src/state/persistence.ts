import type { AppDataState, AuthSession, ConversationThread, DailyRecord, UserProfile } from '../domain/models';
import type { LocalStore } from '../storage/localStore';

export type PersistedFitMateState = {
  profile: UserProfile;
  records: DailyRecord[];
  conversations: ConversationThread[];
  activeThreadId: string;
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
    store.set('fitmate.conversations', conversationsForPersistence(state)),
    store.set('fitmate.activeThreadId', state.activeThreadId),
    session ? store.set('fitmate.session', session) : store.remove('fitmate.session'),
  ]);
}

export async function loadFitMateState(store: LocalStore): Promise<Partial<PersistedFitMateState>> {
  const [profile, records, conversations, activeThreadId, session] = await Promise.all([
    store.get<UserProfile>('fitmate.profile'),
    store.get<DailyRecord[]>('fitmate.records'),
    store.get<ConversationThread[]>('fitmate.conversations'),
    store.get<string>('fitmate.activeThreadId'),
    store.get<AuthSession>('fitmate.session'),
  ]);

  return {
    ...(profile ? { profile } : {}),
    ...(records ? { records } : {}),
    ...(conversations ? { conversations } : {}),
    ...(activeThreadId ? { activeThreadId } : {}),
    session,
  };
}

function conversationsForPersistence(state: AppDataState) {
  return state.threads.map((thread) => {
    if (thread.id !== state.activeThreadId) {
      return thread;
    }
    return {
      ...thread,
      messages: state.chatMessages,
      updatedAt: new Date().toISOString(),
    };
  });
}
