import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent, type ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { TextField } from '@/components/form-field';
import { NutritionItemEditor, itemNutrients } from '@/components/nutrition-item-editor';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { TimeField, formatTimeOf } from '@/components/time-field';
import { useToast } from '@/components/toast';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useCreateNutritionEntry, useDeleteNutritionEntry, useNutritionEntry, useUpdateNutritionEntry } from '@/hooks/use-nutrition';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { MealType, NutritionEntry, NutritionEntryInput, NutritionItemInput } from '@/lib/api/nutrition';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { isoDateOf, todayIsoDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { parseDecimalInput } from '@/lib/money';
import { describeEntry, formatGrams, formatKcal, itemTotals, macroKinds, mealForHour, meals, sumTotals } from '@/lib/nutrition';
import { nutritionEntryFormSchema, type NutritionEntryForm, type NutritionItemForm } from '@/lib/validation/nutrition';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/** Navigate back this long after a confirmed save, so the success state is seen but never blocks. */
const SUCCESS_DELAY_MS = 550;

type NutritionEntryFormScreenProps = {
  /** Editing an existing meal. */
  id?: string;
  /** Prefills a new meal from this one (copy); the source is never modified. */
  copyFromId?: string;
  /** Local calendar date the diary was showing. */
  date?: string;
  mealType?: MealType;
};

export function NutritionEntryFormScreen({ id, copyFromId, date, mealType }: NutritionEntryFormScreenProps) {
  const existing = useNutritionEntry(id);
  const source = useNutritionEntry(copyFromId);
  const loading = (id && existing.isPending) || (copyFromId && source.isPending);
  const failed = (id && existing.isError) || (copyFromId && source.isError);
  const title = id ? 'Yeməyə düzəliş' : copyFromId ? 'Yeməyin nüsxəsi' : 'Yeni yemək';

  if (loading) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <FormSkeleton fields={5} />
      </Screen>
    );
  }

  if (failed) {
    const query = id ? existing : source;
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return <NutritionEditor entry={existing.data} copyFrom={source.data} date={date} mealType={mealType} />;
}

type Phase = 'idle' | 'submitting' | 'success';

type FieldKey = 'meal' | 'when' | 'items' | 'note';

/** An empty food row: nothing is prefilled, so a missing value is never confused with an entered zero. */
function blankItem(): NutritionItemForm {
  return { name: '', quantityMode: 'PerPortion', quantity: '1', energyKcal: '', protein: '', carbs: '', fat: '' };
}

/** Turns stored item snapshots back into form text, keeping the values exactly as they were entered. */
function itemsToForm(entry: NutritionEntry): NutritionItemForm[] {
  return entry.items.map((item) => ({
    name: item.name,
    quantityMode: item.quantityMode,
    quantity: String(item.quantity).replace('.', ','),
    energyKcal: String(item.energyKcalPerUnit).replace('.', ','),
    protein: String(item.proteinGramsPerUnit).replace('.', ','),
    carbs: String(item.carbGramsPerUnit).replace('.', ','),
    fat: String(item.fatGramsPerUnit).replace('.', ','),
  }));
}

function toInput(values: NutritionEntryForm): NutritionEntryInput {
  const [year, month, day] = values.date.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = values.time.split(':').map(Number) as [number, number];
  const consumedAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return {
    mealType: values.mealType,
    consumedAtUtc: consumedAt.toISOString(),
    note: values.note.trim() === '' ? null : values.note.trim(),
    items: values.items.map(
      (item): NutritionItemInput => ({
        name: item.name.trim(),
        quantityMode: item.quantityMode,
        quantity: parseDecimalInput(item.quantity, 3)!,
        energyKcalPerUnit: parseDecimalInput(item.energyKcal, 2)!,
        proteinGramsPerUnit: parseDecimalInput(item.protein, 2)!,
        carbGramsPerUnit: parseDecimalInput(item.carbs, 2)!,
        fatGramsPerUnit: parseDecimalInput(item.fat, 2)!,
      }),
    ),
  };
}

type EditorProps = {
  entry: NutritionEntry | undefined;
  copyFrom: NutritionEntry | undefined;
  date: string | undefined;
  mealType: MealType | undefined;
};

/**
 * Add, edit or copy one meal. A copy opens as an editable draft built from the source's inputs: it is a plain
 * create, so it gets its own id and its own snapshot rows and the source is never touched.
 */
