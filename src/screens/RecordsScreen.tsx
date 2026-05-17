import { useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BottomTabs, Button, Metric, RecordCard, TopBar } from '../components/ui';
import type { AppDataState, DailyRecord } from '../domain/models';
import type { createAppActions, FoodLogEditInput } from '../services/appActions';
import { styles } from '../styles';
import type { Screen, Sheet } from '../types';

type Panel = 'weight' | 'mood' | 'foodRecord' | 'textRecord' | null;

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
  const [panel, setPanel] = useState<Panel>(null);
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const [weightForm, setWeightForm] = useState({ weightKg: appState.dailySummary.weightKg.toFixed(1), notes: '' });
  const [moodForm, setMoodForm] = useState({ moodLevel: '6', hungerLevel: '5', cravingLevel: '4', notes: '' });
  const [foodForm, setFoodForm] = useState(recordToFoodForm(null));
  const [textForm, setTextForm] = useState({ title: '', detail: '' });
  const intake = useMemo(() => summarizeFoodIntake(appState.records), [appState.records]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setStatus(`${label}中...`);
    try {
      await action();
      setStatus(`${label}完成`);
      setPanel(null);
      setEditingRecord(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  };

  const openRecordEditor = (record: DailyRecord) => {
    setEditingRecord(record);
    if (record.kind === 'food') {
      setFoodForm(recordToFoodForm(record));
      setPanel('foodRecord');
      return;
    }
    setTextForm({ title: record.title, detail: record.detail ?? record.text });
    setPanel('textRecord');
  };

  return (
    <View style={styles.screen}>
      <TopBar
        title="Check-in & Records"
        subtitle="今日状态和自动记录"
        right="Pro"
        rightVariant="subscribe"
        onRight={() => openSheet('subscription')}
        compact
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryBand}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.h2}>今日摄入</Text>
              <Text style={styles.muted}>读取已确认食物记录，随编辑实时变化</Text>
            </View>
            <Text style={styles.score}>{intake.caloriesKcal} kcal</Text>
          </View>
          <View style={styles.metricGrid}>
            <Metric value={`${intake.proteinG}g`} label="蛋白" />
            <Metric value={`${intake.carbsG}g`} label="碳水" />
            <Metric value={`${intake.fatG}g`} label="脂肪" />
          </View>
          <View style={styles.metricGrid}>
            <Metric value={appState.dailySummary.weightKg.toFixed(1)} label="体重 kg" />
            <Metric value={appState.dailySummary.hungerScore} label="饥饿" />
            <Metric value={String(intake.count)} label="食物条目" />
          </View>
        </View>
        <View style={styles.actionGrid}>
          <Button
            label="体重打卡"
            variant="secondary"
            style={styles.actionButton}
            disabled={busy}
            onPress={() => {
              setWeightForm({ weightKg: appState.dailySummary.weightKg.toFixed(1), notes: '' });
              setPanel('weight');
            }}
          />
          <Button
            label="心情日记"
            variant="secondary"
            style={styles.actionButton}
            disabled={busy}
            onPress={() => {
              setMoodForm({ moodLevel: '6', hungerLevel: '5', cravingLevel: '4', notes: '' });
              setPanel('mood');
            }}
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
            onEdit={() => openRecordEditor(record)}
            onDelete={() => void runAction('删除记录', () => actions.deleteRecord(record.id))}
          />
        ))}
      </ScrollView>
      <BottomTabs active="records" go={go} />
      {panel === 'weight' ? (
        <EditorSheet title="体重打卡" subtitle="记录今天的真实体重和备注" onClose={() => setPanel(null)}>
          <NumberField label="今日体重 kg" value={weightForm.weightKg} onChangeText={(value) => setWeightForm({ ...weightForm, weightKg: value })} />
          <TextArea label="备注" value={weightForm.notes} onChangeText={(value) => setWeightForm({ ...weightForm, notes: value })} placeholder="例如：早上空腹、训练后、经期水肿等。" />
          <View style={styles.editorFooter}>
            <Button label="取消" variant="secondary" onPress={() => setPanel(null)} disabled={busy} style={styles.actionButton} />
            <Button
              label={busy ? '保存中...' : '保存体重'}
              disabled={busy}
              onPress={() => void runAction('体重打卡', () => actions.createCheckin({
                weightKg: parsePositiveNumber(weightForm.weightKg),
                notes: weightForm.notes.trim(),
              }))}
              style={styles.actionButton}
            />
          </View>
        </EditorSheet>
      ) : null}
      {panel === 'mood' ? (
        <EditorSheet title="心情日记" subtitle="像每日复盘一样记录情绪、饥饿和嘴馋" onClose={() => setPanel(null)}>
          <View style={styles.formGrid}>
            <NumberField label="心情 1-10" value={moodForm.moodLevel} onChangeText={(value) => setMoodForm({ ...moodForm, moodLevel: value })} />
            <NumberField label="饥饿 1-10" value={moodForm.hungerLevel} onChangeText={(value) => setMoodForm({ ...moodForm, hungerLevel: value })} />
            <NumberField label="嘴馋 1-10" value={moodForm.cravingLevel} onChangeText={(value) => setMoodForm({ ...moodForm, cravingLevel: value })} />
          </View>
          <TextArea label="今日详细内容" value={moodForm.notes} onChangeText={(value) => setMoodForm({ ...moodForm, notes: value })} placeholder="写下今天为什么开心、焦虑、饿、嘴馋，或者哪里做得不错。" />
          <View style={styles.editorFooter}>
            <Button label="取消" variant="secondary" onPress={() => setPanel(null)} disabled={busy} style={styles.actionButton} />
            <Button
              label={busy ? '保存中...' : '保存日记'}
              disabled={busy}
              onPress={() => void runAction('心情日记', () => actions.createCheckin({
                moodLevel: clampScore(moodForm.moodLevel),
                hungerLevel: clampScore(moodForm.hungerLevel),
                cravingLevel: clampScore(moodForm.cravingLevel),
                notes: moodForm.notes.trim(),
              }))}
              style={styles.actionButton}
            />
          </View>
        </EditorSheet>
      ) : null}
      {panel === 'foodRecord' ? (
        <FoodRecordEditor
          form={foodForm}
          setForm={setFoodForm}
          busy={busy}
          onClose={() => setPanel(null)}
          onSave={() => {
            if (!editingRecord) return;
            void runAction('编辑食物记录', () => actions.updateRecord(editingRecord.id, formToFoodInput(foodForm)));
          }}
        />
      ) : null}
      {panel === 'textRecord' ? (
        <EditorSheet title="编辑记录" subtitle="修改这条记录的标题和内容" onClose={() => setPanel(null)}>
          <TextInput style={styles.input} value={textForm.title} onChangeText={(value) => setTextForm({ ...textForm, title: value })} placeholder="标题" placeholderTextColor="#777" />
          <TextArea label="内容" value={textForm.detail} onChangeText={(value) => setTextForm({ ...textForm, detail: value })} placeholder="记录详情" />
          <View style={styles.editorFooter}>
            <Button label="取消" variant="secondary" onPress={() => setPanel(null)} disabled={busy} style={styles.actionButton} />
            <Button
              label={busy ? '保存中...' : '保存修改'}
              disabled={busy}
              onPress={() => {
                if (!editingRecord) return;
                void runAction('编辑记录', () => actions.updateRecord(editingRecord.id, {
                  title: textForm.title.trim(),
                  detail: textForm.detail.trim(),
                }));
              }}
              style={styles.actionButton}
            />
          </View>
        </EditorSheet>
      ) : null}
    </View>
  );
}

