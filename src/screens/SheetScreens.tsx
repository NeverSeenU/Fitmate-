import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Field, Plan, SettingsRow, TopBar } from '../components/ui';
import type { AppDataState, Gender } from '../domain/models';
import type { createAppActions } from '../services/appActions';
import { ACTIVITY_LEVELS } from '../services/energyTargets';
import { styles } from '../styles';
import type { Sheet } from '../types';

export function SubscriptionSheet({
  close,
  appState,
  actions,
}: {
  close: () => void;
  appState: AppDataState;
  actions?: ReturnType<typeof createAppActions>;
}) {
  const [status, setStatus] = useState('');
  const [busyTier, setBusyTier] = useState<string | null>(null);

  const selectPlan = async (tier: string) => {
    if (!actions) {
      return;
    }
    setBusyTier(tier);
    setStatus('正在恢复订阅...');
    try {
      await actions.restoreSubscription(`fitmate.${tier}.monthly`, 'dev-receipt');
      setStatus('订阅已更新');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '订阅更新失败');
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <View style={styles.sheet}>
      <TopBar title="订阅" subtitle="大量使用 · 优先分析" right="X" onRight={close} />
      <ScrollView contentContainerStyle={styles.content}>
        {appState.plans.map((plan) => (
          <Plan
            key={plan.tier}
            tier={plan.tier}
            title={plan.title}
            price={plan.price}
            featured={plan.featured}
            selected={appState.entitlements.tier === plan.tier}
            features={plan.features}
            onSelect={() => void selectPlan(plan.tier)}
          />
        ))}
        {status ? <Text style={styles.formStatus}>{busyTier ? `${status} ${busyTier}` : status}</Text> : null}
      </ScrollView>
    </View>
  );
}

export function SettingsSheet({
  close,
  openSheet,
  appState,
  actions,
}: {
  close: () => void;
  openSheet: (sheet: Sheet) => void;
  appState: AppDataState;
  actions: ReturnType<typeof createAppActions>;
}) {
  const [status, setStatus] = useState('');
  const { profile, entitlements } = appState;
  const currentPlan = appState.plans.find((plan) => plan.tier === entitlements.tier);

  const restore = async () => {
    setStatus('正在恢复购买...');
    try {
      await actions.restoreSubscription('fitmate.pro.monthly', 'dev-receipt');
      setStatus('恢复购买完成');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复购买失败');
    }
  };

  return (
    <View style={styles.sheet}>
      <TopBar title="设置" subtitle="账号、隐私和安全" right="X" onRight={close} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.settingsProfile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.avatarInitial}</Text>
          </View>
          <Text style={styles.h2}>{profile.displayName}</Text>
          <Text style={styles.muted}>{profile.email}</Text>
          <Button label="编辑个人资料" variant="secondary" onPress={() => openSheet('profile')} />
        </View>

        {status ? <Text style={styles.formStatus}>{status}</Text> : null}

        <Text style={styles.sectionLabel}>账号</Text>
        <SettingsRow icon="@" label="电子邮件" value={profile.email} />
        <SettingsRow icon="#" label="电话号码" value={profile.phone} />
        <SettingsRow icon="+" label="订阅" value={`${currentPlan?.title ?? 'Free'} ${currentPlan?.price ?? '¥0'}`} />
        <SettingsRow icon="R" label="恢复购买" onPress={() => void restore()} />

        <Text style={styles.sectionLabel}>身体资料</Text>
        <SettingsRow icon="O" label="用户资料" value="身高、体重、目标、偏好" onPress={() => openSheet('profile')} />
        <SettingsRow icon="H" label="健康与安全信息" value="隐私数据" />

        <Text style={styles.sectionLabel}>应用</Text>
        <SettingsRow icon="G" label="应用语言" value="中文" />
        <SettingsRow icon="D" label="外观" value="深色" />
        <SettingsRow icon="N" label="通知提醒" value="可配置" />
        <SettingsRow icon="P" label="个性化" value="饮食偏好和语气" />

        <Text style={styles.sectionLabel}>隐私和安全</Text>
        <SettingsRow icon="[]" label="数据控制" value="照片、记录和记忆" />
        <SettingsRow icon="X" label="删除照片和记录" onPress={() => void actions.deletePhotos()} />
        <SettingsRow icon="!" label="安全免责声明" />

        <Text style={styles.sectionLabel}>关于</Text>
        <SettingsRow icon="?" label="帮助中心" />
        <SettingsRow icon="B" label="报告错误" />
        <SettingsRow icon="S" label="使用条款" />
        <SettingsRow icon="L" label="隐私政策" />
        <SettingsRow icon="i" label="iOS 版 FitMate AI" value="0.1.0" />
        <SettingsRow icon="<" label="退出登录" />
        <SettingsRow icon="-" label="删除账号" danger onPress={() => void actions.deleteAccount()} />
      </ScrollView>
    </View>
  );
}