function NutritionEditor({ entry, copyFrom, date, mealType }: EditorProps) {
  const router = useRouter();
  const { colors, layout, reducedMotion } = useTheme();
  const toast = useToast();
  const create = useCreateNutritionEntry();
  const update = useUpdateNutritionEntry();
  const remove = useDeleteNutritionEntry();
  const requestId = useClientRequestId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [showNote, setShowNote] = useState(Boolean(entry?.note));
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});
  const wide = layout === 'wide';
  const template = entry ?? copyFrom;
  /** The day this entry currently sits on; a move has to refresh that day too. */
  const originalDate = entry ? isoDateOf(new Date(entry.consumedAtUtc)) : undefined;

  const { control, handleSubmit, formState } = useForm<NutritionEntryForm>({
    resolver: zodResolver(nutritionEntryFormSchema),
    defaultValues: {
      mealType: entry?.mealType ?? mealType ?? copyFrom?.mealType ?? mealForHour(new Date().getHours()),
      date: entry ? isoDateOf(new Date(entry.consumedAtUtc)) : (date ?? todayIsoDate()),
      time: entry ? formatTimeOf(new Date(entry.consumedAtUtc)) : formatTimeOf(new Date()),
      note: entry?.note ?? '',
      items: template ? itemsToForm(template) : [blankItem()],
    },
  });
  const { fields, append, remove: removeItem } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const busy = phase === 'submitting' || remove.isPending;

  /**
   * The live total counts only the items whose four nutrient fields are all filled. A half-typed food
   * contributes nothing and is reported as such, so an unfinished form never looks like a finished
   * zero-calorie meal; an explicitly typed 0 is a value and does count.
   */
  const rows = (items ?? []).map((item) => ({ item, nutrients: itemNutrients(item) }));
  const completeRows = rows.filter((row) => row.nutrients !== null);
  const incompleteCount = rows.length - completeRows.length;
  const totals = sumTotals(
    completeRows.map((row) =>
      itemTotals({
        name: row.item?.name ?? '',
        quantityMode: row.item?.quantityMode ?? 'PerPortion',
        quantity: row.nutrients!.quantity,
        energyKcalPerUnit: row.nutrients!.energyKcal,
        proteinGramsPerUnit: row.nutrients!.protein,
        carbGramsPerUnit: row.nutrients!.carbs,
        fatGramsPerUnit: row.nutrients!.fat,
      }),
    ),
  );
  const hasTotal = completeRows.length > 0;

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const onFieldLayout = (key: FieldKey, event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };

  /** Which on-screen block each error belongs to, in the order the blocks appear. */
  const blockWithError = (errors: FieldErrors<NutritionEntryForm>): FieldKey | undefined => {
    if (errors.mealType) {
      return 'meal';
    }
    if (errors.date || errors.time) {
      return 'when';
    }
    if (errors.items) {
      return 'items';
    }
    return errors.note ? 'note' : undefined;
  };

  const revealFirstError = (errors: FieldErrors<NutritionEntryForm>) => {
    const first = blockWithError(errors);
    const offset = first ? fieldOffsets.current[first] : undefined;
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - Spacing.md), animated: !reducedMotion });
    }
  };

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      setPhase('submitting');
      const input = toInput(values);
      const dates = [...new Set([values.date, originalDate].filter((value): value is string => Boolean(value)))];
      const message = entry ? 'Dəyişikliklər yadda saxlanıldı' : 'Yemək əlavə olundu';
      try {
        if (entry) {
          await update.mutateAsync({ id: entry.id, input, dates });
        } else {
          // The same id travels with every retry of this form, so a double tap cannot create two meals.
          await create.mutateAsync({ input, clientRequestId: requestId.current(), dates });
          requestId.reset();
        }
        setPhase('success');
        successHaptic();
        // One notification, shown on the destination screen after the success state has been seen.
        doneTimer.current = setTimeout(() => {
          doneTimer.current = null;
          router.back();
          toast({ title: message, tone: 'success' });
        }, SUCCESS_DELAY_MS);
      } catch (error) {
        // The typed values stay on screen so nothing has to be entered twice.
        setPhase('idle');
        setServerError(describeError(error));
      }
    }, revealFirstError)();
  };

  const onDelete = async () => {
    if (!entry) {
      return;
    }
    const confirmed = await confirmAsync('Yeməyi sil', `${describeEntry(entry.items)} · ${formatKcal(entry.energyKcal)} silinsin? Günün cəmi dərhal yenilənəcək.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync({ id: entry.id, dates: originalDate ? [originalDate] : [] });
      router.back();
      toast({ title: 'Yemək silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const title = entry ? 'Yeməyə düzəliş' : copyFrom ? 'Yeməyin nüsxəsi' : 'Yeni yemək';
  const submitTitle = entry ? 'Yadda saxla' : 'Yemək əlavə et';

  // The meal segments and the macro row only fit their decorations at ordinary text sizes.
  const compactText = PixelRatio.getFontScale() <= 1.2;

  const form = (
    <>
      <View onLayout={(event) => onFieldLayout('meal', event)}>
        <Controller
          control={control}
          name="mealType"
          render={({ field }) => (
            <SegmentedControl
              accessibilityLabel="Öyün"
              testID="meal-type"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              size="sm"
              // At enlarged text the icons give up their width so the four short names stay whole.
              options={meals.map((meal) => ({ value: meal.type, label: meal.shortLabel, accessibilityLabel: meal.label, icon: compactText ? meal.icon : undefined }))}
            />
          )}
        />
      </View>

      <View style={styles.whenRow} onLayout={(event) => onFieldLayout('when', event)}>
        <Controller
          control={control}
          name="date"
          render={({ field, fieldState }) => (
            <View style={styles.whenCell}>
              <DateField label="Tarix" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
            </View>
          )}
        />
        <Controller
          control={control}
          name="time"
          render={({ field, fieldState }) => (
            <View style={styles.whenCellNarrow}>
              <TimeField value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
            </View>
          )}
        />
      </View>

      <View style={styles.items} onLayout={(event) => onFieldLayout('items', event)}>
        {fields.map((field, index) => (
          <NutritionItemEditor key={field.id} control={control} index={index} disabled={busy} onRemove={fields.length > 1 ? () => removeItem(index) : undefined} hideContribution={fields.length === 1} />
        ))}
        {formState.errors.items?.message ? (
          <AppText variant="caption" color="error" accessibilityRole="alert">
            {formState.errors.items.message}
          </AppText>
        ) : null}
      </View>

      <View style={styles.disclosure} onLayout={(event) => onFieldLayout('note', event)}>
        <Button title="Başqa yemək" variant="ghost" size="sm" icon="add" onPress={() => append(blankItem())} disabled={busy || fields.length >= 20} testID="add-item" />
        {showNote ? null : <Button title="Qeyd əlavə et" variant="ghost" size="sm" icon="create-outline" onPress={() => setShowNote(true)} disabled={busy} testID="add-note" />}
      </View>

      <View>
        {showNote ? (
          <Controller
            control={control}
            name="note"
            render={({ field, fieldState }) => (
              <TextField
                label="Qeyd (istəyə bağlı)"
                icon="create-outline"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                editable={!busy}
                placeholder="Məsələn, iş yerində"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            )}
          />
        ) : null}
      </View>

      {entry ? (
        <View style={styles.dangerZone}>
          <Button title="Yeməyi sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} />
        </View>
      ) : null}
    </>
  );

  const summary = (
    <View style={[styles.totals, { backgroundColor: colors.nutritionTint, borderColor: colors.nutritionTintBorder }]} accessibilityRole="summary" accessibilityLiveRegion="polite" testID="entry-total">
      <View style={styles.totalsHeader}>
        <AppText variant="meta" color="textSecondary" style={styles.flex}>
          {fields.length > 1 ? 'Bu yeməyin cəmi' : 'Bu yemək'}
        </AppText>
        <View style={styles.totalsValue}>
          <AppText variant="title" style={[styles.tabular, { color: colors.textPrimary }]} testID="entry-total-energy">
            {hasTotal ? formatKcal(totals.energyKcal, false) : '—'}
          </AppText>
          <AppText variant="meta" color="textSecondary">
            kkal
          </AppText>
        </View>
      </View>
      <View style={styles.totalsMacros} testID="entry-total-macros">
        {macroKinds.map((macro) => (
          <View key={macro.key} style={styles.totalsMacro}>
            <View style={[styles.macroDot, { backgroundColor: colors[macro.fill] }]} />
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {macro.label} {hasTotal ? formatGrams(macro.key === 'protein' ? totals.proteinGrams : macro.key === 'carb' ? totals.carbGrams : totals.fatGrams) : '—'}
            </AppText>
          </View>
        ))}
      </View>
      {incompleteCount > 0 ? (
        <AppText variant="caption" color="warningText" testID="entry-total-incomplete">
          {rows.length === 1 ? 'Dəyərlər tam deyil — bütün xanaları doldurun.' : `${incompleteCount} yeməyin dəyərləri tam deyil; cəmə daxil edilməyib.`}
        </AppText>
      ) : null}
      {copyFrom && !entry ? (
        <AppText variant="caption" color="textMuted">
          Nüsxə ayrıca qeyd kimi yaradılacaq; ilkin yemək dəyişmir.
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      footer={<Button title={submitTitle} onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle={entry ? 'Yadda saxlanıldı' : 'Əlavə olundu'} testID="nutrition-submit" />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={title} size="compact" />
        <ServerErrorBanner message={serverError} />
        {wide ? (
          <View style={styles.columns}>
            <View style={[styles.stack, styles.formColumn]}>{form}</View>
            <View style={styles.summaryColumn}>{summary}</View>
          </View>
        ) : (
          <>
            {form}
            {summary}
          </>
        )}
      </Entrance>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stack: {
    gap: Spacing.lg,
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.huge,
    alignItems: 'flex-start',
  },
  formColumn: {
    flex: 7,
  },
  summaryColumn: {
    flex: 5,
  },
  whenRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  whenCell: {
    flex: 3,
    minWidth: 0,
  },
  whenCellNarrow: {
    flex: 2,
    minWidth: 0,
  },
  items: {
    gap: Spacing.md,
  },
  dangerZone: {
    paddingTop: Spacing.xs,
  },
  disclosure: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  totals: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  totalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  totalsValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  totalsMacros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  totalsMacro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
