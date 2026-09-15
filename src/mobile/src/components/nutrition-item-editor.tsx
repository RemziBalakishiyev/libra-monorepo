import { Ionicons } from '@expo/vector-icons';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { TextField } from '@/components/form-field';
import { SegmentedControl } from '@/components/segmented-control';
import { AppText } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QuantityMode } from '@/lib/api/nutrition';
import { parseDecimalInput } from '@/lib/money';
import { formatGrams, formatKcal, itemTotals } from '@/lib/nutrition';
import type { NutritionEntryForm } from '@/lib/validation/nutrition';

type NutritionItemEditorProps = {
  control: Control<NutritionEntryForm>;
  index: number;
  /** Shown only when the meal holds more than one food. */
  onRemove?: () => void;
  disabled?: boolean;
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
  const fraction = normalized.slice(separatorIndex + 1).replace(/[.,]/g, '').slice(0, maxFractionDigits);
  return `${whole}${separator}${fraction}`;
}

/**
 * One food inside the meal: what it is, how the nutrients were read (per portion or per 100 g), how much was
 * eaten, and the four nutrient values. The line at the bottom shows what this item contributes and follows the
 * quantity as it is typed.
 */
export function NutritionItemEditor({ control, index, onRemove, disabled = false }: NutritionItemEditorProps) {
  const { colors } = useTheme();
  const item = useWatch({ control, name: `items.${index}` });
  const mode: QuantityMode = item?.quantityMode ?? 'PerPortion';
  const perUnit = mode === 'Per100Grams' ? '100 q' : '1 porsiya';

  const totals = itemTotals({
    name: item?.name ?? '',
    quantityMode: mode,
    quantity: parseDecimalInput(item?.quantity ?? '', 3) ?? 0,
    energyKcalPerUnit: parseDecimalInput(item?.energyKcal ?? '', 2) ?? 0,
    proteinGramsPerUnit: parseDecimalInput(item?.protein ?? '', 2) ?? 0,
    carbGramsPerUnit: parseDecimalInput(item?.carbs ?? '', 2) ?? 0,
    fatGramsPerUnit: parseDecimalInput(item?.fat ?? '', 2) ?? 0,
  });

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
            options={[
              { value: 'PerPortion', label: 'Porsiya üzrə', icon: 'restaurant-outline' },
              { value: 'Per100Grams', label: '100 q üzrə', icon: 'scale-outline' },
            ]}
          />
        )}
      />

      <View style={styles.grid}>
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
              containerStyle={styles.cell}
              testID={`item-quantity-${index}`}
            />
          )}
        />
        <Controller
          control={control}
          name={`items.${index}.energyKcal`}
          render={({ field, fieldState }) => (
            <TextField
              label={`Kalori · ${perUnit}`}
              value={field.value}
              onChangeText={(text) => field.onChange(sanitizeDecimal(text, 2))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              editable={!disabled}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="kkal"
              containerStyle={styles.cell}
              testID={`item-energy-${index}`}
            />
          )}
        />
        {(
          [
            { name: 'protein', label: 'Zülal' },
            { name: 'carbs', label: 'Karbohidrat' },
            { name: 'fat', label: 'Yağ' },
          ] as const
        ).map((macro) => (
          <Controller
            key={macro.name}
            control={control}
            name={`items.${index}.${macro.name}`}
            render={({ field, fieldState }) => (
              <TextField
                label={`${macro.label} (q) · ${perUnit}`}
                value={field.value}
                onChangeText={(text) => field.onChange(sanitizeDecimal(text, 2))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                editable={!disabled}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="q"
                containerStyle={styles.cell}
                testID={`item-${macro.name}-${index}`}
              />
            )}
          />
        ))}
      </View>

      <View style={[styles.result, { backgroundColor: colors.surfaceSubtle }]} accessibilityRole="summary" accessibilityLiveRegion="polite">
        <Ionicons name="calculator-outline" size={14} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={styles.flex} testID={`item-total-${index}`}>
          Bu yemək: {formatKcal(totals.energyKcal)} · Z {formatGrams(totals.proteinGrams)} · K {formatGrams(totals.carbGrams)} · Y {formatGrams(totals.fatGrams)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  cell: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 0,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
});
