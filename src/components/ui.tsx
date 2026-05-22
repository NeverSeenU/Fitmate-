import { Image, Pressable, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FileInsight, FoodAnalysis, SubscriptionTier } from '../domain/models';
import type { Screen } from '../types';
import { styles } from '../styles';

export function SettingsRow({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.settingsRow} onPress={onPress}>
      <Text style={styles.settingsIcon}>{icon}</Text>
      <Text style={danger ? styles.dangerText : styles.body}>{label}</Text>
      <Text style={styles.settingsValue}>{value ?? (onPress ? '>' : '')}</Text>
    </Pressable>
  );
}

export function FoodAnalysisCard({
  analysis,
  onConfirm,
  onEdit,
  onDiscard,
  busy,
}: {
  analysis: FoodAnalysis;
  onConfirm: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
  busy?: boolean;
}) {
  const canManage = analysis.status === 'pending' || analysis.status === 'edited' || analysis.status === 'analysis_only';
  const needsFollowUp = Boolean(analysis.needsFollowUp && analysis.followUpQuestion);
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.h2}>{analysis.title}</Text>
          <Text style={styles.muted}>
            置信度 {analysis.confidence.toFixed(2)} · {canManage ? '待你确认，确认后才写入记录' : foodAnalysisStatusCopy(analysis.status)}
          </Text>
          {foodAnalysisMetadata(analysis) ? <Text style={styles.muted}>{foodAnalysisMetadata(analysis)}</Text> : null}
        </View>
        <Text style={styles.status}>{foodAnalysisStatusLabel(analysis.status)}</Text>
      </View>
      <View style={styles.metricGrid}>
        <Metric value={analysis.calories} label="kcal" />
        <Metric value={analysis.protein} label="蛋白" />
        <Metric value={analysis.carbs} label="碳水" />
      </View>
      <Text style={styles.muted}>{analysis.advice}</Text>
      {needsFollowUp ? <Text style={styles.warningText}>需要先补充：{analysis.followUpQuestion}</Text> : null}
      {canManage ? (
        <>
          <View style={styles.actionGrid}>
            <Button label={needsFollowUp ? '先编辑补充后确认' : busy ? '处理中...' : '确认并写入'} onPress={onConfirm} disabled={busy || needsFollowUp} style={styles.actionButton} />
            <Button label="编辑内容" variant="secondary" onPress={onEdit} disabled={busy} style={styles.actionButton} />
            <Button label="丢弃" variant="secondary" onPress={onDiscard} disabled={busy} style={styles.actionButton} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function foodAnalysisMetadata(analysis: FoodAnalysis) {
  if (analysis.modelProvider && analysis.modelName) {
    return `${analysis.modelProvider}/${analysis.modelName}`;
  }
  return analysis.modelName ?? analysis.modelProvider ?? '';
}

function foodAnalysisStatusLabel(status: FoodAnalysis['status']) {
  if (status === 'pending') return '待确认';
  if (status === 'edited') return '已编辑，待确认';
  if (status === 'discarded') return '已丢弃';
  if (status === 'analysis_only') return '仅分析';
  return '已确认写入';
}

function foodAnalysisStatusCopy(status: FoodAnalysis['status']) {
  if (status === 'analysis_only') return 'Free 用户不会自动创建食物记录';
  if (status === 'discarded') return '这条记录已丢弃，不会计入今日记录';
  return '已写入今日记录';
}

export function Plan({
  tier,
  title,
  price,
  features,
  featured,
  selected,
  onSelect,
}: {
  tier: SubscriptionTier;
  title: string;
  price: string;
  features: readonly string[];
  featured?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Pressable style={[styles.planCard, featured && styles.featuredPlan, selected && styles.selectedPlan]} onPress={onSelect}>
      <View style={styles.rowBetween}>
        <Text style={styles.h2}>{title}</Text>
        <Text style={styles.status}>{selected ? '当前' : tier.toUpperCase()}</Text>
      </View>
      <Text style={styles.price}>{price}</Text>
      {features.map((feature) => (
        <Text key={feature} style={styles.muted}>
          {feature}
        </Text>
      ))}
      <Button label={selected ? '已启用' : `选择 ${title}`} onPress={onSelect} />
    </Pressable>
  );
}

export function ChatHeader({
  openSubscribe,
  openThreads,
}: {
  openSubscribe: () => void;
  openThreads: () => void;
}) {
  return (
    <View style={styles.chatHeader}>
      <Pressable style={styles.menuButton} onPress={openThreads}>
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
      </Pressable>
      <View style={styles.chatTitleWrap}>
        <Text style={styles.chatTitle}>FitMate AI</Text>
        <Text style={styles.chatSubtitle}>MiMo 优先 · 自动记录开启</Text>
      </View>
      <Pressable style={styles.subscribeButton} onPress={openSubscribe}>
        <Text style={styles.subscribeText}>Pro</Text>
      </Pressable>
    </View>
  );
}

export function TopBar({
  title,
  subtitle,
  badge,
  right,
  rightVariant,
  onRight,
  compact,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  right: string;
  rightVariant?: 'icon' | 'subscribe';
  onRight: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.topbar, compact && styles.compactTopbar]}>
      <View style={styles.brandRow}>
        {badge && <View style={styles.mark}><Text style={styles.markText}>{badge}</Text></View>}
        <View style={styles.brandCopy}>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
      </View>
      <Pressable style={rightVariant === 'subscribe' ? styles.subscribeButton : styles.iconButton} onPress={onRight}>
        <Text style={rightVariant === 'subscribe' ? styles.subscribeText : styles.iconText}>{right}</Text>
      </Pressable>
    </View>
  );
}

