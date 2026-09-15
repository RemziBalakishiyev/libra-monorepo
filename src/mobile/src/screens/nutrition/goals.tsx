import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { TextField } from '@/components/form-field';
import { sanitizeDecimal } from '@/components/nutrition-item-editor';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useNutritionGoals, useSaveNutritionGoal } from '@/hooks/use-nutrition';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { NutritionGoals } from '@/lib/api/nutrition';
import { formatLongDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { formatGrams, formatKcal } from '@/lib/nutrition';
import { nutritionGoalFormSchema, parseTarget, type NutritionGoalForm } from '@/lib/validation/nutrition';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

const SUCCESS_DELAY_MS = 550;

export function NutritionGoalsScreen() {
  const goals = useNutritionGoals();

  if (goals.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title="Hədəflər" size="compact" />
        <FormSkeleton fields={4} />
      </Screen>
    );
  }

  if (goals.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title="Hədəflər" size="compact" />
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      </Screen>
    );
  }

  return <GoalsEditor goals={goals.data} />;
}

function text(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/**
 * Personal daily targets. Each one may stay empty — an unset target means "not tracked", never a recommended
 * default. Saving applies from today onwards; the days already recorded keep the targets they were measured
 * against, which the history below makes explicit.
 */
function GoalsEditor({ goals }: { goals: NutritionGoals }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const save = useSaveNutritionGoal();
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'success'>('idle');
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = goals.current;

  const { control, handleSubmit, formState } = useForm<NutritionGoalForm>({
    resolver: zodResolver(nutritionGoalFormSchema),
    defaultValues: {
      energyKcal: text(current?.energyKcal),
      protein: text(current?.proteinGrams),
      carbs: text(current?.carbGrams),
      fat: text(current?.fatGrams),
    },
  });

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      setPhase('submitting');
      try {
        const saved = await save.mutateAsync({
          // Omitted effective date means today in the profile time zone, decided by the API.
          energyKcal: parseTarget(values.energyKcal),
          proteinGrams: parseTarget(values.protein),
          carbGrams: parseTarget(values.carbs),
          fatGrams: parseTarget(values.fat),
        });
        setPhase('success');
        successHaptic();
        doneTimer.current = setTimeout(() => {
          doneTimer.current = null;
          router.back();
          toast({ title: saved ? 'Hədəflər yadda saxlanıldı' : 'Hədəflər silindi', tone: 'success' });
        }, SUCCESS_DELAY_MS);
      } catch (error) {
        setPhase('idle');
        setServerError(describeError(error));
      }
    })();
  };

  const busy = phase === 'submitting';
  const fields = [
    { name: 'energyKcal', label: 'Gündəlik kalori (kkal)', icon: 'flame-outline', placeholder: '2200' },
    { name: 'protein', label: 'Zülal (q)', icon: 'barbell-outline', placeholder: '130' },
    { name: 'carbs', label: 'Karbohidrat (q)', icon: 'leaf-outline', placeholder: '250' },
    { name: 'fat', label: 'Yağ (q)', icon: 'water-outline', placeholder: '70' },
  ] as const;

  return (
    <Screen
      maxWidth={Layout.maxForm}
      footer={<Button title="Yadda saxla" onPress={submit} loading={busy} success={phase === 'success'} successTitle="Yadda saxlanıldı" testID="goals-submit" />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title="Hədəflər" size="compact" subtitle="Boş buraxılan hədəf izlənmir." />
        <ServerErrorBanner message={serverError} />

        <View style={[styles.notice, { backgroundColor: colors.primarySoft }]} accessibilityRole="summary">
          <Ionicons name="information-circle-outline" size={18} color={colors.primaryText} />
          <AppText variant="caption" color="primaryText" style={styles.flex}>
            Dəyişiklik {formatLongDate(goals.date)} tarixindən etibarən qüvvəyə minir. Əvvəlki günlər öz hədəfləri ilə qalır.
          </AppText>
        </View>

        <View style={styles.fields}>
          {fields.map((field) => (
            <Controller
              key={field.name}
              control={control}
              name={field.name}
              render={({ field: input, fieldState }) => (
                <TextField
                  label={field.label}
                  icon={field.icon}
                  value={input.value}
                  onChangeText={(value) => input.onChange(sanitizeDecimal(value, 2))}
                  onBlur={input.onBlur}
                  error={fieldState.error?.message}
                  hint={input.value.trim() === '' ? 'İzlənmir' : undefined}
                  editable={!busy}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder={field.placeholder}
                  testID={`goal-${field.name}`}
                />
              )}
            />
          ))}
          {formState.isSubmitted && !formState.isValid ? null : null}
        </View>

        {goals.history.length > 0 ? (
          <View style={styles.history}>
            <AppText variant="subheading" accessibilityRole="header">
              Tarixçə
            </AppText>
            <View style={[styles.historyList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {goals.history.map((goal, index) => (
                <View key={goal.id} style={[styles.historyRow, index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{formatLongDate(goal.effectiveFrom)}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {goal.id === current?.id ? 'Hazırda qüvvədədir' : 'Bu tarixdən etibarən'}
                    </AppText>
                  </View>
                  <View style={styles.historyValues}>
                    <AppText variant="meta">{goal.energyKcal === null ? '—' : formatKcal(goal.energyKcal)}</AppText>
                    <AppText variant="caption" color="textMuted">
                      Z {goal.proteinGrams === null ? '—' : formatGrams(goal.proteinGrams, false)} · K {goal.carbGrams === null ? '—' : formatGrams(goal.carbGrams, false)} · Y{' '}
                      {goal.fatGrams === null ? '—' : formatGrams(goal.fatGrams, false)}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
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
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  fields: {
    gap: Spacing.md,
  },
  history: {
    gap: Spacing.sm,
  },
  historyList: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  historyValues: {
    alignItems: 'flex-end',
    gap: Spacing.xxs,
  },
});
