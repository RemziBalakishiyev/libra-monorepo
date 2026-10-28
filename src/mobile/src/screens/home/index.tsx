import { useRouter } from 'expo-router';
import { useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { globalQuickActionDefinitions, type QuickActionKind } from '@/components/quick-action';
import { QuickAddMenu } from '@/components/quick-add-menu';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useAccounts, useDashboard } from '@/hooks/use-finance';
import { useNutritionDay } from '@/hooks/use-nutrition';
import { useProfile } from '@/hooks/use-profile';
import { useScreenFocused } from '@/hooks/use-screen-focused';
import { useSleepSummary } from '@/hooks/use-sleep';
import { useSetTaskCompletion, useTaskDay } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Task, TaskDay } from '@/lib/api/tasks';
import { calendarDayIn, formatWeekdayDate } from '@/lib/dates';
import { formatKcal, targetProgress } from '@/lib/nutrition';
import { quickActionHref, requiresFinanceSetup } from '@/lib/quick-add';
import { describeDuration, elapsedMinutes, formatDuration, recordedDurationLabel, wakeDayLabel } from '@/lib/sleep';
import { completionPercent } from '@/lib/tasks';
import { HomeHero } from '@/screens/home/hero';
import { OverviewCard } from '@/screens/home/overview-card';
import { HomeTaskList } from '@/screens/home/task-list';

/** "remzi" from "remzi@example.com" for the greeting when no display name is set. */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** The preferred first name for the greeting; the stored name itself stays intact for the avatar and Profile. */
export function preferredName(displayName: string | null, email: string): string {
  const full = displayName?.trim() ?? '';
  if (full !== '') {
    return full.split(/\s+/)[0] ?? full;
  }
  return localPart(email);
}

/** Up to two initials, upper-cased with the Azerbaijani rules (i → İ). */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('az-AZ'))
    .join('');
}

/** Today's calendar day in the profile time zone, spelled "Cümə, 18 sentyabr". */
export function todayLabelIn(timeZone: string | undefined, now = new Date()): string {
  const { year, month, day } = calendarDayIn(now.toISOString(), timeZone);
  return formatWeekdayDate(new Date(year, month - 1, day, 12));
}

/** The hero's one line: what today still holds, from the day summary — never an invented insight. */
export function heroLine(day: TaskDay | undefined, status: 'pending' | 'error' | 'ready'): string {
  if (status === 'pending') {
    return 'Bu günün planı yüklənir…';
  }
  if (status === 'error' && !day) {
    return 'Plan məlumatı hazırda yüklənmir.';
  }
  const counts = day?.counts;
  if (!counts) {
    return 'Bu gün üçün hələ qeyd yoxdur.';
  }
  const remaining = counts.scheduled - counts.completed;
  const overdue = counts.overdue > 0 ? ` · ${counts.overdue} gecikib` : '';
  if (counts.scheduled === 0) {
    return counts.overdue > 0 ? `Bu gün üçün plan yoxdur · ${counts.overdue} gecikmiş tapşırıq` : 'Bu gün üçün hələ qeyd yoxdur.';
  }
  if (remaining === 0) {
    return `Bu günün ${counts.scheduled} tapşırığının hamısı tamamlanıb${overdue}`;
  }
  return `Bu gün ${remaining} tapşırıq qalıb${overdue}`;
}

/**
 * Signed-in home: a compact personal header, the green hero with the day's one real sentence and Quick Add,
 * four overview cards (Maliyyə, Qidalanma, Plan, Yuxu) built only from stored records, and today's tasks.
 * Nothing here is computed from a guess: a missing record reads "Qeyd yoxdur", a zero is a zero.
 */
