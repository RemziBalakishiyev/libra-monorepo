import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CalendarSheet } from '@/components/calendar-sheet';
import { Entrance } from '@/components/entrance';
import { MealGroup } from '@/components/meal-group';
import { NutritionSummary } from '@/components/nutrition-summary';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet } from '@/components/sheet';
import { ErrorState, Skeleton, StaleNotice } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { WeekStrip } from '@/components/week-strip';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useDeleteNutritionEntry, useNutritionDay } from '@/hooks/use-nutrition';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { MealType, NutritionEntry } from '@/lib/api/nutrition';
import { confirmAsync } from '@/lib/confirm';
import { formatLongDate, todayInProfileZone } from '@/lib/dates';
import { describeEntry, formatKcal } from '@/lib/nutrition';

/** A third of the derivative's 264 px, so the bitmap is still sharp at 3× without shipping the 1 MB source. */
const EMPTY_ILLUSTRATION = 88;
const emptyIllustration = require('../../../assets/images/nutrition-empty-bowl-card.png');

/** Local time of an entry in the profile time zone, so a row's clock matches the day it is filed under. */
function timeOf(entry: NutritionEntry, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('az-AZ', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(entry.consumedAtUtc));
  } catch {
    const date = new Date(entry.consumedAtUtc);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
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
  // The signed-in layout stores the profile time zone, so "today" is that calendar day even before the
  // day response arrives; the response's own zone then formats the entry times.
  const timeZone = day.data?.timeZone;
  const today = todayInProfileZone();
  // Until a day is picked, the API decides which day "today" is in the profile time zone.
  const activeDate = selectedDate ?? day.data?.date ?? today;
  const isToday = activeDate === today;
  const wide = layout === 'wide';

  const onRefresh = () => {
    setRefreshing(true);
    void day.refetch().finally(() => setRefreshing(false));
  };

  const openNew = (mealType?: MealType) => router.push(`/nutrition/new?date=${activeDate}${mealType ? `&mealType=${mealType}` : ''}` as never);

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
      entryCount={day.data.entryCount}
      label={isToday ? 'Bu gün' : formatLongDate(activeDate)}
      onConfigureGoal={() => router.push('/nutrition/goals' as never)}
      animateOnMount
    />
  ) : (
    <SummarySkeleton />
  );

  const meals = day.data ? (
    <View style={styles.meals}>
      {day.data.entryCount === 0 ? (
        <View style={[styles.emptyNote, { backgroundColor: colors.surfaceSubtle }]} testID="nutrition-empty-note-line">
          {/* Decorative, and shown only on a day that loaded with nothing in it — never beside a real meal and
              never once per empty group. The slot is sized up front so the groups do not shift when it decodes. */}
          <Entrance from="scale" style={styles.illustrationSlot} aria-hidden importantForAccessibility="no-hide-descendants">
            <Image source={emptyIllustration} style={styles.illustration} resizeMode="contain" accessible={false} fadeDuration={0} testID="nutrition-empty-illustration" />
          </Entrance>
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Günə başlamaq üçün aşağıdakı öyünlərdən birinə yemək əlavə edin.
          </AppText>
        </View>
      ) : null}
      {day.data.meals.map((group) => (
        <MealGroup key={group.mealType} group={group} timeOf={(entry) => timeOf(entry, timeZone)} onAdd={openNew} onOpenEntry={(entry) => router.push(`/nutrition/${entry.id}` as never)} onEntryActions={setActionsFor} />
      ))}
      <View style={styles.addRow}>
        <Button title="Yemək əlavə et" icon="add" onPress={() => openNew()} style={styles.flex} testID="nutrition-add" />
        <Button title="Şəkildən" variant="soft" icon="camera-outline" onPress={openPhoto} testID="nutrition-photo" />
      </View>
    </View>
  ) : (
    <MealsSkeleton />
  );

  return (
    <Screen tabInset refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.page} testID="nutrition-screen">
      <Entrance index={0}>
        <ScreenHeader
          title="Qidalanma"
          size="compact"
          trailing={
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Hədəflər"
              accessibilityHint="Kalori və makro hədəflərini açır"
              onPress={() => router.push('/nutrition/goals' as never)}
              scaleTo={0.96}
              pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
              style={[styles.goalsAction, { backgroundColor: colors.surfaceSubtle }]}
              testID="nutrition-goals">
              <Ionicons name="flag-outline" size={16} color={colors.primaryText} />
              <AppText variant="meta" color="primaryText">
                Hədəflər
              </AppText>
            </PressableScale>
          }
        />
      </Entrance>

      <Entrance index={1}>
        <WeekStrip value={activeDate} onChange={setSelectedDate} today={today} calendarTitle="Gün seç" />
      </Entrance>

      {day.isError && !day.data ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : (
        <>
          {day.isError && day.data ? <StaleNotice error={day.error} onRetry={() => void day.refetch()} /> : null}
          {wide ? (
            <View style={styles.columns}>
              <Entrance index={2} style={styles.columnMain}>
                {meals}
              </Entrance>
              <Entrance index={3} style={styles.columnSide}>
                {summary}
              </Entrance>
            </View>
          ) : (
            <>
              <Entrance index={2}>{summary}</Entrance>
              <Entrance index={3}>{meals}</Entrance>
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
        today={today}
        onClose={() => setCopyFor(null)}
        onConfirm={(date) => {
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

/** Bones shaped like the summary: energy figure and ring, then three macro rows. */
function SummarySkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.nutritionTint, borderColor: colors.nutritionTintBorder }]} accessibilityLiveRegion="polite" accessibilityLabel="Qidalanma məlumatları yüklənir…">
      <View style={styles.skeletonEnergy}>
        <View style={styles.flex}>
          <Skeleton width={70} height={11} />
          <Skeleton width="60%" height={34} radius={Radius.md} />
          <Skeleton width={110} height={11} />
        </View>
        <Skeleton width={74} height={74} radius={37} />
      </View>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonMacro}>
          <Skeleton width="40%" height={12} />
          <Skeleton height={4} radius={2} />
        </View>
      ))}
    </View>
  );
}

/** Four meal headings with a row each, so the page does not jump when the day arrives. */
function MealsSkeleton() {
  return (
    <View style={styles.meals} accessibilityLiveRegion="polite" accessibilityLabel="Öyünlər yüklənir…">
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.skeletonMeal}>
          <Skeleton width={120} height={16} />
          <Skeleton height={44} radius={Radius.md} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: Spacing.lg,
  },
  full: {
    width: '100%',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  goalsAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: MinTouchTarget - 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  meals: {
    gap: Spacing.lg,
  },
  emptyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  illustrationSlot: {
    width: EMPTY_ILLUSTRATION,
    height: EMPTY_ILLUSTRATION,
  },
  illustration: {
    width: EMPTY_ILLUSTRATION,
    height: EMPTY_ILLUSTRATION,
  },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
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
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  skeletonEnergy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  skeletonMacro: {
    gap: Spacing.xs,
  },
  skeletonMeal: {
    gap: Spacing.sm,
  },
});
