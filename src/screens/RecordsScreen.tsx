import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BottomTabs, Button, Metric, RecordCard, TopBar } from '../components/ui';
import type { AppDataState } from '../domain/models';
import type { createAppActions } from '../services/appActions';
import { styles } from '../styles';
import type { Screen, Sheet } from '../types';

export function RecordsScreen({
  go,
  openSheet,
  appState,
  actions,
}: {
  go: (screen: Screen) => void;
  openSheet: (sheet: Sheet) => void;
  appState: AppDataState;
  actions: ReturnType<typeof createAppActions>;
}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const runCheckin = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setStatus(`${label}中...`);
    try {
      await action();
      setStatus(`${label}完成`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        title="Check-in & Records"
        subtitle="今日状态和自动记录"
        right="*"
        onRight={() => openSheet('subscription')}
        compact
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryBand}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.h2}>今日摄入</Text>
              <Text style={styles.muted}>估算区间，不伪装精确</Text>
            </View>
            <Text style={styles.score}>{appState.dailySummary.calorieRange}</Text>
          </View>
          <View style={styles.metricGrid}>
            <Metric value={appState.dailySummary.proteinFloor} label="蛋白下限" />
            <Metric value={appState.dailySummary.weightKg.toFixed(1)} label="体重 kg" />
            <Metric value={appState.dailySummary.hungerScore} label="饥饿" />
          </View>
        </View>
        <View style={styles.actionGrid}>
          <Button
            label="体重打卡"
            variant="secondary"
            style={styles.actionButton}
            disabled={busy}
            onPress={() => void runCheckin('体重打卡', () => actions.createCheckin({ weightKg: appState.profile.weightKg }))}
          />
          <Button
            label="心情打卡"
            variant="secondary"
            style={styles.actionButton}
            disabled={busy}
            onPress={() => void runCheckin('心情打卡', () => actions.createCheckin({ moodLevel: 6, cravingLevel: 4 }))}
          />
        </View>
        {status ? <Text style={styles.formStatus}>{status}</Text> : null}
        {appState.records.map((record) => (
          <RecordCard
            key={record.id}
            title={record.title}
            status={record.status}
            text={record.text}
            done={record.done}
          />
        ))}
      </ScrollView>
      <BottomTabs active="records" go={go} />
    </View>
  );
}