export function Home() {
  const router = useRouter();
  const toast = useToast();
  const { layout, colors, width } = useTheme();
  const focused = useScreenFocused();
  const profile = useProfile();
  const accounts = useAccounts();
  const dashboard = useDashboard({});
  // Today in the profile time zone; the API decides which day that is.
  const nutrition = useNutritionDay(undefined);
  const plan = useTaskDay(undefined);
  const sleep = useSleepSummary();
  const completion = useSetTaskCompletion();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferGate, setTransferGate] = useState(false);

  const hasAccounts = (accounts.data?.length ?? 0) > 0;
  const wide = layout === 'wide';
  const balanceText = dashboard.data ? formatAmount(dashboard.data.totalBalance, dashboard.data.currencyCode, false) : '';
  // Two columns at normal phone widths; one column when the screen is narrow, the text is enlarged, or the
  // balance is long enough that it would have to shrink to fit half a row.
  const twoColumns = layout !== 'compact' || (width >= 360 && PixelRatio.getFontScale() <= 1.15 && balanceText.length < 12);
  const name = profile.data ? preferredName(profile.data.displayName, profile.data.email) : null;
  const fullName = profile.data ? (profile.data.displayName?.trim() || localPart(profile.data.email)) : '';
  const dateLabel = todayLabelIn(profile.data?.preferences.timeZone);

  const onRefresh = () => {
    setRefreshing(true);
    void Promise.allSettled([accounts.refetch(), dashboard.refetch(), nutrition.refetch(), plan.refetch(), sleep.refetch(), profile.refetch()]).finally(() => setRefreshing(false));
  };

  // Money actions need an account; a meal and a task do not, so Quick Add is available from the first day.
  const quickActions = hasAccounts ? globalQuickActionDefinitions : globalQuickActionDefinitions.filter((action) => !requiresFinanceSetup(action.kind));

  const onQuickAdd = (kind: QuickActionKind) => {
    setMenuOpen(false);
    if (kind === 'transfer' && (accounts.data?.length ?? 0) < 2) {
      setTransferGate(true);
      return;
    }
    router.push(quickActionHref(kind));
  };

  const onToggleTask = async (task: Task, completed: boolean) => {
    setBusyTaskId(task.id);
    try {
      await completion.mutateAsync({ id: task.id, completed });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      setBusyTaskId(null);
    }
  };

  // ── Card contents ────────────────────────────────────────────────────────────────────────────────────────
  const financeCard = (() => {
    const base = { title: 'Maliyyə', icon: 'wallet-outline' as const, onPress: () => router.navigate('/finance'), testID: 'home-card-finance' };
    if (accounts.isPending || (hasAccounts && dashboard.isPending)) {
      return <OverviewCard {...base} value="" accessibilityLabel="" loading />;
    }
    if (accounts.isError) {
      return <OverviewCard {...base} value="" accessibilityLabel="" error={{ onRetry: () => void accounts.refetch() }} />;
    }
    if (!hasAccounts) {
      return <OverviewCard {...base} value={null} accessibilityLabel="Maliyyə, qeyd yoxdur" emptyAction={{ title: 'Maliyyəni quraşdır', onPress: () => router.push('/finance/setup') }} />;
    }
    const data = dashboard.data;
    if (!data) {
      return <OverviewCard {...base} value="" accessibilityLabel="" error={{ onRetry: () => void dashboard.refetch() }} />;
    }
    const others = data.otherCurrencies.map((other) => formatAmount(other.totalBalance, other.currencyCode)).join(', ');
    return (
      <OverviewCard
        {...base}
        value={
          <>
            <MoneyText amount={data.totalBalance} currencyCode={data.currencyCode} variant="heading" highlightNegative showCode={false} accessibilityLabel={`Hesab balansı ${formatAmount(data.totalBalance, data.currencyCode)}`} />
            <AppText variant="meta" color="textSecondary">
              {data.currencyCode}
            </AppText>
          </>
        }
        caption={`Balans · bu ayın xalis axını ${formatAmount(data.monthlyNet, data.currencyCode)}`}
        aside={others ? { text: `Ayrıca ${others}`, tone: 'neutral' } : null}
        accessibilityLabel={`Maliyyə, hesab balansı ${formatAmount(data.totalBalance, data.currencyCode)}, bu ayın xalis axını ${formatAmount(data.monthlyNet, data.currencyCode)}${others ? `, ayrıca ${others}` : ''}`}
      />
    );
  })();

  const nutritionCard = (() => {
    const base = { title: 'Qidalanma', icon: 'nutrition-outline' as const, onPress: () => router.navigate('/nutrition'), testID: 'home-card-nutrition' };
    if (nutrition.isPending) {
      return <OverviewCard {...base} value="" accessibilityLabel="" loading />;
    }
    const day = nutrition.data;
    if (!day) {
      return <OverviewCard {...base} value="" accessibilityLabel="" error={{ onRetry: () => void nutrition.refetch() }} />;
    }
    if (day.entryCount === 0) {
      return <OverviewCard {...base} value={null} accessibilityLabel="Qidalanma, bu gün qeyd yoxdur" emptyAction={{ title: 'Yemək əlavə et', onPress: () => router.push('/nutrition/new') }} />;
    }
    const progress = targetProgress(day.totals.energyKcal, day.goal?.energyKcal);
    if (progress) {
      return (
        <OverviewCard
          {...base}
          value={`${formatKcal(day.totals.energyKcal, false)} / ${formatKcal(progress.target)}`}
          caption={progress.over ? `${formatKcal(Math.abs(progress.remaining))} hədəfdən artıq` : `${formatKcal(progress.remaining)} qalıb`}
          progress={{ percent: progress.percent, label: `Enerji hədəfi: ${Math.round(progress.percent)}%` }}
          accessibilityLabel={`Qidalanma, bu gün ${formatKcal(day.totals.energyKcal)} / hədəf ${formatKcal(progress.target)}`}
        />
      );
    }
    return <OverviewCard {...base} value={formatKcal(day.totals.energyKcal)} caption="Bu gün · hədəf təyin edilməyib" accessibilityLabel={`Qidalanma, bu gün ${formatKcal(day.totals.energyKcal)}, hədəf təyin edilməyib`} />;
  })();

  const planCard = (() => {
    const base = { title: 'Plan', icon: 'checkbox-outline' as const, onPress: () => router.navigate('/plan'), testID: 'home-card-plan' };
    if (plan.isPending) {
      return <OverviewCard {...base} value="" accessibilityLabel="" loading />;
    }
    const day = plan.data;
    if (!day) {
      return <OverviewCard {...base} value="" accessibilityLabel="" error={{ onRetry: () => void plan.refetch() }} />;
    }
    const overdue = day.counts.overdue > 0 ? { text: `${day.counts.overdue} gecikib`, tone: 'warning' as const } : null;
    if (day.counts.scheduled === 0) {
      return (
        <OverviewCard
          {...base}
          value={null}
          aside={overdue}
          accessibilityLabel={`Plan, bu gün tapşırıq yoxdur${overdue ? `, ${day.counts.overdue} gecikib` : ''}`}
          emptyAction={{ title: 'Tapşırıq əlavə et', onPress: () => router.push('/plan/new') }}
        />
      );
    }
    const percent = completionPercent(day.counts) ?? 0;
    return (
      <OverviewCard
        {...base}
        value={`${day.counts.completed} / ${day.counts.scheduled}`}
        caption="tapşırıq tamamlanıb · bu gün"
        progress={{ percent, label: `Bu günün tapşırıqları: ${percent}%` }}
        aside={overdue}
        accessibilityLabel={`Plan, bu gün ${day.counts.completed} / ${day.counts.scheduled} tapşırıq tamamlanıb${overdue ? `, ${day.counts.overdue} gecikib` : ''}`}
      />
    );
  })();

  const sleepCard = (() => {
    const base = { title: 'Yuxu', icon: 'moon-outline' as const, onPress: () => router.push('/sleep'), testID: 'home-card-sleep' };
    if (sleep.isPending) {
      return <OverviewCard {...base} value="" accessibilityLabel="" loading />;
    }
    const summary = sleep.data;
    if (!summary) {
      return <OverviewCard {...base} value="" accessibilityLabel="" error={{ onRetry: () => void sleep.refetch() }} />;
    }
    if (summary.active) {
      // The elapsed figure is computed from the stored start at render time; nothing ticks on Home.
      const minutes = elapsedMinutes(summary.active);
      return <OverviewCard {...base} value="Davam edir" caption={`${formatDuration(minutes)} · yuxu davam edir`} accessibilityLabel={`Yuxu davam edir, ${describeDuration(minutes)}`} />;
    }
    if (summary.latest) {
      const label = recordedDurationLabel(summary.latest);
      const when = wakeDayLabel(summary.latest);
      return <OverviewCard {...base} value={label.text} caption={`Son yuxu · ${when}`} accessibilityLabel={`Yuxu, son yuxu ${when}, ${label.spoken}`} />;
    }
    return <OverviewCard {...base} value={null} accessibilityLabel="Yuxu, qeyd yoxdur" emptyAction={{ title: 'Yuxu əlavə et', onPress: () => router.push('/sleep/new') }} />;
  })();

  const stale = [dashboard, nutrition, plan, sleep].find((query) => query.isError && query.data);

  const header = (
    <View style={styles.header}>
      <View style={styles.greeting}>
        <AppText variant="caption" color="textSecondary" numberOfLines={1} testID="home-date">
          {dateLabel}
        </AppText>
        <AppText variant="title" numberOfLines={2} testID="home-greeting">
          {name ? `Salam, ${name}` : 'Salam'}
        </AppText>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={fullName ? `Profil: ${fullName}` : 'Profil və seçimlər'}
        accessibilityHint="Profil səhifəsini açır"
        onPress={() => router.push('/profile')}
        scaleTo={0.94}
        containerStyle={styles.avatarSlot}
        pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
        style={[styles.avatar, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}
        testID="home-profile">
        <AppText variant="bodyStrong" color="primaryText">
          {fullName ? initialsOf(fullName) : '·'}
        </AppText>
      </PressableScale>
    </View>
  );

  const hero = <HomeHero supportingLine={heroLine(plan.data, plan.isPending ? 'pending' : plan.isError ? 'error' : 'ready')} onQuickAdd={wide ? undefined : () => setMenuOpen(true)} focused={focused} />;

  const cards = (
    <View style={styles.grid} testID="home-cards">
      <View style={twoColumns ? styles.gridRow : styles.gridColumn}>
        {financeCard}
        {nutritionCard}
      </View>
      <View style={twoColumns ? styles.gridRow : styles.gridColumn}>
        {planCard}
        {sleepCard}
      </View>
    </View>
  );

  const tasks = (
    <HomeTaskList
      day={plan.data}
      loading={plan.isPending}
      error={plan.error}
      onRetry={() => void plan.refetch()}
      onToggle={(task, completed) => void onToggleTask(task, completed)}
      busyId={busyTaskId}
      onOpenTask={(task) => router.push({ pathname: '/plan/[id]', params: { id: task.id } })}
      onOpenPlan={() => router.navigate('/plan')}
      onCreate={() => router.push('/plan/new')}
    />
  );

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.page} testID="home-screen">
      <Entrance index={0} duration={320} distance={10}>
        {header}
      </Entrance>
      {stale ? <StaleNotice error={stale.error} onRetry={onRefresh} /> : null}
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.columnMain}>
            <Entrance index={1} duration={320} distance={10}>
              {hero}
            </Entrance>
            <Entrance index={2} duration={320} distance={10}>
              {cards}
            </Entrance>
          </View>
          <Entrance index={3} duration={320} distance={10} style={styles.columnSide}>
            {tasks}
          </Entrance>
        </View>
      ) : (
        <>
          <Entrance index={1} duration={320} distance={10}>
            {hero}
          </Entrance>
          <Entrance index={2} duration={320} distance={10}>
            {cards}
          </Entrance>
          <Entrance index={3} duration={320} distance={10}>
            {tasks}
          </Entrance>
        </>
      )}

      <QuickAddMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={onQuickAdd} origin="top-right" actions={quickActions} />
      <Sheet visible={transferGate} onClose={() => setTransferGate(false)} title="Köçürmə üçün iki hesab lazımdır" presentation="dialog" scrollable={false} maxWidth={420}>
        <View style={styles.gate}>
          <AppText color="textSecondary">Köçürmə hesablar arasında aparılır. İkinci hesabı yaradın, sonra köçürmə edə bilərsiniz.</AppText>
          <Button
            title="Hesab yarat"
            icon="add"
            onPress={() => {
              setTransferGate(false);
              router.push('/finance/accounts/new');
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  avatarSlot: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl,
  },
  columnMain: {
    flex: 3,
    minWidth: 0,
    gap: Spacing.xl,
    maxWidth: Layout.maxForm + 160,
  },
  columnSide: {
    flex: 2,
    minWidth: 0,
  },
  grid: {
    gap: Spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'stretch',
  },
  gridColumn: {
    gap: Spacing.md,
  },
  gate: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.lg,
  },
});
