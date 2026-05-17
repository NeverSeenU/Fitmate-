import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../components/ui';
import type { ConversationThread, UserProfile } from '../domain/models';
import { styles } from '../styles';

export function AttachmentPanel({
  close,
  takeFoodPhoto,
  chooseFoodPhoto,
  startFoodRecord,
  openFile,
  createCheckin,
  sendWorkout,
}: {
  close: () => void;
  takeFoodPhoto?: () => void;
  chooseFoodPhoto?: () => void;
  startFoodRecord?: () => void;
  openFile?: () => void;
  createCheckin?: () => void;
  sendWorkout?: () => void;
}) {
  return (
    <BottomPanel close={close} title="添加内容">
      <View style={styles.panelGrid}>
        <PanelAction label="食物照片" hint="拍照估算热量和营养" onPress={takeFoodPhoto} />
        <PanelAction label="相册图片" hint="上传已有餐食照片" onPress={chooseFoodPhoto} />
        <PanelAction label="文件" hint="体检、计划、菜单" onPress={openFile} />
        <PanelAction label="运动记录" hint="时长、强度、消耗" onPress={sendWorkout} />
        <PanelAction label="食物记录" hint="手动输入食物和份量" onPress={startFoodRecord} />
        <PanelAction label="体重打卡" hint="同步到记录页" onPress={createCheckin} />
      </View>
    </BottomPanel>
  );
}

export function NewChatPanel({
  close,
  createThread,
}: {
  close: () => void;
  createThread?: (title: string, kind?: string) => Promise<void>;
}) {
  const openThread = (title: string, kind: string) => {
    void createThread?.(title, kind);
    close();
  };

  return (
    <BottomPanel close={close} title="新对话">
      <View style={styles.panelGrid}>
        <PanelAction label="今日饮食分析" hint="照片、份量、下一餐策略" onPress={() => openThread('今日饮食分析', 'food')} />
        <PanelAction label="训练后恢复" hint="补蛋白、饥饿、睡眠" onPress={() => openThread('训练后恢复', 'workout')} />
        <PanelAction label="嘴馋崩溃支持" hint="先稳情绪再给替代方案" onPress={() => openThread('嘴馋支持', 'craving')} />
        <PanelAction label="婚纱塑形计划" hint="阶段目标和每周调整" onPress={() => openThread('婚纱塑形计划', 'plan')} />
      </View>
      <Button label="开启空白对话" onPress={() => openThread('新对话', 'general')} />
    </BottomPanel>
  );
}

export function ThreadDrawer({
  close,
  openUser,
  openNewChat,
  profile,
  threads,
}: {
  close: () => void;
  openUser: () => void;
  openNewChat: () => void;
  profile: UserProfile;
  threads: ConversationThread[];
}) {
  return (
    <View style={styles.drawerOverlay}>
      <Pressable style={styles.drawerScrim} onPress={close} />
      <View style={styles.threadDrawer}>
        <View style={styles.drawerHeader}>
          <Text style={styles.h2}>所有对话</Text>
          <Pressable style={styles.miniClose} onPress={close}>
            <Text style={styles.iconText}>X</Text>
          </Pressable>
        </View>
        <Pressable style={styles.userMenuCard} onPress={openUser}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{profile.avatarInitial}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.bodyStrong}>用户页面</Text>
            <Text style={styles.muted}>资料、订阅、设置和隐私</Text>
          </View>
        </Pressable>
        {threads.map((thread) => (
          <Pressable key={thread.id} style={styles.threadRow}>
            <Text style={styles.bodyStrong}>{thread.title}</Text>
            <Text style={styles.muted}>{thread.subtitle}</Text>
          </Pressable>
        ))}
        <View style={styles.drawerFlex} />
        <Pressable style={styles.drawerNewChat} onPress={openNewChat}>
          <Text style={styles.drawerNewIcon}>+</Text>
          <Text style={styles.drawerNewText}>新对话</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BottomPanel({
  close,
  title,
  children,
}: {
  close: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panelOverlay}>
      <Pressable style={styles.panelScrim} onPress={close} />
      <View style={styles.bottomPanel}>
        <View style={styles.panelHandle} />
        <View style={styles.rowBetween}>
          <Text style={styles.h2}>{title}</Text>
          <Pressable style={styles.miniClose} onPress={close}>
            <Text style={styles.iconText}>X</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

export function PanelAction({ label, hint, onPress }: { label: string; hint: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.panelAction} onPress={onPress}>
      <Text style={styles.bodyStrong}>{label}</Text>
      <Text style={styles.muted}>{hint}</Text>
    </Pressable>
  );
}