export function Brand({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.mark}><Text style={styles.markText}>F</Text></View>
      <View style={styles.brandCopy}>
        <Text style={styles.h1}>FitMate AI</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secure,
  compact,
  keyboardType,
}: {
  label: string;
  value?: string;
  onChangeText?: (value: string) => void;
  secure?: boolean;
  compact?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
}) {
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value ?? ''}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        editable={Boolean(onChangeText)}
        keyboardType={keyboardType}
        placeholderTextColor="#777"
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant,
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'secondary';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, variant === 'secondary' && styles.secondaryButton, disabled && styles.disabledButton, style]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton({ label }: { label: string }) {
  return (
    <Pressable style={styles.smallButton}>
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress}>
      <Text style={styles.iconText}>‹</Text>
    </Pressable>
  );
}

export function ChatBubble({
  id,
  text,
  user,
  imageUri,
  imageFilename,
  fileInsight,
  onSyncFileInsight,
}: {
  id: string;
  text: string;
  user?: boolean;
  imageUri?: string;
  imageFilename?: string;
  fileInsight?: FileInsight;
  onSyncFileInsight?: (messageId: string) => void;
}) {
  return (
    <View style={[styles.bubble, user ? styles.userBubble : styles.aiBubble]}>
      {imageUri ? (
        <View style={styles.chatImageFrame}>
          <Image source={{ uri: imageUri }} style={styles.chatImage} resizeMode="cover" />
          {imageFilename ? <Text style={styles.chatImageCaption} numberOfLines={1}>{imageFilename}</Text> : null}
        </View>
      ) : null}
      <Text style={styles.body}>{text}</Text>
      {!user && fileInsight ? <FileInsightCard insight={fileInsight} onSync={() => onSyncFileInsight?.(id)} /> : null}
    </View>
  );
}

