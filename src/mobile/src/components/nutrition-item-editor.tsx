import { Ionicons } from '@expo/vector-icons';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { TextField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QuantityMode } from '@/lib/api/nutrition';
import { parseDecimalInput } from '@/lib/money';
import { formatGrams, formatKcal, itemTotals, macroKinds } from '@/lib/nutrition';
import type { NutritionEntryForm } from '@/lib/validation/nutrition';

type NutritionItemEditorProps = {
  control: Control<NutritionEntryForm>;
  index: number;
  /** Shown only when the meal holds more than one food. */
  onRemove?: () => void;
  disabled?: boolean;
  /** Hides this item's own contribution line — the single-item form shows one total instead of two. */
  hideContribution?: boolean;
};

/** Keeps digits and a single decimal separator; grouping is never inserted, so the cursor never jumps. */
export function sanitizeDecimal(input: string, maxFractionDigits: number): string {
  const normalized = input.replace(/[^\d.,]/g, '');
  const separatorIndex = normalized.search(/[.,]/);
  if (separatorIndex === -1) {
    return normalized.slice(0, 9);
  }
  const whole = normalized.slice(0, separatorIndex).replace(/[.,]/g, '').slice(0, 9);
  const separator = normalized[separatorIndex]!;
  const fraction = normalized
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, '')
    .slice(0, maxFractionDigits);
  return `${whole}${separator}${fraction}`;
}

