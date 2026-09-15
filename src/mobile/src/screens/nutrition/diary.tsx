import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { DateNav } from '@/components/date-nav';
import { CalendarSheet } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { MealGroup } from '@/components/meal-group';
import { NutritionSummary } from '@/components/nutrition-summary';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet } from '@/components/sheet';
import { PressableScale } from '@/components/pressable-scale';
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StaleNotice } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { Ionicons } from '@expo/vector-icons';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useDeleteNutritionEntry, useNutritionDay } from '@/hooks/use-nutrition';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { MealType, NutritionEntry } from '@/lib/api/nutrition';
import { confirmAsync } from '@/lib/confirm';
import { formatLongDate, todayIsoDate } from '@/lib/dates';
import { describeEntry, formatKcal } from '@/lib/nutrition';

/** Local time of an entry, in the device time zone (the diary's day boundaries come from the API). */
function timeOf(entry: NutritionEntry): string {
  const date = new Date(entry.consumedAtUtc);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The nutrition diary: one local calendar day with its energy and macro summary, the four meal groups, and the
 * paths to add, inspect, copy or delete a meal. The day's totals come from the API, which sums every stored
 * entry of that day rather than a page of a list.
 */
export function NutritionDiary() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const remove = useDeleteNutritionEntry();
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsFor, setActionsFor] = useState<NutritionEntry | null>(null);
  const [copyFor, setCopyFor] = useState<NutritionEntry | null>(null);

  const day = useNutritionDay(selectedDate);
  // Until a day is picked, the API decides which day "today" is in the profile time zone.
  const activeDate = selectedDate ?? day.data?.date ?? todayIsoDate();
  const isToday = activeDate === todayIsoDate();
  const wide = layout === 'wide';

  const onRefresh = () => {
    setRefreshing(true);
    void day.refetch().finally(() => setRefreshing(false));
  };

  const openNew = (mealType?: MealType) =>
    router.push(`/nutrition/new?date=${activeDate}${mealType ? `&mealType=${mealType}` : ''}` as never);

  /** The photo route only ever opens a draft; the diary changes when the estimate is confirmed there. */
  const openPhoto = () => router.push(`/nutrition/photo?date=${activeDate}` as never);

  const onDelete = async (entry: NutritionEntry) => {
    setActionsFor(null);
    const confirmed = await confirmAsync('Yeməyi sil', `${describeEntry(entry.items)} · ${formatKcal(entry.energyKcal)} silinsin? Günün cəmi dərhal yenilənəcək.`);
    if (!confirmed) {
      return;
    }
    try {
      await remove.mutateAsync({ id: entry.id, dates: [activeDate] });
      toast({ title: 'Yemək silindi', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const summary = day.data ? (
    <NutritionSummary
      totals={day.data.totals}
      goal={day.data.goal}
      label={isToday ? 'Günün cəmi' : `${formatLongDate(activeDate)} · cəmi`}
      onConfigureGoal={() => router.push('/nutrition/goals' as never)}
      animateOnMount
    />
  ) : (
    <SummarySkeleton />
  );

  const groups = day.data ? (
    day.data.entryCount === 0 ? (
      <View style={styles.empty}>
        <EmptyState
          icon="nutrition-outline"
          accent={colors.moduleNutrition}
          title="Bu gün üçün qeyd yoxdur"
          message="İlk yeməyi əlavə edin: adı, miqdarı və qidalanma dəyərləri kifayətdir."
          actionTitle="İlk yeməyi əlavə et"
          onAction={() => openNew()}
          compact
        />
        <Button title="Şəkildən əlavə et" variant="ghost" size="sm" icon="camera-outline" onPress={openPhoto} testID="nutrition-photo-empty" />
      </View>
    ) : (
      <View style={styles.groups}>
        {day.data.meals.map((group) => (
          <MealGroup key={group.mealType} group={group} timeOf={timeOf} onAdd={openNew} onOpenEntry={(entry) => router.push(`/nutrition/${entry.id}` as never)} onEntryActions={setActionsFor} />
        ))}
      </View>
    )
  ) : (
    <ListSkeleton rows={4} label="Gün yüklənir…" />
  );

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} testID="nutrition-screen">
      <Entrance index={0}>
        <ScreenHeader
          title="Qidalanma"
          eyebrow="Gündəlik"
          trailing={
            <>
              <IconButton icon="flag-outline" accessibilityLabel="Hədəflər" accessibilityHint="Kalori və makro hədəflərini açır" variant="filled" size={20} onPress={() => router.push('/nutrition/goals' as never)} testID="nutrition-goals" />
              <IconButton icon="camera-outline" accessibilityLabel="Şəkildən əlavə et" accessibilityHint="Şəkildən AI təxmini alır; təsdiqlədikdən sonra yazılır" variant="filled" size={20} onPress={openPhoto} testID="nutrition-photo" />
              <IconButton icon="add" accessibilityLabel="Yemək əlavə et" accessibilityHint="Yeni yemək qeydi yaradır" variant="primary" onPress={() => openNew()} testID="nutrition-add" />
            </>
          }
        />
      </Entrance>

      <Entrance index={1}>
        <DateNav value={activeDate} onChange={setSelectedDate} maximumDate={new Date()} title="Gün seç" />
      </Entrance>

      {day.isError && !day.data ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : (
        <>
          {day.isError && day.data ? <StaleNotice error={day.error} onRetry={() => void day.refetch()} /> : null}
          {wide ? (
            <View style={styles.columns}>
              <Entrance index={2} style={styles.columnMain}>
                {groups}
              </Entrance>
              <Entrance index={3} style={styles.columnSide}>
                {summary}
              </Entrance>
            </View>
          ) : (
            <>
              <Entrance index={2}>{summary}</Entrance>
              <Entrance index={3}>{groups}</Entrance>
            </>
          )}
        </>
      )}

      <Sheet visible={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor ? describeEntry(actionsFor.items) : 'Yemək'} scrollable={false} maxWidth={420}>
        <View style={styles.actions}>
          <ActionRow
            icon="create-outline"
            title="Düzəliş et"
            hint="Miqdarı, saatı və ya yeməkləri dəyiş"
            onPress={() => {
              const entry = actionsFor;
              setActionsFor(null);
              if (entry) {
                router.push(`/nutrition/${entry.id}` as never);
              }
            }}
          />
          <ActionRow
            icon="copy-outline"
            title="Başqa günə köçür"
            hint="Nüsxə açılır, yadda saxlamadan əvvəl düzəldə bilərsiniz"
            testID="nutrition-copy"
            onPress={() => {
              setCopyFor(actionsFor);
              setActionsFor(null);
            }}
          />
          <ActionRow icon="trash-outline" title="Sil" hint="Təsdiq soruşulacaq" tone="danger" testID="nutrition-delete" onPress={() => void onDelete(actionsFor!)} />
        </View>
      </Sheet>

      <CalendarSheet
        visible={copyFor !== null}
        value={activeDate}
        title="Hansı günə köçürülsün?"
        onClose={() => setCopyFor(null)}
        onChange={(date) => {
          const entry = copyFor;
          setCopyFor(null);
          if (entry) {
            // Opens an editable draft; nothing is written until the user saves it.
            router.push(`/nutrition/new?date=${date}&copyFrom=${entry.id}` as never);
          }
        }}
      />
    </Screen>
  );
}

function ActionRow({ icon, title, hint, onPress, tone = 'default', testID }: { icon: 'create-outline' | 'copy-outline' | 'trash-outline'; title: string; hint: string; onPress: () => void; tone?: 'default' | 'danger'; testID?: string }) {
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
      <View style={[styles.actionIcon, { backgroundColor: tone === 'danger' ? colors.expenseSoft : colors.surfaceSubtle }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.actionText}>
        <AppText variant="bodyStrong" style={{ color: tint }}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      </View>
    </PressableScale>
  );
}

/** Bones shaped like the summary card: energy line, bar, three macro columns. */
function SummarySkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLiveRegion="polite" accessibilityLabel="Qidalanma məlumatları yüklənir…">
      <Skeleton width={90} height={12} />
      <Skeleton width="45%" height={28} radius={Radius.md} />
      <Skeleton height={6} radius={3} />
      <View style={styles.skeletonMacros}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.skeletonMacro}>
            <Skeleton width={60} height={11} />
            <Skeleton width="70%" height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  empty: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  groups: {
    gap: Spacing.md,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl,
  },
  columnMain: {
    flex: 3,
    minWidth: 0,
  },
  columnSide: {
    flex: 2,
    minWidth: 0,
  },
  actions: {
    paddingBottom: Spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    gap: Spacing.xxs,
  },
  skeletonCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  skeletonMacros: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  skeletonMacro: {
    flex: 1,
    gap: Spacing.sm,
  },
});