function FileInsightCard({ insight, onSync }: { insight: FileInsight; onSync?: () => void }) {
  const visibleInsights = insight.insights.filter((item) => item.label !== 'document_type').slice(0, 4);
  const canSync = insight.syncStatus !== 'synced' && hasSyncableInsight(insight);
  return (
    <View style={styles.fileInsightCard}>
      <View style={styles.rowBetween}>
        <View style={styles.fileInsightTitleWrap}>
          <Text style={styles.bodyStrong}>{documentTypeLabel(insight.documentType)}</Text>
          <Text style={styles.muted}>{insight.filename}</Text>
          {fileInsightMetadata(insight) ? <Text style={styles.muted}>{fileInsightMetadata(insight)}</Text> : null}
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{insight.documentType}</Text>
        </View>
      </View>
      {visibleInsights.length ? (
        <View style={styles.fileInsightGrid}>
          {visibleInsights.map((item) => (
            <View key={`${item.label}-${item.value}`} style={styles.fileInsightMetric}>
              <Text style={styles.metricValue}>{item.value}</Text>
              <Text style={styles.metricLabel}>{insightLabel(item.label)}</Text>
              {insightMetricMetadata(item) ? <Text style={styles.metricLabel}>{insightMetricMetadata(item)}</Text> : null}
              {item.sourceText ? <Text style={styles.metricLabel} numberOfLines={2}>{item.sourceText}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {insight.recommendations[0] ? <Text style={styles.muted}>{insight.recommendations[0]}</Text> : null}
      {canSync ? <Button label={syncButtonLabel(insight.documentType)} onPress={onSync} /> : null}
      {insight.syncStatus === 'synced' ? <Text style={styles.doneStatus}>已同步到档案和今日记录</Text> : null}
    </View>
  );
}

function fileInsightMetadata(insight: FileInsight) {
  const parts = [
    insight.confidence === undefined ? null : `confidence ${insight.confidence.toFixed(2)}`,
    insight.modelProvider && insight.modelName ? `${insight.modelProvider}/${insight.modelName}` : insight.modelName ?? insight.modelProvider ?? null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function insightMetricMetadata(item: FileInsight['insights'][number]) {
  const parts = [
    item.confidence === undefined ? null : `confidence ${item.confidence.toFixed(2)}`,
    item.source ? sourceLabel(item.source) : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function sourceLabel(source: string) {
  if (source === 'ai') return 'AI';
  if (source === 'file_text') return 'file text';
  if (source === 'heuristic') return 'fallback';
  return source.replace(/_/g, ' ');
}

function hasSyncableInsight(insight: FileInsight) {
  const labels = new Set(insight.insights.map((item) => item.label));
  if (insight.documentType === 'body_report') {
    return labels.has('weight_kg') || labels.has('body_fat_percent');
  }
  if (insight.documentType === 'menu') {
    return labels.has('calories_kcal') || labels.has('protein_g');
  }
  if (insight.documentType === 'workout_plan') {
    return labels.has('training_frequency');
  }
  return false;
}

function syncButtonLabel(documentType: string) {
  if (documentType === 'body_report') return '同步体检指标到记录';
  if (documentType === 'menu') return '同步菜单营养到记录';
  if (documentType === 'workout_plan') return '同步训练计划到记录';
  return '同步到记录';
}

function documentTypeLabel(documentType: string) {
  if (documentType === 'body_report') return 'Body report';
  if (documentType === 'menu') return 'Menu insight';
  if (documentType === 'workout_plan') return 'Workout plan';
  return 'File insight';
}

function insightLabel(label: string) {
  if (label === 'weight_kg') return 'Weight';
  if (label === 'body_fat_percent') return 'Body fat';
  if (label === 'protein_g') return 'Protein';
  if (label === 'calories_kcal') return 'Calories';
  if (label === 'training_frequency') return 'Frequency';
  if (label === 'bmi') return 'BMI';
  return label.replace(/_/g, ' ');
}

export function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function Pill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function RecordCard({
  title,
  status,
  text,
  done,
  onEdit,
  onDelete,
}: {
  title: string;
  status: string;
  text: string;
  done?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.recordCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.h2}>{title}</Text>
        <Text style={[styles.status, done && styles.doneStatus]}>{status}</Text>
      </View>
      <Text style={styles.muted}>{text}</Text>
      {(onEdit || onDelete) ? (
        <View style={styles.recordActions}>
          {onEdit ? <Button label="编辑" variant="secondary" onPress={onEdit} style={styles.actionButton} /> : null}
          {onDelete ? <Button label="删除" variant="secondary" onPress={onDelete} style={styles.actionButton} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function BottomTabs({ active, go }: { active: 'chat' | 'records'; go: (screen: Screen) => void }) {
  return (
    <View style={styles.tabs}>
      <Pressable style={[styles.tab, active === 'chat' && styles.activeTab]} onPress={() => go('chat')}>
        <Text style={[styles.tabText, active === 'chat' && styles.activeTabText]}>AI Chat</Text>
      </Pressable>
      <Pressable
        style={[styles.tab, active === 'records' && styles.activeTab]}
        onPress={() => go('records')}
      >
        <Text style={[styles.tabText, active === 'records' && styles.activeTabText]}>记录</Text>
      </Pressable>
    </View>
  );
}
