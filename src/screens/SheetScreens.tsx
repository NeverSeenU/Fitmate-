import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Field, Plan, SettingsRow, TopBar } from '../components/ui';
import type { AppDataState, Gender } from '../domain/models';
import type { createAppActions } from '../services/appActions';
import { ACTIVITY_LEVELS } from '../services/energyTargets';
import { styles } from '../styles';
import type { Sheet } from '../types';

type SettingsInfoSheetId = Exclude<Sheet, 'subscription' | 'settings' | 'profile' | null>;
type DangerAction = 'deletePhotos' | 'deleteAccount';

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
  const [confirmAction, setConfirmAction] = useState<DangerAction | null>(null);
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

  const runDangerAction = async () => {
    if (!confirmAction) return;
    const nextAction = confirmAction;
    setConfirmAction(null);
    setStatus(nextAction === 'deletePhotos' ? '正在删除照片和记录...' : '正在删除账号...');
    try {
      if (nextAction === 'deletePhotos') {
        await actions.deletePhotos();
        setStatus('照片和记录已删除');
      } else {
        await actions.deleteAccount();
        setStatus('账号删除请求已执行');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '操作失败');
    }
  };

  const showComingSoon = (label: string) => {
    setStatus(`${label} 会在账号模块接入后连接真实服务，当前已加入 P2-2 建设范围。`);
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
        <SettingsRow icon="@" label="电子邮件" value={profile.email} onPress={() => openSheet('accountInfo')} />
        <SettingsRow icon="#" label="电话号码" value={profile.phone} onPress={() => openSheet('accountInfo')} />
        <SettingsRow icon="+" label="订阅" value={`${currentPlan?.title ?? 'Free'} ${currentPlan?.price ?? '¥0'}`} onPress={() => openSheet('subscription')} />
        <SettingsRow icon="R" label="恢复购买" onPress={() => void restore()} />

        <Text style={styles.sectionLabel}>身体资料</Text>
        <SettingsRow icon="O" label="用户资料" value="身高、体重、目标、偏好" onPress={() => openSheet('profile')} />
        <SettingsRow icon="H" label="健康与安全信息" value="隐私数据" onPress={() => openSheet('healthSafety')} />

        <Text style={styles.sectionLabel}>应用</Text>
        <SettingsRow icon="G" label="应用语言" value="中文" onPress={() => openSheet('appLanguage')} />
        <SettingsRow icon="D" label="外观" value="深色" onPress={() => openSheet('appearance')} />
        <SettingsRow icon="N" label="通知提醒" value="可配置" onPress={() => openSheet('notifications')} />
        <SettingsRow icon="P" label="个性化" value="饮食偏好和语气" onPress={() => openSheet('personalization')} />

        <Text style={styles.sectionLabel}>隐私和安全</Text>
        <SettingsRow icon="[]" label="数据控制" value="照片、记录和记忆" onPress={() => openSheet('dataControl')} />
        <SettingsRow icon="X" label="删除照片和记录" onPress={() => setConfirmAction('deletePhotos')} />
        <SettingsRow icon="!" label="安全免责声明" onPress={() => openSheet('safetyDisclaimer')} />

        <Text style={styles.sectionLabel}>关于</Text>
        <SettingsRow icon="?" label="帮助中心" onPress={() => openSheet('helpCenter')} />
        <SettingsRow icon="B" label="报告错误" onPress={() => openSheet('bugReport')} />
        <SettingsRow icon="S" label="使用条款" onPress={() => openSheet('terms')} />
        <SettingsRow icon="L" label="隐私政策" onPress={() => openSheet('privacyPolicy')} />
        <SettingsRow icon="i" label="iOS 版 FitMate AI" value="0.1.0" onPress={() => openSheet('appVersion')} />
        <SettingsRow icon="<" label="退出登录" onPress={() => showComingSoon('退出登录')} />
        <SettingsRow icon="-" label="删除账号" danger onPress={() => setConfirmAction('deleteAccount')} />
      </ScrollView>
      {confirmAction ? (
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{confirmAction === 'deletePhotos' ? '确认删除照片和记录？' : '确认删除账号？'}</Text>
            <Text style={styles.confirmText}>
              {confirmAction === 'deletePhotos'
                ? '这个操作会清理当前设备中的照片识别结果、记录和相关缓存。'
                : '这个操作会清理当前账号数据。正式发布前还会接入后端二次验证。'}
            </Text>
            <View style={styles.confirmActions}>
              <Button label="取消" variant="secondary" onPress={() => setConfirmAction(null)} style={styles.actionButton} />
              <Button label={confirmAction === 'deletePhotos' ? '确认删除' : '删除账号'} onPress={() => void runDangerAction()} style={styles.actionButton} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SettingsInfoSheet({
  close,
  sheet,
  appState,
}: {
  close: () => void;
  sheet: SettingsInfoSheetId;
  appState: AppDataState;
}) {
  const page = settingsInfoPage(sheet, appState);
  return (
    <View style={styles.sheet}>
      <TopBar title={page.title} subtitle={page.subtitle} right="X" onRight={close} />
      <ScrollView contentContainerStyle={styles.content}>
        {page.sections.map((section) => (
          <View key={section.title} style={styles.privacyCard}>
            <Text style={styles.h2}>{section.title}</Text>
            {section.lines.map((line) => (
              <Text key={line} style={styles.muted}>{line}</Text>
            ))}
          </View>
        ))}
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

function settingsInfoPage(sheet: SettingsInfoSheetId, appState: AppDataState) {
  const { profile, entitlements } = appState;
  const currentPlan = appState.plans.find((plan) => plan.tier === entitlements.tier);
  const pages: Record<SettingsInfoSheetId, { title: string; subtitle: string; sections: Array<{ title: string; lines: string[] }> }> = {
    accountInfo: {
      title: '账号信息',
      subtitle: '登录身份和订阅状态',
      sections: [
        { title: '联系方式', lines: [`邮箱：${profile.email}`, `电话：${profile.phone || '未填写'}`] },
        { title: '订阅', lines: [`当前方案：${currentPlan?.title ?? 'Free'} ${currentPlan?.price ?? '¥0'}`, `模型优先级：${entitlements.preferredVisionProvider}`] },
      ],
    },
    healthSafety: {
      title: '健康与安全信息',
      subtitle: '用于个性化建议的敏感资料',
      sections: [
        { title: '当前资料', lines: [`年龄 ${profile.age}，身高 ${profile.heightCm} cm，体重 ${profile.weightKg} kg`, `目标：${profile.goalLabel}`, `风险提示：${profile.healthRiskNote}`] },
        { title: '使用边界', lines: ['FitMate 用这些信息估算热量、蛋白目标和训练恢复建议，不替代医生、营养师或心理治疗。'] },
      ],
    },
    appLanguage: {
      title: '应用语言',
      subtitle: '当前使用中文',
      sections: [
        { title: '语言', lines: ['当前界面和 AI 回复优先使用中文。后续会接入中英文切换和跟随系统语言。'] },
      ],
    },
    appearance: {
      title: '外观',
      subtitle: '深色高级教练风格',
      sections: [
        { title: '主题', lines: ['当前固定为深色模式，方便照片记录、夜间训练和手机真机测试。浅色模式列入后续 P2。'] },
      ],
    },
    notifications: {
      title: '通知提醒',
      subtitle: '打卡、复盘和恢复提醒',
      sections: [
        { title: '计划中', lines: ['将支持体重打卡、喝水、训练后补蛋白、晚间总结和连续记录提醒。'] },
      ],
    },
    personalization: {
      title: '个性化',
      subtitle: '饮食偏好、语气和记忆',
      sections: [
        { title: '当前偏好', lines: [`饮食偏好：${profile.dietPreference}`, `目标：${profile.goalLabel}`] },
        { title: '下一步', lines: ['会把 Soul.md 角色规则、食物偏好、训练习惯和历史反馈合并到 AI 回复中。'] },
      ],
    },
    dataControl: {
      title: '数据控制',
      subtitle: '照片、记录、聊天和记忆',
      sections: [
        { title: '当前存储', lines: ['聊天线程、Records 和用户资料会保存在本地；已登录时也会同步到后端。'] },
        { title: '后续能力', lines: ['导出数据、清空聊天、删除照片缓存、删除账号会逐步接入后端确认流程。'] },
      ],
    },
    safetyDisclaimer: {
      title: '安全免责声明',
      subtitle: 'FitMate 不是医疗诊断',
      sections: [
        { title: '重要说明', lines: ['FitMate 提供健身、饮食和情绪支持建议，不提供医疗诊断。严重不适、进食障碍、怀孕、慢性病或药物相关问题请咨询专业人士。'] },
        { title: '紧急情况', lines: ['如果出现自伤风险、胸痛、昏厥、严重过敏或其他紧急状况，请立即联系当地急救服务。'] },
      ],
    },
    helpCenter: {
      title: '帮助中心',
      subtitle: '核心使用方式',
      sections: [
        { title: 'AI Chat', lines: ['可以发送文字、食物照片、文件和运动记录。照片或文件会生成待确认卡片，确认后写入 Records。'] },
        { title: 'Records', lines: ['记录页汇总今日摄入、营养进度、体重、运动和晚间总结。'] },
      ],
    },
    bugReport: {
      title: '报告错误',
      subtitle: '给开发团队的有效反馈',
      sections: [
        { title: '请提供', lines: ['截图、发生时间、你点了什么、预期结果和实际结果。后续会接入应用内提交 issue。'] },
      ],
    },
    terms: {
      title: '使用条款',
      subtitle: '开发版占位条款',
      sections: [
        { title: '开发阶段', lines: ['当前条款用于内部测试，不是正式上线法律文本。正式发布前需要补齐账户、订阅、AI 输出责任和退款规则。'] },
      ],
    },
    privacyPolicy: {
      title: '隐私政策',
      subtitle: '开发版隐私说明',
      sections: [
        { title: '数据用途', lines: ['照片、文件、体重、饮食和训练记录只用于生成个性化分析、每日目标和历史趋势。'] },
        { title: '正式发布前', lines: ['需要明确第三方 AI provider、数据保留周期、删除流程、导出流程和地区合规文本。'] },
      ],
    },
    appVersion: {
      title: 'FitMate AI',
      subtitle: 'iOS 开发版 0.1.0',
      sections: [
        { title: '版本', lines: ['当前为 Expo Go / 本地后端开发版本。核心目标是 AI 健身减肥心灵朋友。'] },
      ],
    },
  };
  return pages[sheet];
}

function numberOr(fallback: number, value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
