import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BottomTabs, Button, ChatBubble, ChatHeader, FoodAnalysisCard } from '../components/ui';
import type { AppDataState, ChatMessage, FoodAnalysis } from '../domain/models';
import { AttachmentPanel, BottomPanel, ThreadDrawer } from '../overlays/ChatOverlays';
import { promptsForState, type RecoveryPrompt } from '../product/recoveryPrompts';
import type { createAppActions, FoodLogEditInput } from '../services/appActions';
import { formatFileSize, pickFitMateFile, type PickedFile } from '../services/filePicker';
import { pickFoodPhotos, type PickedPhoto, type PhotoPickerSource } from '../services/photoPicker';
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
  runtimeInfo,
}: {
  go: (screen: Screen) => void;
  openSheet: (sheet: Sheet, backPanel?: ChatPanel) => void;
  returnPanel: ChatPanel;
  clearReturnPanel: () => void;
  appState: AppDataState;
  actions: ReturnType<typeof createAppActions>;
  runtimeInfo?: string;
}) {
  const [panel, setPanel] = useState<ChatPanel>(null);
  const [utilityPanel, setUtilityPanel] = useState<'weight' | 'workout' | null>(null);
  const [composerText, setComposerText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [foodEditorOpen, setFoodEditorOpen] = useState(false);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState(foodAnalysisToForm(appState.activeFoodAnalysis));
  const [weightForm, setWeightForm] = useState({ weightKg: appState.profile.weightKg.toFixed(1), notes: '' });
  const [workoutForm, setWorkoutForm] = useState({ detail: '' });
  const activeThreadId = appState.activeThreadId || appState.threads[0]?.id || 'food-today';
  const quickPrompts = promptsForState(appState);
  const scrollRef = useRef<ScrollView | null>(null);
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
      clearReturnPanel();
    }
  }, [returnPanel, clearReturnPanel]);

  useEffect(() => {
    const scrollLatest = () => {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    };
    scrollLatest();
    const showSub = Keyboard.addListener('keyboardDidShow', scrollLatest);
    return () => showSub.remove();
  }, [appState.chatMessages.length, status]);

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
    const limit = source === 'camera' ? 1 : photoAttachmentLimit();
    const photos = await pickFoodPhotos(source, limit);
    if (!photos.length) {
      setStatus('已取消选择照片');
      return;
    }
    setPendingAttachment({ kind: 'photos', photos });
    setPanel(null);
    setStatus(photos.length > 1 ? `${photos.length} 张照片已添加，可以输入问题后一起发送给 AI` : '照片已添加，可以输入问题后一起发送给 AI');
  };

  const sendComposerText = () => {
    const text = composerText.trim();
    const attachment = pendingAttachment;
    if (!text && !attachment) {
      setStatus('请输入要发送的内容');
      return;
    }
    const busyText = attachment?.kind === 'file'
      ? '正在上传并分析文件...'
      : attachment?.kind === 'photos'
        ? '正在上传并分析照片...'
        : '正在发送...';
    const successText = attachment?.kind === 'file'
      ? '文件已上传并生成识别卡片'
      : attachment?.kind === 'photos'
        ? '照片分析完成，请确认、编辑或丢弃'
        : '消息已发送';
    setComposerText('');
    setPendingAttachment(null);
    void runAction(busyText, successText, async () => {
      if (attachment?.kind === 'file') {
        await actions.attachFile(attachment, text);
      } else if (attachment?.kind === 'photos') {
        await actions.analyzeFoodPhotos(attachment.photos.map((photo) => ({
            threadId: activeThreadId,
            imageUri: photo.imageUri,
            filename: photo.filename,
            mimeType: photo.mimeType,
            userNote: text,
          })));
        setFoodEditorOpen(false);
      } else if (text) {
        await actions.sendText(activeThreadId, text);
      }
    });
  };

  const sendRecoveryPrompt = (prompt: RecoveryPrompt) => {
    if (busy) return;
    if (prompt.action === 'camera') {
      void analyzePickedPhoto('camera');
      return;
    }
    setComposerText('');
    setPendingAttachment(null);
    void runAction('正在让 FitMate 帮你稳住...', 'FitMate 已给出下一步', async () => {
      await actions.sendText(activeThreadId, prompt.message, prompt.label);
    });
  };

  const openFoodEditor = (analysis = appState.activeFoodAnalysis) => {
    if (!analysis) {
      setStatus('当前没有待编辑的食物记录');
      return;
    }
    Keyboard.dismiss();
    setEditingFoodId(analysis.id);
    setFoodForm(foodAnalysisToForm(analysis));
    setFoodEditorOpen(true);
    setStatus('');
  };

  const submitFoodEditor = () => {
    const foodLogId = editingFoodId ?? appState.activeFoodAnalysis?.id;
    if (!foodLogId) {
      setStatus('当前没有待编辑的食物记录');
      return;
    }
    const next = formToFoodInput(foodForm);
    if (!next.title.trim()) {
      setStatus('请先填写食物名称');
      return;
    }
    void runAction('正在保存食物编辑...', '食物内容已保存，仍需确认写入', async () => {
      await actions.saveFoodLogDetails(foodLogId, next);
      setFoodEditorOpen(false);
      setEditingFoodId(null);
    });
  };

  const openManualFoodRecord = () => {
    Keyboard.dismiss();
    void actions.createManualFoodLog();
    setEditingFoodId(null);
    setFoodForm(foodAnalysisToForm(null));
    setFoodEditorOpen(true);
    setStatus('已打开食物记录，请输入食物和份量');
    setPanel(null);
  };

  const openWeightPanel = () => {
    Keyboard.dismiss();
    setPanel(null);
    setWeightForm({ weightKg: appState.profile.weightKg.toFixed(1), notes: '' });
    setUtilityPanel('weight');
    setStatus('');
  };

  const submitWeightCheckin = () => {
    void runAction('正在保存体重打卡...', '体重已写入今日记录', async () => {
      await actions.createCheckin({
        weightKg: parsePositiveNumber(weightForm.weightKg),
        notes: weightForm.notes.trim(),
      });
      setUtilityPanel(null);
    });
  };

  const openWorkoutPanel = () => {
    Keyboard.dismiss();
    setPanel(null);
    setWorkoutForm({ detail: '' });
    setUtilityPanel('workout');
    setStatus('');
  };

  const submitWorkout = () => {
    const detail = workoutForm.detail.trim();
    if (!detail) {
      setStatus('请先输入运动内容');
      return;
    }
    void runAction('正在发送运动记录...', '运动记录已发送', async () => {
      await actions.createWorkoutLog(detail);
      setUtilityPanel(null);
      go('records');
    });
  };

  const openFilePicker = () => {
    Keyboard.dismiss();
    setPanel(null);
    setBusy(true);
    setStatus('正在打开文件选择器...');
    void (async () => {
      try {
        const file = await pickFitMateFile();
        if (!file) {
          setStatus('已取消选择文件');
          return;
        }
        setPendingAttachment({ kind: 'file', ...file });
        setStatus('文件已添加，点发送后开始识别');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '文件选择失败');
      } finally {
        setBusy(false);
      }
    })();
  };

  const syncFileInsight = (messageId: string) => {
    void runAction('正在同步文件指标...', '文件指标已同步到记录', async () => {
      await actions.syncFileInsightMetrics(messageId);
      go('records');
    });
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
      {runtimeInfo ? <Text style={styles.runtimeBanner}>{runtimeInfo}</Text> : null}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {renderChatTimeline({
          messages: appState.chatMessages,
          syncFileInsight,
          renderFoodCard: (analysis) => renderFoodCard({
            analysis,
            busy,
            go,
            runAction,
            actions,
            openFoodEditor,
            closeFoodEditor: () => {
              setFoodEditorOpen(false);
              setEditingFoodId(null);
            },
          }),
        })}
        {status ? <Text style={styles.formStatus}>{status}</Text> : null}
      </ScrollView>
      {!foodEditorOpen ? (
        <View style={styles.composer}>
          {!pendingAttachment && !composerText.trim() ? (
            <View style={styles.quickRow}>
              {quickPrompts.map((prompt) => (
                <Pressable
                  key={prompt.id}
                  style={[styles.smallButton, busy && styles.disabledButton]}
                  onPress={busy ? undefined : () => sendRecoveryPrompt(prompt)}
                >
                  <Text style={styles.smallButtonText}>{prompt.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {pendingAttachment ? (
            <View style={styles.pendingAttachment}>
              {pendingAttachment.kind === 'photos' ? <PhotoAttachmentPreview photos={pendingAttachment.photos} /> : (
                <View style={styles.pendingAttachmentBadge}>
                  <Text style={styles.pendingAttachmentType}>{attachmentTypeLabel(pendingAttachment)}</Text>
                </View>
              )}
              <View style={styles.pendingAttachmentMeta}>
                <Text style={styles.pendingAttachmentName} numberOfLines={2}>{attachmentName(pendingAttachment)}</Text>
                <Text style={styles.pendingAttachmentSize}>{attachmentSubtitle(pendingAttachment)}</Text>
              </View>
              <Pressable style={styles.pendingAttachmentRemove} onPress={() => setPendingAttachment(null)} disabled={busy}>
                <Text style={styles.iconText}>X</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerControls}>
            <Pressable style={styles.iconButton} onPress={() => setPanel('attach')}>
              <Text style={styles.iconText}>+</Text>
            </Pressable>
            <TextInput
              style={styles.composerInput}
              value={composerText}
              onChangeText={setComposerText}
              editable={!busy}
              placeholder="询问 FitMate"
              placeholderTextColor="#777"
              multiline
              numberOfLines={10}
              scrollEnabled
              contextMenuHidden={false}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.iconButton, busy && styles.disabledButton]}
              onPress={busy ? undefined : sendComposerText}
            >
              <Text style={styles.iconText}>↑</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <BottomTabs active="chat" go={go} />
      {foodEditorOpen ? (
        <FoodEditorPage
          form={foodForm}
          setForm={setFoodForm}
          busy={busy}
          onClose={() => setFoodEditorOpen(false)}
          onSave={submitFoodEditor}
        />
      ) : null}
      {panel === 'attach' && (
        <AttachmentPanel
          close={() => setPanel(null)}
          takeFoodPhoto={() => void analyzePickedPhoto('camera')}
          chooseFoodPhoto={() => void analyzePickedPhoto('library')}
          openPersona={() => setPanel('persona')}
          startFoodRecord={openManualFoodRecord}
          openFile={openFilePicker}
          createCheckin={openWeightPanel}
          sendWorkout={openWorkoutPanel}
        />
      )}
      {panel === 'persona' && (
        <BottomPanel close={() => setPanel(null)} title="伙伴模式">
          <View style={styles.panelGrid}>
            <PersonaAction
              label="FitMate 默认"
              hint="诚实、稳、先帮你回到下一步"
              active
              onPress={() => {
                setStatus('已使用 FitMate 默认陪伴人格');
                setPanel(null);
              }}
            />
            <PersonaAction
              label="温柔陪伴"
              hint="焦虑、断档、体重波动时更柔和"
              onPress={() => {
                setStatus('温柔陪伴会在下一阶段接入保存');
                setPanel(null);
              }}
            />
            <PersonaAction
              label="直接教练"
              hint="少安慰，多给明确动作"
              onPress={() => {
                setStatus('直接教练会在下一阶段接入保存');
                setPanel(null);
              }}
            />
            <PersonaAction
              label="Mean Girl Coach"
              hint="只吐槽借口，不攻击身体或自我价值"
              onPress={() => {
                setStatus('Mean Girl Coach 会作为可选人格接入，默认不会开启');
                setPanel(null);
              }}
            />
          </View>
        </BottomPanel>
      )}
      {panel === 'threads' && (
        <ThreadDrawer
          close={() => {
            setPanel(null);
          }}
          openUser={() => {
            setPanel(null);
            openSheet('settings', 'threads');
          }}
          openNewChat={() => {
            void actions.createThread('\u65b0\u5bf9\u8bdd', 'general');
            setPanel(null);
          }}
          profile={appState.profile}
          threads={appState.threads}
          activeThreadId={activeThreadId}
          selectThread={actions.selectThread}
        />
      )}
      {utilityPanel === 'weight' ? (
        <UtilitySheet title="体重打卡" subtitle="记录今天的体重和备注" onClose={() => setUtilityPanel(null)}>
          <NumberField label="今日体重 kg" value={weightForm.weightKg} onChangeText={(value) => setWeightForm({ ...weightForm, weightKg: value })} />
          <TextArea label="备注" value={weightForm.notes} onChangeText={(value) => setWeightForm({ ...weightForm, notes: value })} placeholder="例如：早上空腹、训练后、经期水肿等。" />
          <View style={styles.editorFooter}>
            <Button label="取消" variant="secondary" onPress={() => setUtilityPanel(null)} disabled={busy} style={styles.actionButton} />
            <Button label={busy ? '保存中...' : '保存体重'} onPress={submitWeightCheckin} disabled={busy} style={styles.actionButton} />
          </View>
        </UtilitySheet>
      ) : null}
      {utilityPanel === 'workout' ? (
        <UtilitySheet title="运动记录" subtitle="写下训练内容，FitMate 会放进聊天继续分析" onClose={() => setUtilityPanel(null)}>
          <TextArea label="训练内容" value={workoutForm.detail} onChangeText={(value) => setWorkoutForm({ detail: value })} placeholder="例如：力量训练 60 分钟，卧推、深蹲、划船，最后跑步 20 分钟。" autoFocus />
          <View style={styles.editorFooter}>
            <Button label="取消" variant="secondary" onPress={() => setUtilityPanel(null)} disabled={busy} style={styles.actionButton} />
            <Button label={busy ? '发送中...' : '发送运动记录'} onPress={submitWorkout} disabled={busy} style={styles.actionButton} />
          </View>
        </UtilitySheet>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function renderChatTimeline({
  messages,
  syncFileInsight,
  renderFoodCard,
}: {
  messages: ChatMessage[];
  syncFileInsight: (messageId: string) => void;
  renderFoodCard: (analysis: FoodAnalysis) => ReactNode;
}) {
  return messages.map((message) => {
    if (message.foodAnalysis) {
      return <View key={message.id}>{renderFoodCard(message.foodAnalysis)}</View>;
    }
    return (
      <ChatBubble
        key={message.id}
        id={message.id}
        text={message.text}
        user={message.role === 'user'}
        imageUri={message.imageUri}
        imageFilename={message.imageFilename}
        images={message.images}
        fileInsight={message.fileInsight}
        onSyncFileInsight={syncFileInsight}
      />
    );
  });
}

function renderFoodCard({
  analysis,
  busy,
  go,
  runAction,
  actions,
  openFoodEditor,
  closeFoodEditor,
}: {
  analysis: FoodAnalysis;
  busy: boolean;
  go: (screen: Screen) => void;
  runAction: (message: string, success: string, action: () => Promise<void>) => Promise<void>;
  actions: ReturnType<typeof createAppActions>;
  openFoodEditor: (analysis: FoodAnalysis) => void;
  closeFoodEditor: () => void;
}) {
  return (
    <FoodAnalysisCard
      analysis={analysis}
      busy={busy}
      onConfirm={() => void runAction('正在确认食物记录...', '确认成功：已写入今日记录', async () => {
        Keyboard.dismiss();
        await actions.confirmFoodLog(analysis.id);
        closeFoodEditor();
        go('records');
      })}
      onEdit={() => openFoodEditor(analysis)}
      onDiscard={() => void runAction('正在丢弃记录...', '丢弃成功：已移除，不会计入今日记录', async () => {
        Keyboard.dismiss();
        await actions.discardFoodLog(analysis.id);
        closeFoodEditor();
      })}
    />
  );
}

type FoodEditorForm = {
  title: string;
  caloriesKcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  detail: string;
};

type PendingAttachment =
  | ({ kind: 'file' } & PickedFile)
  | { kind: 'photos'; photos: PickedPhoto[] };

function PhotoAttachmentPreview({ photos }: { photos: PickedPhoto[] }) {
  const visiblePhotos = photos.slice(0, 3);
  return (
    <View style={styles.pendingPhotoStack}>
      {visiblePhotos.map((photo, index) => (
        <Image
          key={`${photo.imageUri}-${index}`}
          source={{ uri: photo.imageUri }}
          style={[styles.pendingPhotoThumb, index > 0 ? styles.pendingPhotoOverlap : null]}
          resizeMode="cover"
        />
      ))}
      {photos.length > visiblePhotos.length ? (
        <View style={[styles.pendingPhotoThumb, styles.pendingPhotoOverlap, styles.pendingPhotoMore]}>
          <Text style={styles.pendingAttachmentType}>+{photos.length - visiblePhotos.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FoodEditorPage({
  form,
  setForm,
  busy,
  onClose,
  onSave,
}: {
  form: FoodEditorForm;
  setForm: (form: FoodEditorForm) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const update = (key: keyof FoodEditorForm, value: string) => setForm({ ...form, [key]: value });
  return (
    <KeyboardAvoidingView
      style={styles.sheet}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.h1}>编辑食物记录</Text>
          <Text style={styles.muted}>名称、营养和吃了什么都可以改</Text>
        </View>
        <Pressable style={styles.miniClose} onPress={onClose}>
          <Text style={styles.iconText}>X</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>食物名称</Text>
          <TextInput style={styles.input} value={form.title} onChangeText={(value) => update('title', value)} placeholder="例如：鸡胸饭、火锅、拿铁" placeholderTextColor="#777" contextMenuHidden={false} />
        </View>
        <View style={styles.formGrid}>
          <NumberField label="热量 kcal" value={form.caloriesKcal} onChangeText={(value) => update('caloriesKcal', value)} />
          <NumberField label="蛋白 g" value={form.proteinG} onChangeText={(value) => update('proteinG', value)} />
          <NumberField label="碳水 g" value={form.carbsG} onChangeText={(value) => update('carbsG', value)} />
          <NumberField label="脂肪 g" value={form.fatG} onChangeText={(value) => update('fatG', value)} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>详细内容</Text>
          <TextInput
            style={[styles.input, styles.detailInput]}
            value={form.detail}
            onChangeText={(value) => update('detail', value)}
            placeholder="写清楚吃了什么、份量、酱料、剩了多少，后面 AI 总结和记录页都会用到。"
            placeholderTextColor="#777"
            multiline
            numberOfLines={10}
            scrollEnabled
            contextMenuHidden={false}
            autoFocus
          />
        </View>
        <View style={styles.editorFooterInline}>
          <Button label="取消" variant="secondary" onPress={onClose} disabled={busy} style={styles.actionButton} />
          <Button label={busy ? '保存中...' : '保存编辑'} onPress={onSave} disabled={busy} style={styles.actionButton} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NumberField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.compactField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor="#777"
        contextMenuHidden={false}
      />
    </View>
  );
}

function TextArea({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
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
        numberOfLines={10}
        scrollEnabled
        contextMenuHidden={false}
        autoFocus={autoFocus}
      />
    </View>
  );
}

function UtilitySheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.sheet}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        <Pressable style={styles.miniClose} onPress={onClose}>
          <Text style={styles.iconText}>X</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.keyboardContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PersonaAction({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.panelAction, active && styles.threadRowActive]} onPress={onPress}>
      <Text style={styles.bodyStrong}>{label}</Text>
      <Text style={styles.muted}>{active ? `${hint} · 当前` : hint}</Text>
    </Pressable>
  );
}

function foodAnalysisToForm(analysis: AppDataState['activeFoodAnalysis']): FoodEditorForm {
  return {
    title: analysis?.title ?? '手动食物记录',
    caloriesKcal: String(analysis?.caloriesKcal ?? parseLeadingNumber(analysis?.calories) ?? 0),
    proteinG: String(analysis?.proteinG ?? parseLeadingNumber(analysis?.protein) ?? 0),
    carbsG: String(analysis?.carbsG ?? parseLeadingNumber(analysis?.carbs) ?? 0),
    fatG: String(analysis?.fatG ?? parseLeadingNumber(analysis?.fat) ?? 0),
    detail: analysis?.detail ?? '',
  };
}

function formToFoodInput(form: FoodEditorForm): FoodLogEditInput {
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

function parseLeadingNumber(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function attachmentName(attachment: PendingAttachment) {
  if (attachment.kind === 'file') {
    return attachment.name;
  }
  return attachment.photos.length > 1 ? `${attachment.photos.length} 张照片` : '照片';
}

function attachmentSubtitle(attachment: PendingAttachment) {
  return attachment.kind === 'file' ? formatFileSize(attachment.sizeBytes) : '发送后由 AI 识别食物和份量';
}

function attachmentTypeLabel(attachment: PendingAttachment) {
  if (attachment.kind !== 'file') {
    return 'IMG';
  }
  const extension = attachment.name.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 5) {
    return extension;
  }
  if (attachment.mimeType.startsWith('image/')) {
    return 'IMG';
  }
  return 'FILE';
}

function photoAttachmentLimit() {
  return 5;
}
