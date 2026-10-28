import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import type { IconName } from '@/constants/categories';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useAskAssistant, useAssistantConversation, useAssistantConversations, useAssistantStatus, useDeleteConversation } from '@/hooks/use-assistant';
import { useScreenFocused } from '@/hooks/use-screen-focused';
import { useTheme } from '@/hooks/use-theme';
import type { AssistantModule, AssistantPeriod } from '@/lib/api/assistant';
import { describeError } from '@/lib/api/errors';
import { newClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { dateFromIso, formatLongDate, isoDateOf, todayInProfileZone } from '@/lib/dates';
import { AssistantMessageRow } from '@/screens/ai/message';
import { AssistantOrb } from '@/screens/ai/orb';

const ALL_MODULES: AssistantModule[] = ['Finance', 'Nutrition', 'Tasks', 'Sleep', 'Focus'];

/** The four openings on the landing screen, each a question the snapshot can actually answer. */
const PROMPTS: readonly { title: string; caption: string; icon: IconName; modules: AssistantModule[] }[] = [
  { title: 'Günümü təhlil et', caption: 'Bu günün ümumi mənzərəsi', icon: 'sparkles-outline', modules: ALL_MODULES },
  { title: 'Pul hara gedir?', caption: 'Bu ayın xərcləri', icon: 'wallet-outline', modules: ['Finance'] },
  { title: 'Qidalanmam necədir?', caption: 'Bu günün qeydləri', icon: 'nutrition-outline', modules: ['Nutrition'] },
  { title: 'Günümü planlaşdır', caption: 'Tapşırıqlar və fokus', icon: 'calendar-outline', modules: ['Tasks', 'Focus', 'Sleep'] },
];

const MODULE_LABELS: Record<AssistantModule, string> = {
  Finance: 'Maliyyə',
  Nutrition: 'Qidalanma',
  Tasks: 'Plan',
  Sleep: 'Yuxu',
  Focus: 'Fokus',
};

const PERIOD_LABELS: Record<AssistantPeriod, string> = {
  Today: 'Bu gün',
  LastSevenDays: 'Son 7 gün',
};

/**
 * The AI tab: a landing composition that gives way to the conversation on the first question.
 *
 * Every figure in an answer is rendered from the snapshot the server stored with it — the assistant's prose is
 * never parsed for numbers — and the loading state reflects the one real request in flight rather than an
 * invented progress figure.
 */
export function AssistantScreen() {
  const router = useRouter();
  const { colors, reducedMotion } = useTheme();
  const toast = useToast();
  const status = useAssistantStatus();
  const ask = useAskAssistant();
  const remove = useDeleteConversation();
  const screenFocused = useScreenFocused();
  const scrollRef = useRef<ScrollView>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [modules, setModules] = useState<AssistantModule[]>(ALL_MODULES);
  const [period, setPeriod] = useState<AssistantPeriod>('Today');
  const [contextOpen, setContextOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [foreground, setForeground] = useState(true);
  /** The question that failed, kept so a retry is the same turn under the same request id. */
  const [failed, setFailed] = useState<{ question: string; requestId: string } | null>(null);
  /** The question in flight, shown while it is, so the screen never looks as though it lost it. */
  const [pending, setPending] = useState<string | null>(null);

  const conversation = useAssistantConversation(conversationId);
  const history = useAssistantConversations(historyOpen);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => subscription.remove();
  }, []);

  const still = reducedMotion || !screenFocused || !foreground;
  const messages = conversation.data?.messages ?? [];
  const started = messages.length > 0;
  // The introduction collapses on the first question, including while that first answer is still in flight.
  const conversing = started || ask.isPending;
  const configured = status.data?.isConfigured ?? false;
  const today = todayInProfileZone();

  /**
   * Sends one question. A prompt card passes its own scope, because the state set alongside the press has not
   * been applied yet and the request must carry the scope the card names.
   */
  const send = (question: string, requestId = newClientRequestId(), scope = modules) => {
    const text = question.trim();
    if (text.length === 0 || ask.isPending) {
      return;
    }
    setDraft('');
    setFailed(null);
    setPending(text);
    ask.mutate(
      { conversationId, question: text, modules: scope, period, clientRequestId: requestId },
      {
        onSuccess: (result) => {
          setPending(null);
          setConversationId(result.id);
          // The scroll only moves right after a send, so reading an earlier turn is never interrupted.
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: !reducedMotion }));
        },
        // The question stays available under the same id, so a retry resumes the turn instead of adding one.
        onError: (error) => {
          setPending(null);
          setFailed({ question: text, requestId });
          toast({ title: describeError(error), tone: 'error' });
        },
      },
    );
  };

  const onDelete = async (id: string, title: string) => {
    if (!(await confirmAsync('Söhbəti sil', `“${title}” söhbəti silinsin?`))) {
      return;
    }
    try {
      await remove.mutateAsync({ id });
      if (id === conversationId) {
        setConversationId(null);
      }
      toast({ title: 'Söhbət silindi', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const contextLine = `${PERIOD_LABELS[period]} · ${modules.length === ALL_MODULES.length ? 'Bütün modullar' : modules.map((module) => MODULE_LABELS[module]).join(', ')}`;
  const rangeLine = period === 'Today' ? formatLongDate(today) : `${formatLongDate(shiftDay(today, -6))} – ${formatLongDate(today)}`;

  return (
    <Screen
      tabInset
      scrollRef={scrollRef}
      maxWidth={Layout.maxForm}
      contentStyle={styles.page}
      testID="assistant-screen"
      footer={
        <View style={styles.composer}>
          {failed ? (
            <View style={[styles.retry, { backgroundColor: colors.errorSoft }]} testID="assistant-retry">
              <AppText variant="caption" color="error" style={styles.flex} numberOfLines={2}>
                Göndərilmədi: {failed.question}
              </AppText>
              <Button title="Yenidən" variant="ghost" size="sm" onPress={() => send(failed.question, failed.requestId)} testID="assistant-retry-send" />
            </View>
          ) : null}

          <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              accessibilityLabel="Sual yazın"
              value={draft}
              onChangeText={setDraft}
              editable={configured && !ask.isPending}
              placeholder={configured ? 'Sual yazın…' : 'Hazırda sual göndərmək olmur'}
              placeholderTextColor={colors.textPlaceholder}
              multiline
              style={[styles.input, { color: colors.textPrimary }]}
              testID="assistant-input"
            />
            <IconButton
              icon={ask.isPending ? 'ellipsis-horizontal' : 'arrow-up'}
              accessibilityLabel="Göndər"
              variant="primary"
              disabled={!configured || ask.isPending || draft.trim().length === 0}
              onPress={() => send(draft)}
              testID="assistant-send"
            />
          </View>
        </View>
      }>
      <Entrance index={0}>
        <ScreenHeader
          title="Libra AI"
          size="compact"
          trailing={
            <>
              <IconButton icon="time-outline" accessibilityLabel="Söhbət tarixçəsi" variant="filled" onPress={() => setHistoryOpen(true)} testID="assistant-history-open" />
              {started ? <IconButton icon="add" accessibilityLabel="Yeni söhbət" variant="primary" onPress={() => setConversationId(null)} testID="assistant-new" /> : null}
            </>
          }
        />
      </Entrance>

      {/* The context control is visible from the first screen, so the period and the modules are never implicit. */}
      <Entrance index={1}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Kontekst: ${contextLine}`}
          accessibilityHint="Dövrü və modulları dəyişir"
          onPress={() => setContextOpen(true)}
          scaleTo={0.98}
          style={[styles.context, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
          testID="assistant-context">
          <Ionicons name="options-outline" size={15} color={colors.textSecondary} />
          <View style={styles.flex}>
            <AppText variant="caption" color="textSecondary" numberOfLines={1} testID="assistant-context-line">
              {contextLine}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1} testID="assistant-context-range">
              {rangeLine}
            </AppText>
          </View>
          <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
        </PressableScale>
      </Entrance>

      {status.isPending ? (
        <ListSkeleton rows={3} label="Köməkçi hazırlanır…" />
      ) : !configured ? (
        <Entrance index={2}>
          <EmptyState
            icon="sparkles-outline"
            accent={colors.primaryText}
            title="AI köməkçi hələ aktiv deyil"
            message="Provayder açarı təyin edildikdən sonra burada qeydlərinizə əsaslanan cavablar görünəcək. Modulların öz xülasələri həmişəki kimi işləyir."
          />
        </Entrance>
      ) : conversing ? (
        <View style={styles.thread} testID="assistant-thread">
          {messages.map((message, index) => (
            <AssistantMessageRow key={message.id} message={message} index={index} onFollowUp={(question) => send(question)} onOpenSource={(route) => router.push(route as '/')} />
          ))}
          {pending !== null ? <PendingQuestion text={pending} /> : null}
          {ask.isPending ? <Thinking /> : null}
        </View>
      ) : (
        <>
          {/* The landing composition. It collapses the moment the conversation has a turn. */}
          <Entrance index={2} from="scale">
            <View style={styles.hero}>
              <AssistantOrb size={104} still={still} />
            </View>
          </Entrance>

          <Entrance index={3}>
            <AppText variant="heading" style={styles.heading} testID="assistant-heading">
              Bu gün nəyə diqqət edək?
            </AppText>
          </Entrance>

          <Entrance index={4}>
            <View style={styles.prompts}>
              {PROMPTS.map((prompt) => (
                <PressableScale
                  key={prompt.title}
                  accessibilityRole="button"
                  accessibilityLabel={prompt.title}
                  accessibilityHint={prompt.caption}
                  onPress={() => {
                    setModules(prompt.modules);
                    send(prompt.title, newClientRequestId(), prompt.modules);
                  }}
                  scaleTo={0.97}
                  containerStyle={styles.promptSlot}
                  pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
                  style={[styles.prompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  testID={`assistant-prompt-${prompt.modules.join('-')}`}>
                  <View style={[styles.promptIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name={prompt.icon} size={17} color={colors.primaryText} />
                  </View>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {prompt.title}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                    {prompt.caption}
                  </AppText>
                </PressableScale>
              ))}
            </View>
          </Entrance>
        </>
      )}

      {conversationId && conversation.isError ? <ErrorState error={conversation.error} onRetry={() => void conversation.refetch()} compact /> : null}

      <Sheet visible={contextOpen} onClose={() => setContextOpen(false)} title="Kontekst" maxWidth={420} testID="assistant-context-sheet">
        {contextOpen ? (
          <ContextBody
            modules={modules}
            period={period}
            onApply={(nextModules, nextPeriod) => {
              setModules(nextModules);
              setPeriod(nextPeriod);
              // A changed scope starts a fresh conversation, so an earlier turn cannot reintroduce excluded data.
              setConversationId(null);
              setContextOpen(false);
            }}
          />
        ) : null}
      </Sheet>

      <HistorySheet
        visible={historyOpen}
        query={history}
        onClose={() => setHistoryOpen(false)}
        onOpen={(id) => {
          setConversationId(id);
          setHistoryOpen(false);
        }}
        onDelete={(id, title) => void onDelete(id, title)}
      />
    </Screen>
  );
}

/** The question already sent, held in place until its answer arrives. */
function PendingQuestion({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pending, { backgroundColor: colors.primarySoft }]} testID="assistant-pending-question">
      <AppText variant="bodyStrong" color="primaryText">
        {text}
      </AppText>
    </View>
  );
}

/** Honest loading: one request is in flight, and that is all this claims. No percentage, no fake streaming. */
function Thinking() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.thinking, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityLabel="Cavab hazırlanır"
      testID="assistant-thinking">
      <AssistantOrb size={34} still />
      <AppText variant="caption" color="textSecondary">
        Qeydləriniz oxunur…
      </AppText>
    </View>
  );
}

function ContextBody({ modules, period, onApply }: { modules: AssistantModule[]; period: AssistantPeriod; onApply: (modules: AssistantModule[], period: AssistantPeriod) => void }) {
  const { colors } = useTheme();
  const [draftModules, setDraftModules] = useState(modules);
  const [draftPeriod, setDraftPeriod] = useState(period);

  // Selection is kept in module order rather than tap order, so the context line reads the same every time.
  const toggle = (module: AssistantModule) =>
    setDraftModules((current) => (current.includes(module) ? current.filter((value) => value !== module) : ALL_MODULES.filter((value) => value === module || current.includes(value))));

  return (
    <View style={styles.sheetBody}>
      <AppText variant="meta" color="textSecondary">
        Dövr
      </AppText>
      <View style={styles.chips}>
        {(['Today', 'LastSevenDays'] as const).map((value) => (
          <PressableScale
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: draftPeriod === value }}
            accessibilityLabel={PERIOD_LABELS[value]}
            onPress={() => setDraftPeriod(value)}
            scaleTo={0.96}
            style={[styles.chip, { backgroundColor: draftPeriod === value ? colors.primarySoft : colors.surfaceSubtle, borderColor: draftPeriod === value ? colors.primaryText : colors.border }]}
            testID={`assistant-period-${value}`}>
            <AppText variant="caption" color={draftPeriod === value ? 'primaryText' : 'textSecondary'}>
              {PERIOD_LABELS[value]}
            </AppText>
          </PressableScale>
        ))}
      </View>

      <AppText variant="meta" color="textSecondary">
        Modullar
      </AppText>
      <View style={styles.chips}>
        {ALL_MODULES.map((module) => {
          const selected = draftModules.includes(module);
          return (
            <PressableScale
              key={module}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={MODULE_LABELS[module]}
              onPress={() => toggle(module)}
              scaleTo={0.96}
              style={[styles.chip, { backgroundColor: selected ? colors.primarySoft : colors.surfaceSubtle, borderColor: selected ? colors.primaryText : colors.border }]}
              testID={`assistant-module-${module}`}>
              <AppText variant="caption" color={selected ? 'primaryText' : 'textSecondary'}>
                {MODULE_LABELS[module]}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      <AppText variant="caption" color="textMuted">
        Konteksti dəyişmək yeni söhbət başladır, beləliklə əvvəlki cavablar çıxarılan modulları geri gətirmir.
      </AppText>

      <Button title="Tətbiq et" onPress={() => onApply(draftModules.length === 0 ? ['Finance'] : draftModules, draftPeriod)} testID="assistant-context-apply" />
    </View>
  );
}

function HistorySheet({
  visible,
  query,
  onClose,
  onOpen,
  onDelete,
}: {
  visible: boolean;
  query: ReturnType<typeof useAssistantConversations>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { colors } = useTheme();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Söhbətlər" maxWidth={460} testID="assistant-history">
      <View style={styles.sheetBody}>
        {query.isPending ? (
          <ListSkeleton rows={3} label="Söhbətlər yüklənir…" />
        ) : items.length === 0 ? (
          <AppText variant="caption" color="textSecondary" testID="assistant-history-empty">
            Hələ söhbət yoxdur.
          </AppText>
        ) : (
          items.map((item) => (
            <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]} testID={`assistant-history-${item.id}`}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => onOpen(item.id)}
                scaleTo={0.99}
                containerStyle={styles.flex}
                style={styles.historyBody}
                testID={`assistant-history-open-${item.id}`}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {PERIOD_LABELS[item.period]} · {item.modules.map((module) => MODULE_LABELS[module]).join(', ')}
                </AppText>
              </PressableScale>
              <IconButton icon="trash-outline" accessibilityLabel={`${item.title} söhbətini sil`} size={18} onPress={() => onDelete(item.id, item.title)} testID={`assistant-history-delete-${item.id}`} />
            </View>
          ))
        )}
        {query.hasNextPage ? <Button title="Daha çox" variant="ghost" size="sm" onPress={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} testID="assistant-history-more" /> : null}
      </View>
    </Sheet>
  );
}

/** Shifts a local ISO date by whole days through calendar parts, the same way DateNav does. */
function shiftDay(iso: string, days: number): string {
  const base = dateFromIso(iso);
  return isoDateOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12));
}

const styles = StyleSheet.create({
  page: {
    gap: Spacing.lg,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  heading: {
    textAlign: 'center',
  },
  prompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  promptSlot: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 150,
  },
  prompt: {
    flex: 1,
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  promptIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: {
    gap: Spacing.md,
  },
  pending: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    gap: Spacing.xs,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  sheetBody: {
    gap: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    minHeight: MinTouchTarget - 10,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyBody: {
    paddingVertical: Spacing.sm,
    gap: Spacing.xxs,
  },
});