/** The four nutrient fields of one item, or null when any of them is still blank. */
export function itemNutrients(item: { quantity?: string; energyKcal?: string; protein?: string; carbs?: string; fat?: string } | undefined): { quantity: number; energyKcal: number; protein: number; carbs: number; fat: number } | null {
  const quantity = parseDecimalInput(item?.quantity ?? '', 3);
  const energyKcal = parseDecimalInput(item?.energyKcal ?? '', 2);
  const protein = parseDecimalInput(item?.protein ?? '', 2);
  const carbs = parseDecimalInput(item?.carbs ?? '', 2);
  const fat = parseDecimalInput(item?.fat ?? '', 2);
  if (quantity === null || energyKcal === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  return { quantity, energyKcal, protein, carbs, fat };
}

/**
 * One food inside the meal: what it is, how the nutrients were read (per portion or per 100 g), how much was
 * eaten, and the four nutrient values. The basis is stated once — "Dəyərlər 1 porsiya üçündür" — so the four
 * labels below it stay short instead of repeating the same suffix.
 *
 * A blank field is blank: the contribution line reads "—" until every value is filled, so an unfinished item
 * never looks like a completed zero-calorie food. A typed 0 is a value and counts as one.
 */
export function NutritionItemEditor({ control, index, onRemove, disabled = false, hideContribution = false }: NutritionItemEditorProps) {
  const { colors } = useTheme();
  const item = useWatch({ control, name: `items.${index}` });
  const mode: QuantityMode = item?.quantityMode ?? 'PerPortion';
  const basis = mode === 'Per100Grams' ? 'Dəyərlər 100 q üçündür' : 'Dəyərlər 1 porsiya üçündür';
  const nutrients = itemNutrients(item);
  const totals = nutrients
    ? itemTotals({
        name: item?.name ?? '',
        quantityMode: mode,
        quantity: nutrients.quantity,
        energyKcalPerUnit: nutrients.energyKcal,
        proteinGramsPerUnit: nutrients.protein,
        carbGramsPerUnit: nutrients.carbs,
        fatGramsPerUnit: nutrients.fat,
      })
    : null;
  // Three macro inputs sit in one row at normal text size and stack once the labels need the width.
  const macroRow = PixelRatio.getFontScale() <= 1.2;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`item-editor-${index}`}>
      {onRemove ? (
        <View style={styles.header}>
          <AppText variant="meta" color="textSecondary" style={styles.flex}>
            {index + 1}. yemək
          </AppText>
          <IconButton icon="close" accessibilityLabel={`${index + 1}. yeməyi sil`} size={18} onPress={onRemove} disabled={disabled} testID={`item-remove-${index}`} />
        </View>
      ) : null}

      <Controller
        control={control}
        name={`items.${index}.name`}
        render={({ field, fieldState }) => (
          <TextField
            label="Ad"
            icon="fast-food-outline"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!disabled}
            placeholder="Məsələn, Omlet"
            testID={`item-name-${index}`}
          />
        )}
      />

      <View style={styles.quantityBlock}>
        <Controller
          control={control}
          name={`items.${index}.quantityMode`}
          render={({ field }) => (
            <SegmentedControl
              accessibilityLabel="Qidalanma dəyərlərinin daxil edilməsi"
              testID={`quantity-mode-${index}`}
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
              size="sm"
              options={[
                { value: 'PerPortion', label: 'Porsiya üzrə', icon: 'restaurant-outline' },
                { value: 'Per100Grams', label: '100 q üzrə', icon: 'scale-outline' },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name={`items.${index}.quantity`}
          render={({ field, fieldState }) => (
            <TextField
              label={mode === 'Per100Grams' ? 'Çəki (q)' : 'Porsiya sayı'}
              value={field.value}
              onChangeText={(text) => field.onChange(sanitizeDecimal(text, 3))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              editable={!disabled}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={mode === 'Per100Grams' ? '150' : '1'}
              testID={`item-quantity-${index}`}
            />
          )}
        />
      </View>

      <View style={[styles.basis, { backgroundColor: colors.surfaceSubtle }]}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" testID={`item-basis-${index}`}>
          {basis}
        </AppText>
      </View>

      <Controller
        control={control}
        name={`items.${index}.energyKcal`}
        render={({ field, fieldState }) => (
          <TextField
            label="Kalori (kkal)"
            value={field.value}
            onChangeText={(text) => field.onChange(sanitizeDecimal(text, 2))}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!disabled}
            keyboardType="decimal-pad"
            inputMode="decimal"
            testID={`item-energy-${index}`}
          />
        )}
      />

      {macroRow ? (
        <AppText variant="meta" color="textSecondary" style={styles.macrosCaption}>
          Makrolar (q)
        </AppText>
      ) : null}
      <View style={[styles.macros, macroRow ? styles.macrosRow : null]}>
        {macroKinds.map((macro) => (
          <Controller
            key={macro.key}
            control={control}
            name={`items.${index}.${macro.key === 'carb' ? 'carbs' : macro.key}`}
            render={({ field, fieldState }) => (
              <TextField
                // In the shared row the unit is stated once above it, so three long labels cannot overrun
                // their columns; spoken it stays "Zülal (q)" either way.
                label={macroRow ? macro.label : `${macro.label} (q)`}
                accessibilityLabel={`${macro.label} (q)`}
                value={field.value}
                onChangeText={(text) => field.onChange(sanitizeDecimal(text, 2))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                editable={!disabled}
                keyboardType="decimal-pad"
                inputMode="decimal"
                containerStyle={macroRow ? styles.macroCell : undefined}
                testID={`item-${macro.key === 'carb' ? 'carbs' : macro.key}-${index}`}
              />
            )}
          />
        ))}
      </View>

      {hideContribution ? null : (
        <View style={[styles.result, { backgroundColor: colors.surfaceSubtle }]} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Ionicons name="calculator-outline" size={14} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex} testID={`item-total-${index}`}>
            {totals ? `Bu yemək: ${formatKcal(totals.energyKcal)} · Z ${formatGrams(totals.proteinGrams)} · K ${formatGrams(totals.carbGrams)} · Y ${formatGrams(totals.fatGrams)}` : 'Bu yemək: — (dəyərlər tam deyil)'}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 24,
  },
  flex: {
    flex: 1,
  },
  quantityBlock: {
    gap: Spacing.sm,
  },
  basis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  macrosCaption: {
    marginBottom: -Spacing.xs,
  },
  macros: {
    gap: Spacing.md,
  },
  macrosRow: {
    flexDirection: 'row',
  },
  macroCell: {
    flex: 1,
    minWidth: 0,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget - 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
});
