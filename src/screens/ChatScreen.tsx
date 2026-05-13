import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BottomTabs, ChatBubble, ChatHeader, FoodAnalysisCard } from '../components/ui';
import type { AppDataState } from '../domain/models';
import { AttachmentPanel, NewChatPanel, ThreadDrawer } from '../overlays/ChatOverlays';
import type { createAppActions } from '../services/appActions';
import { pickFoodPhoto, type PhotoPickerSource } from '../services/photoPicker';
import { styles } from '../styles';
import type { ChatPanel, Screen, Sheet } from '../types';
import { deviceWidth } from '../theme';

export function ChatScreen({
  go,
  openSheet,
  returnPanel,
  clearReturnPanel,
  appState,
  actions,
}: {
  go: (screen: Screen) => void;
  openSheet: (sheet: Sheet, backPanel?: ChatPanel) => void;
  returnPanel: ChatPanel;
  clearReturnPanel: () => void;
  appState: AppDataState;
  actions: ReturnType<typeof createAppActions>;
}) {
  const [panel, setPanel] = useState<ChatPanel>(null);
  const [panelBack, setPanelBack] = useState<ChatPanel>(null);
  const [composerText, setComposerText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingPortion, setEditingPortion] = useState(false);
  const [portionNote, setPortionNote] = useState('');
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 18 && Math.abs(gesture.dy) < 28 && gesture.moveX < deviceWidth * 0.45,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 64) {
          setPanel('threads');
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (returnPanel) {
      setPanel(returnPanel);
      setPanelBack(null);
      clearReturnPanel();
    }
  }, [returnPanel, clearReturnPanel]);

  const closePanel = () => {
    if (panelBack) {
      const back = panelBack;
      setPanelBack(null);
      setPanel(back);
      return;
    }
    setPanel(null);
  };

  const runAction = async (message: string, success: string, action: () => Promise<void>) => {
    setBusy(true);
    setStatus(message);
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const analyzePickedPhoto = async (source: PhotoPickerSource) => {
    const photo = await pickFoodPhoto(source);
    if (!photo) {
      setStatus('已取消选择照片');
      return;
    }
    await runAction('正在上传并分析照片...', '照片分析完成，请确认是否写入记录', async () => {
      await actions.analyzeFoodPhoto({
        threadId: appState.threads[0]?.id ?? 'food-today',
        ...photo,
      });
      setEditingPortion(false);
      setPortionNote('');
      setPanel(null);
    });
  };

  const sendComposerText = () => {
    const text = composerText.trim();
    if (!text) {
      setStatus('请输入要发送的内容');
      return;
    }
    void runAction('正在发送...', '消息已发送', async () => {
      await actions.sendText(appState.threads[0]?.id ?? 'food-today', text);
      setComposerText('');
    });
  };

  const submitPortionEdit = () => {
    const foodLogId = appState.activeFoodAnalysis?.id;
    if (!foodLogId) {
      setStatus('当前没有待编辑的食物记录');
      return;
    }
    const note = portionNote.trim();
    if (!note) {
      setStatus('请先输入份量备注');
      return;
    }
    void runAction('正在保存份量编辑...', '份量编辑已保存，仍需确认写入', async () => {
      await actions.editFoodLogPortion(foodLogId, note);
      setEditingPortion(false);
    });
  };

  const openManualFoodRecord = () => {
    Keyboard.dismiss();
    void actions.createManualFoodLog();
    setEditingPortion(true);
    setPortionNote('');
    setStatus('已打开食物记录，请输入食物和份量');
    setPanel(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      {...swipeResponder.panHandlers}
    >
      <ChatHeader
        openSubscribe={() => openSheet('subscription')}
        openThreads={() => setPanel('threads')}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {appState.chatMessages.map((message) => (
          <ChatBubble key={message.id} text={message.text} user={message.role === 'user'} />
        ))}
        {appState.activeFoodAnalysis ? (
          <FoodAnalysisCard
            analysis={appState.activeFoodAnalysis}
            busy={busy}
            editingPortion={editingPortion}
            portionNote={portionNote}
            onChangePortionNote={setPortionNote}
            onConfirm={() => void runAction('正在确认食物记录...', '确认成功：已写入今日记录', async () => {
              const foodLogId = appState.activeFoodAnalysis?.id;
              if (!foodLogId) return;
              Keyboard.dismiss();
              await actions.confirmFoodLog(foodLogId);
              setEditingPortion(false);
              setPortionNote('');
              go('records');
            })}
            onEdit={() => {
              Keyboard.dismiss();
              setEditingPortion(true);
              setStatus('请输入真实份量后保存');
            }}
            onSubmitEdit={submitPortionEdit}
            onCancelEdit={() => {
              Keyboard.dismiss();
              setEditingPortion(false);
              setPortionNote('');
            }}
            onDiscard={() => void runAction('正在丢弃记录...', '丢弃成功：已移除，不会计入今日记录', async () => {
              const foodLogId = appState.activeFoodAnalysis?.id;
              if (!foodLogId) return;
              Keyboard.dismiss();
              await actions.discardFoodLog(foodLogId);
              setEditingPortion(false);
              setPortionNote('');
            })}
          />
        ) : null}
        {status ? <Text style={styles.formStatus}>{status}</Text> : null}
      </ScrollView>
      {!editingPortion ? (
        <View style={styles.composer}>
          <Pressable style={styles.iconButton} onPress={() => setPanel('attach')}>
            <Text style={styles.iconText}>＋</Text>
          </Pressable>
          <TextInput
            style={styles.composerInput}
            value={composerText}
            onChangeText={setComposerText}
            editable={!busy}
            placeholder="询问 FitMate"
            placeholderTextColor="#777"
            returnKeyType="send"
            onSubmitEditing={sendComposerText}
          />
          <Pressable
            style={[styles.iconButton, busy && styles.disabledButton]}
            onPress={busy ? undefined : sendComposerText}
          >
            <Text style={styles.iconText}>➤</Text>
          </Pressable>
        </View>
      ) : null}
      <BottomTabs active="chat" go={go} />
      {panel === 'attach' && (
        <AttachmentPanel
          close={() => setPanel(null)}
          takeFoodPhoto={() => void analyzePickedPhoto('camera')}
          chooseFoodPhoto={() => void analyzePickedPhoto('library')}
          startFoodRecord={openManualFoodRecord}
          createCheckin={() => void runAction('正在记录体重...', '体重已写入今日记录', () => actions.createCheckin({ weightKg: appState.profile.weightKg, hungerLevel: 5 }))}
          sendWorkout={() => void runAction('正在发送运动记录...', '运动记录已发送', () => actions.sendText(appState.threads[0]?.id ?? 'food-today', '今天训练 80 分钟，中高强度。'))}
        />
      )}
      {panel === 'threads' && (
        <ThreadDrawer
          close={() => {
            setPanel(null);
            setPanelBack(null);
          }}
          openUser={() => {
            setPanel(null);
            setPanelBack(null);
            openSheet('settings', 'threads');
          }}
          openNewChat={() => {
            setPanelBack('threads');
            setPanel('new');
          }}
          profile={appState.profile}
          threads={appState.threads}
        />
      )}
      {panel === 'new' && <NewChatPanel close={closePanel} createThread={actions.createThread} />}
    </KeyboardAvoidingView>
  );
}
