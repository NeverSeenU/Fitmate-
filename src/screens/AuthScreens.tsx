import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Back, Brand, Button, Field, LinkButton, Pill, TopBar } from '../components/ui';
import { styles } from '../styles';
import type { Screen } from '../types';

export type AuthCredentials = {
  identifier: string;
  password: string;
  displayName?: string;
};

export function LoginScreen({
  go,
  onLogin,
  runtimeInfo,
}: {
  go: (screen: Screen) => void;
  onLogin: (credentials: AuthCredentials) => Promise<void>;
  runtimeInfo?: string;
}) {
  const [identifier, setIdentifier] = useState('jiang@example.com');
  const [password, setPassword] = useState('fitmate2026');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setStatus('正在登录...');
    try {
      await onLogin({ identifier, password });
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.auth} contentContainerStyle={styles.authScroll}>
      <Brand subtitle="你的专属 AI 营养师、心理支持和朋友" />
      <View style={styles.authHero}>
        <Text style={styles.heroTitle}>你的减脂，不用一个人扛。</Text>
        <Text style={styles.heroSub}>拍照识别饮食，记录训练和体重；嘴馋或崩溃时，它像朋友一样陪你稳住。</Text>
      </View>
      <Field label="手机号 / 邮箱" value={identifier} onChangeText={setIdentifier} keyboardType="email-address" />
      <Field label="密码" value={password} onChangeText={setPassword} secure />
      <Button label={busy ? '登录中...' : '登录'} onPress={submit} disabled={busy} />
      {status ? <Text style={styles.formStatus}>{status}</Text> : null}
      <View style={styles.linkRow}>
        <LinkButton label="注册" onPress={() => go('register')} />
        <LinkButton label="忘记密码" onPress={() => go('forgot')} />
      </View>
      {runtimeInfo ? <Text style={styles.runtimeInfo}>{runtimeInfo}</Text> : null}
      <View style={styles.flex} />
      <View style={styles.authFooter}>
        <Button label="查看首次引导" variant="secondary" onPress={() => go('onboarding')} />
      </View>
    </ScrollView>
  );
}

export function RegisterScreen({
  go,
  onRegister,
}: {
  go: (screen: Screen) => void;
  onRegister: (credentials: AuthCredentials) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState(`fitmate-${Date.now()}@example.com`);
  const [displayName, setDisplayName] = useState('Jason');
  const [password, setPassword] = useState('fitmate2026');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setStatus('正在注册...');
    try {
      await onRegister({ identifier, password, displayName });
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '注册失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.auth} contentContainerStyle={styles.authScroll}>
      <Back onPress={() => go('login')} />
      <Text style={[styles.heroTitle, styles.authTitle]}>创建账号</Text>
      <Field label="手机号 / 邮箱" value={identifier} onChangeText={setIdentifier} keyboardType="email-address" />
      <Field label="昵称" value={displayName} onChangeText={setDisplayName} />
      <Field label="密码" value={password} onChangeText={setPassword} secure />
      <Button label={busy ? '注册中...' : '继续'} onPress={submit} disabled={busy} />
      {status ? <Text style={styles.formStatus}>{status}</Text> : null}
    </ScrollView>
  );
}

export function ForgotScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <ScrollView style={styles.auth} contentContainerStyle={styles.authScroll}>
      <Back onPress={() => go('login')} />
      <Text style={[styles.heroTitle, styles.authTitle]}>重置密码</Text>
      <Field label="手机号 / 邮箱" />
      <Field label="验证码" />
      <Field label="新密码" secure />
      <Button label="完成" onPress={() => go('login')} />
    </ScrollView>
  );
}

export function OnboardingScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <View style={styles.screen}>
      <TopBar title="首次设置" subtitle="只问必要信息" right="✓" onRight={() => go('chat')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formGrid}>
          <Field label="年龄" value="23" compact />
          <Field label="性别" value="女" compact />
          <Field label="身高" value="175 cm" compact />
          <Field label="体重" value="72 kg" compact />
        </View>
        <Field label="目标" value="婚纱减肥 + 塑形" />
        <Field label="饮食偏好" value="辣、重口、但想控油" />
        <Field label="运动基础" value="几乎每天健身房 2 小时" />
        <View style={styles.card}>
          <Pill label="安全筛查" />
          <Text style={styles.muted}>
            孕期、糖尿病、进食障碍、慢病、严重情绪风险会改变建议边界。
          </Text>
        </View>
        <Button label="开始" onPress={() => go('chat')} />
      </ScrollView>
    </View>
  );
}
