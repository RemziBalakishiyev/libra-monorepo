import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StaleNotice } from '@/components/states';
import { TaskRow } from '@/components/task-row';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useFocusSummary } from '@/hooks/use-focus-summary';
import { useFocusTimer, focusTimer } from '@/hooks/use-focus';
import { useProfile } from '@/hooks/use-profile';
import { useDeleteTask, useSetTaskCompletion, useStopTaskSeries, useTaskDay, useTaskList } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Task, TaskView } from '@/lib/api/tasks';
import { confirmAsync } from '@/lib/confirm';
import { dayEyebrow, dayHeading, groupByCompletionDay, groupByDay, taskViews, type RowContext } from '@/lib/tasks';
import { DaySummary } from '@/screens/plan/day-summary';
import { FocusCard } from '@/screens/plan/focus-card';

/**
 * The Plan screen: today's work, what is coming, and what is done.
 *
 * The day summary and the overdue count come from the API, which aggregates them over every matching task
 * rather than the page on screen. Completion is sent as an explicit state, so a retry after a lost response
 * lands on the same value and can never flip a task the user did not touch.
 */
export function PlanScreen() {
  const router = useRouter();
  const { colors, layout, width } = useTheme();
  const toast = useToast();
  const [view, setView] = useState<TaskView>('Today');
  const [refreshing, setRefreshing] = useState(false);
  const [actionsFor, setActionsFor] = useState<Task | null>(null);
  const completion = useSetTaskCompletion();
  const remove = useDeleteTask();
  const stopSeries = useStopTaskSeries();

  /** Which task's completion request is in flight, so only that row is busy. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** Guards a double tap: a second request for the same task while the first is open is ignored. */
  const inFlight = useRef(new Set<string>());

  const profile = useProfile();
  const timer = useFocusTimer();
  const focusSummary = useFocusSummary();
  // The timer belongs to the signed-in account and outlives every screen; this only adopts it.
  useEffect(() => {
    void focusTimer.hydrate(profile.data?.id);
  }, [profile.data?.id]);

  const day = useTaskDay(undefined);
  const upcoming = useTaskList('Upcoming', view === 'Upcoming');
  const completed = useTaskList('Completed', view === 'Completed');
  const active = view === 'Upcoming' ? upcoming : view === 'Completed' ? completed : null;
  const wide = layout === 'wide';
  const roomyTabs = width >= 380 && PixelRatio.getFontScale() <= 1.2;
  const today = day.data?.date;

  const onRefresh = () => {
    setRefreshing(true);
    void Promise.allSettled([day.refetch(), active?.refetch()]).finally(() => setRefreshing(false));
  };

  const onToggle = async (task: Task, completed: boolean) => {
    if (inFlight.current.has(task.id)) {
      return;
    }
    inFlight.current.add(task.id);
    setPendingId(task.id);
    try {
      // The desired state travels with the request; the server's answer is what the cache is refreshed from.
      await completion.mutateAsync({ id: task.id, completed });
    } catch (error) {
      // Nothing was changed locally, so there is nothing to roll back — the row stays as it was.
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      inFlight.current.delete(task.id);
      setPendingId((current) => (current === task.id ? null : current));
    }
  };

  const onDelete = async (task: Task) => {
    setActionsFor(null);
    const confirmed = await confirmAsync('Tapşırığı sil', `“${task.title}” silinsin?${task.seriesId ? ' Yalnız bu gün silinir, təkrarlanma davam edir.' : ''}`);
    if (!confirmed) {
      return;
    }
    try {
      await remove.mutateAsync({ id: task.id });
      toast({ title: 'Tapşırıq silindi', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const onStopSeries = async (task: Task) => {
    setActionsFor(null);
    if (!task.seriesId) {
      return;
    }
    const confirmed = await confirmAsync('Təkrarlanmanı dayandır', `“${task.title}” bundan sonra təkrarlanmayacaq. Tamamlanmış günlər qalır.`);
    if (!confirmed) {
      return;
    }
    try {
      await stopSeries.mutateAsync({ id: task.seriesId });
      toast({ title: 'Təkrarlanma dayandırıldı', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const openTask = (task: Task) => router.push(`/plan/${task.id}` as never);
  const openNew = () => router.push(`/plan/new${today ? `?date=${today}` : ''}` as never);

  const rowProps = (task: Task, context: RowContext = 'day') => ({
    task,
    onToggle: (target: Task, next: boolean) => void onToggle(target, next),
    onPress: openTask,
    onMore: setActionsFor,
    busy: pendingId === task.id,
    context,
    today,
  });

  const summary = day.data ? (
    <DaySummary counts={day.data.counts} onAdd={openNew} animateOnMount />
  ) : day.isError ? null : (
    <View style={[styles.card, { backgroundColor: colors.primarySoft, borderColor: colors.border }]} accessibilityLiveRegion="polite" accessibilityLabel="Tapşırıqlar yüklənir…">
      <Skeleton width={170} height={20} />
      <Skeleton width={110} height={12} />
      <Skeleton height={6} radius={Radius.full} />
    </View>
  );

  const todayView = day.data ? (
    day.data.counts.scheduled === 0 && day.data.overdue.length === 0 ? (
      <EmptyState
        icon="checkbox-outline"
        accent={colors.modulePlan}
        title="Bu gün üçün tapşırıq yoxdur"
        message="Bir tapşırıq yazın: ad kifayətdir, tarix və prioritet hazır gəlir."
        actionTitle="İlk tapşırığı əlavə et"
        onAction={openNew}
        compact
      />
    ) : (
      <View style={styles.groups}>
        {day.data.overdue.length > 0 ? (
          <View style={styles.group} testID="overdue-section">
            <View style={styles.groupHead}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.warningText} />
              <AppText variant="meta" color="warningText" style={styles.flex}>
                Gecikmiş
              </AppText>
              <AppText variant="meta" color="textSecondary" testID="overdue-count">
                {day.data.counts.overdue}
              </AppText>
            </View>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {day.data.overdue.map((task, index) => (
                <TaskRow key={task.id} {...rowProps(task, 'overdue')} showSeparator={index > 0} />
              ))}
            </View>
          </View>
        ) : null}

        {day.data.tasks.length > 0 ? (
          <View style={styles.group} testID="today-section">
            {/* The day is named once, in the header. A heading here would only repeat it — unless the overdue
                section is above, in which case this one needs to say which tasks these are. */}
            {day.data.overdue.length > 0 ? (
              <View style={styles.groupHead}>
                <Ionicons name="today-outline" size={15} color={colors.primaryText} />
                <AppText variant="meta" color="textSecondary" style={styles.flex}>
                  Bu gün
                </AppText>
              </View>
            ) : null}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {day.data.tasks.map((task, index) => (
                <TaskRow key={task.id} {...rowProps(task)} showSeparator={index > 0} />
              ))}
            </View>
          </View>
        ) : (
          <View style={[styles.section, styles.sectionPadded, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="today-empty">
            <AppText variant="caption" color="textSecondary">
              Bu gün üçün planlaşdırılmış tapşırıq yoxdur — gecikmiş işlər yuxarıdadır.
            </AppText>
          </View>
        )}
      </View>
    )
  ) : (
    <ListSkeleton rows={4} label="Tapşırıqlar yüklənir…" />
  );

  const listView = (() => {
    if (!active) {
      return null;
    }
    const items = active.data?.pages.flatMap((page) => page.items) ?? [];
    if (active.isPending) {
      return <ListSkeleton rows={4} label="Tapşırıqlar yüklənir…" />;
    }
    if (active.isError && items.length === 0) {
      return <ErrorState error={active.error} onRetry={() => void active.refetch()} />;
    }
    if (items.length === 0) {
      return view === 'Upcoming' ? (
        <EmptyState icon="calendar-outline" accent={colors.modulePlan} title="Qarşıda tapşırıq yoxdur" message="Gələcək bir gün üçün tapşırıq planlaşdırın." actionTitle="Tapşırıq əlavə et" onAction={openNew} compact />
      ) : (
        <EmptyState icon="checkmark-done-outline" accent={colors.modulePlan} title="Hələ tamamlanan yoxdur" message="Tamamladığınız tapşırıqlar burada qalır." compact />
      );
    }

    // Both lists are grouped by a real date: upcoming by the day a task is planned for, completed by the day it
    // was actually finished — which is also the field the API pages by, so the grouping survives paging.
    const groups = view === 'Completed' ? groupByCompletionDay(items) : groupByDay(items);
    const context: RowContext = view === 'Completed' ? 'completed' : 'day';

    return (
      <View style={styles.groups} testID={view === 'Completed' ? 'completed-section' : undefined}>
        {groups.map((group) => (
          <View key={group.date} style={styles.group} testID={`${view === 'Completed' ? 'completed' : 'upcoming'}-${group.date}`}>
            <View style={styles.groupHead}>
              <AppText variant="meta" color="textSecondary" style={styles.flex}>
                {dayHeading(group.date, today)}
              </AppText>
            </View>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {group.tasks.map((task, index) => (
                <TaskRow key={task.id} {...rowProps(task, context)} showSeparator={index > 0} />
              ))}
            </View>
          </View>
        ))}
        <LoadMore query={active} />
      </View>
    );
  })();

  const openFocus = () => router.push('/plan/focus' as never);
  const focusCard = (
    <FocusCard
      state={timer.state}
      todaySeconds={focusSummary.data?.today.activeSeconds ?? null}
      nowMs={timer.nowMs}
      onOpen={openFocus}
      onStart={() => {
        // Starting from here opens the screen, so the run is never begun out of sight.
        void focusTimer.prepare('focus');
        openFocus();
      }}
    />
  );

  const body = view === 'Today' ? todayView : listView;

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} testID="plan-screen">
      <Entrance index={0}>
        <ScreenHeader
          title="Plan"
          // The day comes from the API, which resolves it in the profile time zone.
          eyebrow={dayEyebrow(today)}
          trailing={
            <>
              {/* Sleep lives under Plan. A bare moon reads as an appearance switch, so this one says where it
                  goes; the destination is unchanged. */}
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Yuxu"
                accessibilityHint="Yuxu ekranını açır"
                onPress={() => router.push('/sleep')}
                scaleTo={0.96}
                pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
                style={[styles.sleepChip, { backgroundColor: colors.surfaceSubtle }]}
                testID="plan-sleep">
                <Ionicons name="moon-outline" size={15} color={colors.textSecondary} />
                <AppText variant="caption" color="textSecondary">
                  Yuxu
                </AppText>
              </PressableScale>
              <IconButton icon="add" accessibilityLabel="Tapşırıq əlavə et" accessibilityHint="Yeni tapşırıq yaradır" variant="primary" onPress={openNew} testID="plan-add" />
            </>
          }
        />
      </Entrance>

      <Entrance index={1}>
        <SegmentedControl
          accessibilityLabel="Görünüş"
          testID="plan-view"
          value={view}
          onChange={setView}
          size="sm"
          // "Tamamlanan" is the longest of the three; on a narrow phone or at enlarged text the icons give up
          // their width so it stays whole rather than being cut.
          options={taskViews.map((entry) => ({ value: entry.value, label: entry.shortLabel, accessibilityLabel: entry.label, icon: roomyTabs ? entry.icon : undefined }))}
        />
      </Entrance>

      {day.isError && !day.data ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : (
        <>
          {/* A failed refresh keeps the figures that are already on screen, with an honest notice above them. */}
          {day.isError && day.data ? <StaleNotice error={day.error} onRetry={() => void day.refetch()} /> : null}
          {wide ? (
            <View style={styles.columns}>
              <Entrance index={2} style={styles.columnMain}>
                {body}
              </Entrance>
              <Entrance index={3} style={styles.columnSide}>
                <View style={styles.side}>
                  {summary}
                  {focusCard}
                </View>
              </Entrance>
            </View>
          ) : (
            <>
              <Entrance index={2}>{summary}</Entrance>
              <Entrance index={3}>{focusCard}</Entrance>
              <Entrance index={4}>{body}</Entrance>
            </>
          )}
        </>
      )}

      <Sheet visible={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor?.title ?? 'Tapşırıq'} scrollable={false} maxWidth={420}>
        <View style={styles.actions}>
          <ActionRow
            icon="create-outline"
            title="Düzəliş et"
            hint="Adı, tarixi, saatı və prioriteti dəyiş"
            testID="task-edit"
            onPress={() => {
              const task = actionsFor;
              setActionsFor(null);
              if (task) {
                openTask(task);
              }
            }}
          />
          <ActionRow
            icon="timer-outline"
            title="Bu işə fokuslan"
            hint="Fokus taymerini bu tapşırıqla başladır"
            testID="task-focus"
            onPress={() => {
              const task = actionsFor;
              setActionsFor(null);
              if (task) {
                // The phase is prepared with the link; the run itself starts on the Focus screen.
                void focusTimer.prepare('focus', { taskId: task.id, title: task.title });
                openFocus();
              }
            }}
          />
          {actionsFor?.seriesId ? (
            <ActionRow
              icon="stop-circle-outline"
              title="Təkrarlanmanı dayandır"
              hint="Gələcək günlər silinir, tamamlananlar qalır"
              testID="task-stop-series"
              onPress={() => void onStopSeries(actionsFor)}
            />
          ) : null}
          <ActionRow icon="trash-outline" title="Sil" hint="Təsdiq soruşulacaq" tone="danger" testID="task-delete" onPress={() => void onDelete(actionsFor!)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function LoadMore({ query }: { query: ReturnType<typeof useTaskList> }) {
  if (!query.hasNextPage) {
    return null;
  }
  return (
    <View style={styles.loadMore}>
      <Button title="Daha çox" variant="ghost" size="sm" onPress={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} testID="task-load-more" />
    </View>
  );
}

function ActionRow({ icon, title, hint, onPress, tone = 'default', testID }: { icon: 'create-outline' | 'trash-outline' | 'stop-circle-outline' | 'timer-outline'; title: string; hint: string; onPress: () => void; tone?: 'default' | 'danger'; testID?: string }) {
  const { colors } = useTheme();
  const tint = tone === 'danger' ? colors.expenseText : colors.textPrimary;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      scaleTo={0.99}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={styles.actionRow}
      testID={testID}>
      <Ionicons name={icon} size={20} color={tint} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={tone === 'danger' ? 'expenseText' : 'textPrimary'}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  full: {
    width: '100%',
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.huge,
    alignItems: 'flex-start',
  },
  columnMain: {
    flex: 7,
  },
  columnSide: {
    flex: 4,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  sleepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: MinTouchTarget - 4,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  side: {
    gap: Spacing.md,
  },
  groups: {
    gap: Spacing.lg,
  },
  group: {
    gap: Spacing.xs,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  section: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.xxs,
    paddingLeft: Spacing.xs,
  },
  sectionPadded: {
    padding: Spacing.md,
  },
  loadMore: {
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  actions: {
    gap: Spacing.xxs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: MinTouchTarget,
    borderRadius: Radius.md,
  },
});
