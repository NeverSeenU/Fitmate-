import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native';
import { LoginScreen, RegisterScreen, ForgotScreen, OnboardingScreen, type AuthCredentials } from './screens/AuthScreens';
import { ChatScreen } from './screens/ChatScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { ProfileSheet, SettingsInfoSheet, SettingsSheet, SubscriptionSheet } from './screens/SheetScreens';
import { initialAppState } from './state/appState';
import { createFitMateServices } from './services/apiClient';
import { createAppActions } from './services/appActions';
import { loadAppDataFromBackend } from './services/appBackend';
import { loadFitMateState, saveFitMateState } from './state/persistence';
import { createAsyncStorageStore } from './storage/localStore';
import { runtimeConfig } from './config/env';
import { styles } from './styles';
import type { AppDataState, AuthSession } from './domain/models';
import type { ChatPanel, Screen, Sheet } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [returnPanel, setReturnPanel] = useState<ChatPanel>(null);
  const [appState, setAppStateValue] = useState(initialAppState);
  const appStateRef = useRef<AppDataState>(initialAppState);
  const [authenticated, setAuthenticated] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [persistedSession, setPersistedSession] = useState<AuthSession | null>(null);
  const store = useMemo(() => createAsyncStorageStore(), []);
  const setAppState = useCallback((next: AppDataState | ((state: AppDataState) => AppDataState)) => {
    const resolved = typeof next === 'function' ? next(appStateRef.current) : next;
    appStateRef.current = resolved;
    setAppStateValue(resolved);
  }, []);
  const services = useMemo(
    () => createFitMateServices({
      baseUrl: runtimeConfig.apiBaseUrl,
      useMockApi: runtimeConfig.useMockApi,
      initialAccessToken: persistedSession?.accessToken ?? null,
      onAuthInvalid: () => {
        void store.remove('fitmate.session');
        setPersistedSession(null);
        setAuthenticated(false);
        setAppState(initialAppState);
        setSheet(null);
        setReturnPanel(null);
        setAuthNotice('登录已过期，请重新登录。');
        setScreen('login');
      },
    }),
    [persistedSession?.accessToken, store],
  );
  const actions = useMemo(
    () => createAppActions({
      api: services.api,
      getState: () => appStateRef.current,
      setState: setAppState,
    }),
    [services, setAppState],
  );

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadFitMateState(store);
      if (cancelled) return;
      const threads = saved.conversations ?? initialAppState.threads;
      const activeThreadId = saved.activeThreadId && threads.some((thread) => thread.id === saved.activeThreadId)
        ? saved.activeThreadId
        : threads[0]?.id ?? initialAppState.activeThreadId;
      const activeThread = threads.find((thread) => thread.id === activeThreadId);
      setAppState({
        ...initialAppState,
        ...(saved.profile ? { profile: saved.profile } : {}),
        ...(saved.records ? { records: saved.records } : {}),
        threads,
        activeThreadId,
        chatMessages: activeThread?.messages ?? (saved.conversations ? [] : initialAppState.chatMessages),
      });
      if (saved.session && isSessionFresh(saved.session)) {
        setPersistedSession(saved.session);
        setAuthenticated(true);
        setAuthNotice('');
        setScreen('chat');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    void saveFitMateState(store, appState, persistedSession);
  }, [appState, authenticated, persistedSession, store]);

  useEffect(() => {
    if (!authenticated || !persistedSession || !services.api) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextState = await loadAppDataFromBackend(services.api!, initialAppState);
      if (!cancelled) {
        setAppState(nextState);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, persistedSession, services]);

  const enterApp = async (displayName?: string, email?: string) => {
    if (services.api) {
      setAppState(await loadAppDataFromBackend(services.api, initialAppState));
    } else {
      setAppState({
        ...initialAppState,
        profile: {
          ...initialAppState.profile,
          displayName: displayName ?? initialAppState.profile.displayName,
          email: email ?? initialAppState.profile.email,
        },
      });
    }
    setScreen('chat');
  };

  const handleLogin = async ({ identifier, password }: AuthCredentials) => {
    let session: AuthSession;
    try {
      session = await services.auth.login({ identifier, password });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'invalid_credentials') {
        throw error;
      }
      session = await services.auth.register({
        identifier,
        password,
        displayName: identifier.split('@')[0] || 'FitMate User',
      });
    }
    setAuthenticated(true);
    setPersistedSession(session);
    setAuthNotice('');
    await store.set('fitmate.session', session);
    await enterApp(session.user.displayName, session.user.email);
  };

  const handleRegister = async ({ identifier, password, displayName }: AuthCredentials) => {
    const session = await services.auth.register({
      identifier,
      password,
      displayName: displayName || identifier.split('@')[0] || 'FitMate User',
    });
    setAuthenticated(true);
    setPersistedSession(session);
    setAuthNotice('');
    await store.set('fitmate.session', session);
    await enterApp(session.user.displayName, session.user.email);
  };

  const goAuthenticated = (next: Screen) => {
    if (services.api && !authenticated && (next === 'chat' || next === 'records')) {
      setScreen('login');
      return;
    }
    setScreen(next);
  };

  const openSheet = (nextSheet: Sheet, backPanel: ChatPanel = null) => {
    setReturnPanel(backPanel);
    setSheet(nextSheet);
  };

  const backFromSheet = () => {
    if (sheet === 'profile' || isSettingsInfoSheet(sheet)) {
      setSheet('settings');
      return;
    }
    const panel = returnPanel;
    setSheet(null);
    setReturnPanel(null);
    if (panel) {
      setTimeout(() => setReturnPanel(panel), 0);
    }
  };

  const content = useMemo(() => {
    if (screen === 'login') {
      return (
        <LoginScreen
          go={goAuthenticated}
          onLogin={handleLogin}
          runtimeInfo={authNotice}
        />
      );
    }
    if (screen === 'register') return <RegisterScreen go={goAuthenticated} onRegister={handleRegister} />;
    if (screen === 'forgot') return <ForgotScreen go={goAuthenticated} />;
    if (screen === 'onboarding') return <OnboardingScreen go={goAuthenticated} />;
    if (screen === 'records') {
      return <RecordsScreen go={goAuthenticated} openSheet={(next) => openSheet(next)} appState={appState} actions={actions} />;
    }
    return (
      <ChatScreen
        go={goAuthenticated}
        openSheet={openSheet}
        returnPanel={returnPanel}
        clearReturnPanel={() => setReturnPanel(null)}
        appState={appState}
        actions={actions}
      />
    );
  }, [screen, returnPanel, appState, actions, authenticated]);

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      {content}
      {sheet === 'subscription' && <SubscriptionSheet close={backFromSheet} appState={appState} actions={actions} />}
      {sheet === 'settings' && <SettingsSheet close={backFromSheet} openSheet={setSheet} appState={appState} actions={actions} />}
      {sheet === 'profile' && <ProfileSheet close={backFromSheet} appState={appState} actions={actions} />}
      {isSettingsInfoSheet(sheet) && <SettingsInfoSheet close={backFromSheet} sheet={sheet} appState={appState} />}
    </SafeAreaView>
  );
}

function isSettingsInfoSheet(sheet: Sheet): sheet is Exclude<Sheet, 'subscription' | 'settings' | 'profile' | null> {
  return Boolean(sheet && sheet !== 'subscription' && sheet !== 'settings' && sheet !== 'profile');
}

function isSessionFresh(session: AuthSession) {
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 1000 * 60;
}