function EditorSheet({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        <Pressable style={styles.miniClose} onPress={onClose}>
          <Text style={styles.iconText}>X</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FoodForm = {
  title: string;
  caloriesKcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  detail: string;
};

function FoodRecordEditor({
  form,
  setForm,
  busy,
  onClose,
  onSave,
}: {
  form: FoodForm;
  setForm: (form: FoodForm) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const update = (key: keyof FoodForm, value: string) => setForm({ ...form, [key]: value });
  return (
    <EditorSheet title="编辑食物记录" subtitle="修正营养和详细摄入内容" onClose={onClose}>
      <TextInput style={styles.input} value={form.title} onChangeText={(value) => update('title', value)} placeholder="食物名称" placeholderTextColor="#777" />
      <View style={styles.formGrid}>
        <NumberField label="热量 kcal" value={form.caloriesKcal} onChangeText={(value) => update('caloriesKcal', value)} />
        <NumberField label="蛋白 g" value={form.proteinG} onChangeText={(value) => update('proteinG', value)} />
        <NumberField label="碳水 g" value={form.carbsG} onChangeText={(value) => update('carbsG', value)} />
        <NumberField label="脂肪 g" value={form.fatG} onChangeText={(value) => update('fatG', value)} />
      </View>
      <TextArea label="详细内容" value={form.detail} onChangeText={(value) => update('detail', value)} placeholder="写清楚吃了什么、份量、酱料、剩了多少。" />
      <View style={styles.editorFooter}>
        <Button label="取消" variant="secondary" onPress={onClose} disabled={busy} style={styles.actionButton} />
        <Button label={busy ? '保存中...' : '保存修改'} onPress={onSave} disabled={busy} style={styles.actionButton} />
      </View>
    </EditorSheet>
  );
}

function NumberField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.compactField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType="numeric" placeholder="0" placeholderTextColor="#777" />
    </View>
  );
}

function TextArea({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, styles.detailInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#777"
        multiline
      />
    </View>
  );
}

function summarizeFoodIntake(records: DailyRecord[]) {
  return records
    .filter((record) => record.kind === 'food' && record.done)
    .reduce((summary, record) => ({
      count: summary.count + 1,
      caloriesKcal: summary.caloriesKcal + (record.caloriesKcal ?? 0),
      proteinG: summary.proteinG + (record.proteinG ?? 0),
      carbsG: summary.carbsG + (record.carbsG ?? 0),
      fatG: summary.fatG + (record.fatG ?? 0),
    }), { count: 0, caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

function recordToFoodForm(record: DailyRecord | null): FoodForm {
  return {
    title: record?.title ?? '',
    caloriesKcal: String(record?.caloriesKcal ?? 0),
    proteinG: String(record?.proteinG ?? 0),
    carbsG: String(record?.carbsG ?? 0),
    fatG: String(record?.fatG ?? 0),
    detail: record?.detail ?? '',
  };
}

function formToFoodInput(form: FoodForm): FoodLogEditInput {
  return {
    title: form.title.trim(),
    caloriesKcal: parsePositiveNumber(form.caloriesKcal),
    proteinG: parsePositiveNumber(form.proteinG),
    carbsG: parsePositiveNumber(form.carbsG),
    fatG: parsePositiveNumber(form.fatG),
    detail: form.detail.trim(),
  };
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function clampScore(value: string) {
  return Math.min(10, Math.max(1, parsePositiveNumber(value)));
}
