import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native';
import { LoginScreen, RegisterScreen, ForgotScreen, OnboardingScreen, type AuthCredentials } from './screens/AuthScreens';
import { ChatScreen } from './screens/ChatScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { ProfileSheet, SettingsSheet, SubscriptionSheet } from './screens/SheetScreens';
import { initialAppState } from './state/appState';
import { createFitMateServices } from './services/apiClient';
import { createAppActions } from './services/appActions';
import { loadAppDataFromBackend } from './services/appBackend';
import { runtimeConfig } from './config/env';
import { styles } from './styles';
import type { ChatPanel, Screen, Sheet } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [returnPanel, setReturnPanel] = useState<ChatPanel>(null);
  const [appState, setAppState] = useState(initialAppState);
  const [authenticated, setAuthenticated] = useState(false);
  const services = useMemo(
    () => createFitMateServices({
      baseUrl: runtimeConfig.apiBaseUrl,
      useMockApi: runtimeConfig.useMockApi,
    }),
    [],
  );
  const runtimeInfo = runtimeConfig.useMockApi ? 'Local preview mode' : `Backend: ${runtimeConfig.apiBaseUrl}`;
  const actions = useMemo(
    () => createAppActions({
      api: services.api,
      getState: () => appState,
      setState: setAppState,
    }),
    [services, appState],
  );

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
    try {
      const session = await services.auth.login({ identifier, password });
      setAuthenticated(true);
      await enterApp(session.user.displayName, session.user.email);
    } catch (error) {
      const session = await services.auth.register({
        identifier,
        password,
        displayName: identifier.split('@')[0] || 'FitMate User',
      });
      setAuthenticated(true);
      await enterApp(session.user.displayName, session.user.email);
    }
  };

  const handleRegister = async ({ identifier, password, displayName }: AuthCredentials) => {
    const session = await services.auth.register({
      identifier,
      password,
      displayName: displayName || identifier.split('@')[0] || 'FitMate User',
    });
    setAuthenticated(true);
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
    if (sheet === 'profile') {
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
          runtimeInfo={runtimeInfo}
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
        runtimeInfo={runtimeInfo}
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
    </SafeAreaView>
  );
}
