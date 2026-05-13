import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Field, Plan, SettingsRow, TopBar } from '../components/ui';
import type { AppDataState, Gender } from '../domain/models';
import type { createAppActions } from '../services/appActions';
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <TopBar title="用户资料" subtitle="身体数据仅用于营养和训练建议" right="X" onRight={close} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.privacyCard}>
          <Text style={styles.h2}>身体数据属于隐私信息</Text>
          <Text style={styles.muted}>这些内容不会出现在公开页面，只用于估算热量、蛋白目标和训练恢复建议。</Text>
        </View>
        <Field label="昵称" value={displayName} onChangeText={setDisplayName} />
        <Field label="电话" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <View style={styles.formGrid}>
          <Field label="年龄" value={age} onChangeText={setAge} keyboardType="numeric" compact />
          <Field label="性别" value={gender} onChangeText={(value) => setGender(toGender(value))} compact />
          <Field label="身高 cm" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" compact />
          <Field label="体重 kg" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" compact />
        </View>
        <Field label="目标" value={goalLabel} onChangeText={setGoalLabel} />
        <Field label="饮食偏好" value={dietPreference} onChangeText={setDietPreference} />
        <Field label="训练频率" value={trainingFrequency} onChangeText={setTrainingFrequency} />
        <Field label="风险提示" value={healthRiskNote} onChangeText={setHealthRiskNote} />
        <Button label={busy ? '保存中...' : '保存修改'} onPress={() => void save()} disabled={busy} />
        {status ? <Text style={styles.formStatus}>{status}</Text> : null}
      </ScrollView>
    </View>
  );
}

function numberOr(fallback: number, value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toGender(value: string): Gender {
  if (value === 'male' || value === '男') {
    return 'male';
  }
  if (value === 'female' || value === '女') {
    return 'female';
  }
  return 'unspecified';
}
