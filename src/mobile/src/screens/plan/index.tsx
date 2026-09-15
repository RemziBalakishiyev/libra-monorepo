import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { useDeleteTask, useSetTaskCompletion, useStopTaskSeries, useTaskDay, useTaskList } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Task, TaskCounts, TaskView } from '@/lib/api/tasks';
import { confirmAsync } from '@/lib/confirm';
import { completionPercent, completionSummary, dayHeading, groupByDay, taskViews } from '@/lib/tasks';

/**
 * The Plan screen: today's work, what is coming, and what is done.
 *
 * The day summary and the overdue count come from the API, which aggregates them over every matching task
 * rather than the page on screen. Completion is sent as an explicit state, so a retry after a lost response
 * lands on the same value and can never flip a task the user did not touch.
 */
export function PlanScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
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

  const day = useTaskDay(undefined);
  const upcoming = useTaskList('Upcoming', view === 'Upcoming');
  const completed = useTaskList('Completed', view === 'Completed');
  const active = view === 'Upcoming' ? upcoming : view === 'Completed' ? completed : null;
  const wide = layout === 'wide';
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

  const rowProps = (task: Task) => ({
    task,
    onToggle: (target: Task, next: boolean) => void onToggle(target, next),
    onPress: openTask,
    onMore: setActionsFor,
    busy: pendingId === task.id,
    today,
  });

  const summary = day.data ? (
    <TaskSummary counts={day.data.counts} />
  ) : day.isError ? null : (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLiveRegion="polite" accessibilityLabel="Tapşırıqlar yüklənir…">
      <Skeleton width={140} height={14} />
      <Skeleton height={8} radius={Radius.full} />
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
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.warning }]} testID="overdue-section">
            <View style={styles.sectionHead}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warningText} />
              <AppText variant="bodyStrong" color="warningText" style={styles.flex}>
                Gecikmiş
              </AppText>
              <AppText variant="caption" color="textSecondary" testID="overdue-count">
                {day.data.counts.overdue}
              </AppText>
            </View>
            {day.data.overdue.map((task, index) => (
              <TaskRow key={task.id} {...rowProps(task)} showOverdueDate showSeparator={index > 0} />
            ))}
          </View>
        ) : null}

        {day.data.tasks.length > 0 ? (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="today-section">
            <View style={styles.sectionHead}>
              <Ionicons name="today-outline" size={16} color={colors.modulePlan} />
              <AppText variant="bodyStrong" style={styles.flex}>
                Bu gün
              </AppText>
            </View>
            {day.data.tasks.map((task, index) => (
              <TaskRow key={task.id} {...rowProps(task)} showSeparator={index > 0} />
            ))}
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText color="textSecondary">Bu gün üçün planlaşdırılmış tapşırıq yoxdur.</AppText>
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

    if (view === 'Completed') {
      return (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="completed-section">
          {items.map((task, index) => (
            <TaskRow key={task.id} {...rowProps(task)} showSeparator={index > 0} />
          ))}
          <LoadMore query={active} />
        </View>
      );
    }

    return (
      <View style={styles.groups}>
        {groupByDay(items).map((group) => (
          <View key={group.date} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`upcoming-${group.date}`}>
            <View style={styles.sectionHead}>
              <AppText variant="bodyStrong" style={styles.flex}>
                {dayHeading(group.date, today)}
              </AppText>
            </View>
            {group.tasks.map((task, index) => (
              <TaskRow key={task.id} {...rowProps(task)} showSeparator={index > 0} />
            ))}
          </View>
        ))}
        <LoadMore query={active} />
      </View>
    );
  })();

  const body = view === 'Today' ? todayView : listView;

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} testID="plan-screen">
      <Entrance index={0}>
        <ScreenHeader
          title="Plan"
          eyebrow="Tapşırıqlar"
          trailing={
            <>
              {/* Sleep lives under Plan; its own screen is one press away from here. */}
              <IconButton icon="moon-outline" accessibilityLabel="Yuxu" accessibilityHint="Yuxu ekranını açır" variant="filled" onPress={() => router.push('/sleep')} testID="plan-sleep" />
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
          options={taskViews.map((entry) => ({ value: entry.value, label: entry.shortLabel, accessibilityLabel: entry.label, icon: entry.icon }))}
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
                {summary}
              </Entrance>
            </View>
          ) : (
            <>
              <Entrance index={2}>{summary}</Entrance>
              <Entrance index={3}>{body}</Entrance>
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

/** "2 / 5 tamamlanıb" with a quiet progress bar, plus the overdue count when there is one. */
function TaskSummary({ counts }: { counts: TaskCounts }) {
  const { colors } = useTheme();
  const percent = completionPercent(counts);
  const label = completionSummary(counts);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="summary" accessibilityLiveRegion="polite" testID="task-summary">
      <View style={styles.summaryHead}>
        <Ionicons name="checkbox-outline" size={18} color={colors.modulePlan} />
        <AppText variant="bodyStrong" style={styles.flex} testID="task-summary-label">
          {label}
        </AppText>
        {percent !== null ? (
          <AppText variant="bodyStrong" color="textSecondary" style={styles.tabular}>
            {percent}%
          </AppText>
        ) : null}
      </View>
      {percent !== null ? (
        <View style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}>
          <View style={[styles.fill, { backgroundColor: colors.modulePlan, width: `${percent}%` }]} />
        </View>
      ) : null}
      {counts.overdue > 0 ? (
        <AppText variant="caption" color="warningText" testID="task-summary-overdue">
          {counts.overdue} gecikmiş tapşırıq
        </AppText>
      ) : null}
    </View>
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

function ActionRow({ icon, title, hint, onPress, tone = 'default', testID }: { icon: 'create-outline' | 'trash-outline' | 'stop-circle-outline'; title: string; hint: string; onPress: () => void; tone?: 'default' | 'danger'; testID?: string }) {
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
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  groups: {
    gap: Spacing.md,
  },
  section: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
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
