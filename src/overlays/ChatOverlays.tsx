import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
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

export function ThreadDrawer({
  close,
  openUser,
  openNewChat,
  activeThreadId,
  selectThread,
  profile,
  threads,
}: {
  close: () => void;
  openUser: () => void;
  openNewChat: () => void;
  activeThreadId?: string;
  selectThread?: (threadId: string) => void;
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
          <Pressable
            key={thread.id}
            style={[styles.threadRow, activeThreadId === thread.id && styles.threadRowActive]}
            onPress={() => {
              selectThread?.(thread.id);
              close();
            }}
          >
            <Text style={styles.bodyStrong}>{thread.title}</Text>
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