export function ProfileSheet({
  close,
  appState,
  actions,
}: {
  close: () => void;
  appState: AppDataState;
  actions: ReturnType<typeof createAppActions>;
}) {
  const { profile } = appState;
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone);
  const [age, setAge] = useState(String(profile.age));
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [weightKg, setWeightKg] = useState(String(profile.weightKg));
  const [goalLabel, setGoalLabel] = useState(profile.goalLabel);
  const [dietPreference, setDietPreference] = useState(profile.dietPreference);
  const [trainingFrequency, setTrainingFrequency] = useState(profile.trainingFrequency);
  const [healthRiskNote, setHealthRiskNote] = useState(profile.healthRiskNote);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const draft = useMemo(() => ({
    displayName,
    phone,
    age,
    gender,
    heightCm,
    weightKg,
    goalLabel,
    dietPreference,
    trainingFrequency,
    healthRiskNote,
  }), [age, dietPreference, displayName, gender, goalLabel, healthRiskNote, heightCm, phone, trainingFrequency, weightKg]);

  const hasChanges = useMemo(() => (
    draft.displayName !== profile.displayName ||
    draft.phone !== profile.phone ||
    draft.age !== String(profile.age) ||
    draft.gender !== profile.gender ||
    draft.heightCm !== String(profile.heightCm) ||
    draft.weightKg !== String(profile.weightKg) ||
    draft.goalLabel !== profile.goalLabel ||
    draft.dietPreference !== profile.dietPreference ||
    draft.trainingFrequency !== profile.trainingFrequency ||
    draft.healthRiskNote !== profile.healthRiskNote
  ), [draft, profile]);

  const save = async () => {
    setBusy(true);
    setStatus('正在保存...');
    try {
      await actions.updateProfile({
        displayName,
        phone,
        age: numberOr(profile.age, age),
        gender,
        heightCm: numberOr(profile.heightCm, heightCm),
        weightKg: numberOr(profile.weightKg, weightKg),
        goalLabel,
        dietPreference,
        trainingFrequency,
        healthRiskNote,
      });
      setStatus('资料已保存');
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    if (busy) return;
    if (hasChanges) {
      setShowUnsavedPrompt(true);
      return;
    }
    close();
  };

  const saveAndClose = async () => {
    const saved = await save();
    if (saved) {
      setShowUnsavedPrompt(false);
      close();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.sheet}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <TopBar title="用户资料" subtitle="身体数据仅用于营养和训练建议" right="X" onRight={requestClose} />
      <ScrollView contentContainerStyle={styles.keyboardContent} keyboardShouldPersistTaps="handled">
        <View style={styles.privacyCard}>
          <Text style={styles.h2}>身体数据属于隐私信息</Text>
          <Text style={styles.muted}>这些内容不会出现在公开页面，只用于估算热量、蛋白目标和训练恢复建议。</Text>
        </View>
        <Field label="昵称" value={displayName} onChangeText={setDisplayName} />
        <Field label="电话" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View style={styles.formGrid}>
          <Field label="年龄" value={age} onChangeText={setAge} keyboardType="numeric" compact />
          <GenderSegment value={gender} setValue={setGender} />
          <Field label="身高 cm" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" compact />
          <Field label="体重 kg" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" compact />
        </View>
        <Field label="目标" value={goalLabel} onChangeText={setGoalLabel} />
        <ActivityLevelPicker value={trainingFrequency} setValue={setTrainingFrequency} />
        <Field label="风险提示" value={healthRiskNote} onChangeText={setHealthRiskNote} />
        <Button label={busy ? '保存中...' : '保存修改'} onPress={() => void save()} disabled={busy} />
        {status ? <Text style={styles.formStatus}>{status}</Text> : null}
      </ScrollView>
      {showUnsavedPrompt ? (
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{'\u6709\u672a\u4fdd\u5b58\u7684\u6539\u52a8'}</Text>
            <Text style={styles.confirmText}>{'\u4f60\u521a\u521a\u4fee\u6539\u4e86\u7528\u6237\u8d44\u6599\uff0c\u9000\u51fa\u524d\u8981\u4fdd\u5b58\u5417\uff1f'}</Text>
            <View style={styles.confirmActions}>
              <Button
                label={'\u653e\u5f03'}
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  setShowUnsavedPrompt(false);
                  close();
                }}
                style={styles.actionButton}
              />
              <Button
                label={'\u7ee7\u7eed\u7f16\u8f91'}
                variant="secondary"
                disabled={busy}
                onPress={() => setShowUnsavedPrompt(false)}
                style={styles.actionButton}
              />
            </View>
            <Button label={busy ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u5e76\u9000\u51fa'} disabled={busy} onPress={() => void saveAndClose()} />
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function GenderSegment({ value, setValue }: { value: Gender; setValue: (value: Gender) => void }) {
  return (
    <View style={[styles.field, styles.compactField]}>
      <Text style={styles.label}>性别</Text>
      <View style={styles.segmentedControl}>
        <Pressable
          style={[styles.segmentOption, value === 'male' && styles.segmentOptionActive]}
          onPress={() => setValue('male')}
        >
          <Text style={[styles.segmentText, value === 'male' && styles.segmentTextActive]}>男</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentOption, value === 'female' && styles.segmentOptionActive]}
          onPress={() => setValue('female')}
        >
          <Text style={[styles.segmentText, value === 'female' && styles.segmentTextActive]}>女</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActivityLevelPicker({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  const selected = activityLevelValue(value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>活动水平</Text>
      <View style={styles.activityGrid}>
        {ACTIVITY_LEVELS.map((level) => (
          <Pressable
            key={level.value}
            style={[styles.activityOption, selected === level.value && styles.activityOptionActive]}
            onPress={() => setValue(level.value)}
          >
            <Text style={[styles.activityOptionText, selected === level.value && styles.activityOptionTextActive]}>{level.label}</Text>
            <Text style={[styles.activityOptionMeta, selected === level.value && styles.activityOptionMetaActive]}>{level.factor}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function activityLevelValue(value: string) {
  const lower = value.toLowerCase();
  if (ACTIVITY_LEVELS.some((level) => level.value === lower)) return lower;
  if (lower.includes('extra')) return 'extra_active';
  if (lower.includes('daily') || lower.includes('very') || lower.includes('6') || lower.includes('7')) return 'very_active';
  if (lower.includes('moderate') || lower.includes('4') || lower.includes('5')) return 'moderately_active';
  if (lower.includes('light') || lower.includes('1') || lower.includes('2') || lower.includes('3')) return 'lightly_active';
  if (lower.includes('sedentary')) return 'sedentary';
  return 'lightly_active';
}

function numberOr(fallback: number, value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
