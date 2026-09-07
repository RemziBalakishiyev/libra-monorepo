import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { BudgetProgress, type BudgetSummaryData } from '@/components/budget-progress';
import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SelectionSheet, type SelectionOption } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText, MoneyText } from '@/components/text';
import { useToast } from '@/components/toast';
import { categoryColor, categoryVisual, type IconName } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAccounts, useBudget, useCategories, useCreateBudget, useDeleteBudget, useUpdateBudget } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Budget } from '@/lib/api/finance';
import { confirmAsync } from '@/lib/confirm';
import { currentYearMonth, formatMonth, monthNames } from '@/lib/dates';
import { parseAmount } from '@/lib/money';
import { budgetFormSchema, type BudgetForm } from '@/lib/validation/finance';

const LOCKED_REASON = 'Büdcənin dövrü, valyutası və əhatəsi dəyişdirilə bilməz';
const OVERALL_LABEL = 'Ümumi büdcə';
const OVERALL_HINT = 'Bütün xərc kateqoriyaları';
/** Sheet value for the overall scope; the form keeps '' so the schema and API contract stay unchanged. */
const OVERALL_OPTION = 'overall';
const SUCCESS_DELAY_MS = 600;

export function BudgetFormScreen({ id }: { id?: string }) {
  const existing = useBudget(id);
  const categories = useCategories('Expense');
  const accounts = useAccounts();
  const title = id ? 'Büdcəni redaktə et' : 'Yeni büdcə';

  if ((id && existing.isPending) || categories.isPending || accounts.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader title={title} back />
        <FormSkeleton fields={4} />
      </Screen>
    );
  }

  if (id && existing.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader title={title} back />
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }

  if (categories.isError || accounts.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader title={title} back />
        <ErrorState
          error={categories.error ?? accounts.error}
          onRetry={() => {
            void categories.refetch();
            void accounts.refetch();
          }}
        />
      </Screen>
    );
  }

  const currencies = Array.from(new Set((accounts.data ?? []).map((account) => account.currencyCode)));
  return <BudgetEditor budget={existing.data} categories={categories.data ?? []} currencies={currencies.length > 0 ? currencies : ['AZN']} />;
}

type EditorProps = {
  budget: Budget | undefined;
  categories: { id: string; name: string }[];
  currencies: string[];
};

type Phase = 'idle' | 'submitting' | 'success';
type SheetName = 'month' | 'year' | 'scope';

/** Usage recomputed with the amount being typed (docs/DOMAIN.md formulas) so the edit form answers "what if". */
function previewUsage(budget: Budget, amountText: string): { usage: BudgetSummaryData; isPreview: boolean } {
  const amount = parseAmount(amountText);
  if (amount === null || amount <= 0 || amount === budget.amount) {
    return { usage: budget, isPreview: false };
  }
  const remaining = Math.round((amount - budget.usedAmount) * 100) / 100;
  return {
    usage: {
      amount,
      usedAmount: budget.usedAmount,
      remainingAmount: remaining,
      usagePercent: Math.round((budget.usedAmount / amount) * 1000) / 10,
      isOverBudget: budget.usedAmount > amount,
    },
    isPreview: true,
  };
}

export function BudgetEditor({ budget, categories, currencies }: EditorProps) {
  const router = useRouter();
  const toast = useToast();
  const { colors, scheme, shadows, layout } = useTheme();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const [today] = useState(() => currentYearMonth());
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingToast, setPendingToast] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const wide = layout === 'wide';

  const { control, handleSubmit, formState, setValue } = useForm<BudgetForm>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      year: budget?.year ?? today.year,
      month: budget?.month ?? today.month,
      currencyCode: budget?.currencyCode ?? currencies[0] ?? 'AZN',
      categoryId: budget?.categoryId ?? '',
      amount: budget ? String(budget.amount) : '',
    },
  });
  const [year, month, currencyCode, categoryId, amountText] = useWatch({ control, name: ['year', 'month', 'currencyCode', 'categoryId', 'amount'] });

  const busy = phase !== 'idle' || formState.isSubmitting || create.isPending || update.isPending || remove.isPending;
  const category = categories.find((item) => item.id === categoryId);
  const scopeLabel = category?.name ?? budget?.categoryName ?? OVERALL_LABEL;
  const scopeIcon: IconName = category ? categoryVisual(category.name, 'Expense').icon : budget?.categoryName ? categoryVisual(budget.categoryName, 'Expense').icon : 'pie-chart-outline';
  const scopeColor = category ? categoryColor(category.name, scheme, 'Expense') : budget?.categoryName ? categoryColor(budget.categoryName, scheme, 'Expense') : colors.primary;
  const periodLabel = formatMonth(year, month);
  const heroCurrency = currencyCode.length === 3 ? currencyCode : undefined;
  const amount = parseAmount(amountText);
  const preview = budget ? previewUsage(budget, amountText) : null;

  const years = Array.from({ length: 4 }, (_, index) => today.year - 1 + index);
  const monthOptions: SelectionOption<string>[] = monthNames.map((name, index) => ({
    value: String(index + 1),
    label: name,
    hint: year === today.year && index + 1 === today.month ? 'Bu ay' : undefined,
  }));
  const yearOptions: SelectionOption<string>[] = years.map((value) => ({ value: String(value), label: String(value), hint: value === today.year ? 'Bu il' : undefined }));
  const scopeOptions: SelectionOption<string>[] = [
    { value: OVERALL_OPTION, label: OVERALL_LABEL, hint: OVERALL_HINT, icon: 'pie-chart-outline', iconColor: colors.primary },
    ...categories.map((item) => ({
      value: item.id,
      label: item.name,
      icon: categoryVisual(item.name, 'Expense').icon,
      iconColor: categoryColor(item.name, scheme, 'Expense'),
    })),
  ];

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/finance/budgets');
    }
  };

  // The one notification is shown on the destination screen after the success state has been seen.
  useEffect(() => {
    if (phase !== 'success') {
      return undefined;
    }
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/finance/budgets');
      }
      if (pendingToast) {
        toast({ title: pendingToast, tone: 'success' });
      }
    }, SUCCESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, router, toast, pendingToast]);

  const celebrate = () => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  };

  const onValid = async (values: BudgetForm) => {
    if (phase !== 'idle') {
      return;
    }
    setPhase('submitting');
    setServerError(null);
    const parsed = parseAmount(values.amount)!;
    try {
      if (budget) {
        await update.mutateAsync({ id: budget.id, amount: parsed });
      } else {
        await create.mutateAsync({
          year: values.year,
          month: values.month,
          currencyCode: values.currencyCode,
          categoryId: values.categoryId === '' ? null : values.categoryId,
          amount: parsed,
        });
      }
      setPendingToast(budget ? 'Büdcə yeniləndi' : 'Büdcə yaradıldı');
      setPhase('success');
      celebrate();
    } catch (error) {
      setServerError(describeError(error));
      setPhase('idle');
    }
  };

  const onInvalid = (errors: FieldErrors<BudgetForm>) => {
    if (errors.amount) {
      setShakeKey((value) => value + 1);
    }
  };

  const submit = handleSubmit(onValid, onInvalid);

  const onDelete = async () => {
    if (!budget || busy) {
      return;
    }
    const confirmed = await confirmAsync('Büdcəni sil', 'Bu büdcə silinsin? Əməliyyatlara təsir etmir.');
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync(budget.id);
      celebrate();
      goBack();
      toast({ title: 'Büdcə silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const usageBlock =
    budget && preview ? (
      <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
        <BudgetProgress budget={preview.usage} currencyCode={budget.currencyCode} title={scopeLabel} layout="full" />
        <AppText variant="caption" color="textMuted">
          {preview.isPreview ? 'Yeni məbləğə görə ilkin hesablama' : `${formatMonth(budget.year, budget.month)} · ${budget.currencyCode}`}
        </AppText>
      </View>
    ) : null;

  const summaryBlock = !budget ? (
    <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <AppText variant="subheading">Xülasə</AppText>
      <SummaryRow label="Dövr" value={periodLabel} />
      <SummaryRow label="Valyuta" value={heroCurrency ?? '—'} />
      <SummaryRow label="Əhatə" value={scopeLabel} icon={scopeIcon} iconColor={scopeColor} />
      <View style={styles.summaryRow}>
        <AppText variant="meta" color="textSecondary">
          Aylıq limit
        </AppText>
        {amount !== null && amount > 0 && heroCurrency ? (
          <MoneyText amount={amount} currencyCode={heroCurrency} variant="bodyStrong" />
        ) : (
          <AppText variant="bodyStrong" color="textDisabled">
            —
          </AppText>
        )}
      </View>
    </View>
  ) : null;

  const amountField = (
    <Controller
      control={control}
      name="amount"
      render={({ field: { onChange, onBlur, value } }) => (
        <AmountInput
          label="Büdcə məbləği"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          currencyCode={heroCurrency}
          error={formState.errors.amount?.message}
          shakeKey={shakeKey}
          layout="hero"
          flow="Expense"
          helper="Bu ay üçün xərc limiti"
          editable={!busy}
          autoFocus={!budget}
        />
      )}
    />
  );

  const scopeFields = budget ? (
    <View style={styles.fields}>
      <SelectRow label="Dövr" value={formatMonth(budget.year, budget.month)} placeholder="Dövr" onPress={() => undefined} icon="calendar-outline" disabled lockedReason={LOCKED_REASON} />
      <SelectRow label="Valyuta" value={budget.currencyCode} placeholder="Valyuta" onPress={() => undefined} icon="cash-outline" disabled lockedReason={LOCKED_REASON} />
      <SelectRow label="Əhatə" value={scopeLabel} placeholder="Əhatə" onPress={() => undefined} icon={scopeIcon} iconColor={scopeColor} disabled lockedReason={LOCKED_REASON} />
    </View>
  ) : (
    <View style={styles.fields}>
      <View style={styles.periodRow}>
        <View style={styles.periodMonth}>
          <SelectRow label="Ay" value={monthNames[month - 1]} placeholder="Ay seçin" onPress={() => setSheet('month')} icon="calendar-outline" error={formState.errors.month?.message} disabled={busy} />
        </View>
        <View style={styles.periodYear}>
          <SelectRow label="İl" value={String(year)} placeholder="İl" onPress={() => setSheet('year')} error={formState.errors.year?.message} disabled={busy} />
        </View>
      </View>
      <Controller
        control={control}
        name="currencyCode"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Valyuta"
            value={value}
            onChangeText={(text) => onChange(text.toUpperCase())}
            onBlur={onBlur}
            error={formState.errors.currencyCode?.message}
            hint="ISO kod, məs. AZN"
            icon="cash-outline"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            editable={!busy}
          />
        )}
      />
      <SelectRow
        label="Əhatə"
        value={scopeLabel}
        placeholder="Əhatə seçin"
        onPress={() => setSheet('scope')}
        icon={scopeIcon}
        iconColor={scopeColor}
        hint={category ? undefined : OVERALL_HINT}
        error={formState.errors.categoryId?.message}
        disabled={busy}
      />
    </View>
  );

  const deleteAction = budget ? (
    <View style={styles.danger}>
      <Button title="Büdcəni sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} loading={remove.isPending} disabled={phase !== 'idle'} />
    </View>
  ) : null;

  const footer = (
    <View style={styles.footer}>
      {serverError ? <ServerNotice message={serverError} /> : null}
      <Button
        title={budget ? 'Yadda saxla' : 'Büdcə yarat'}
        onPress={() => void submit()}
        loading={phase === 'submitting'}
        success={phase === 'success'}
        successTitle={budget ? 'Yadda saxlanıldı' : 'Büdcə yaradıldı'}
        disabled={remove.isPending}
        style={wide ? styles.footerButtonWide : undefined}
      />
    </View>
  );

  return (
    <Screen maxWidth={wide ? Layout.maxFormWide : Layout.maxForm} footer={footer}>
      <ScreenHeader title={budget ? 'Büdcəni redaktə et' : 'Yeni büdcə'} eyebrow={budget ? formatMonth(budget.year, budget.month) : undefined} subtitle={budget ? undefined : 'Bir ay üçün xərc limiti təyin edin.'} back />

      {wide ? (
        <View style={styles.columns}>
          <View style={styles.formColumn}>
            <Entrance index={0}>{amountField}</Entrance>
            <Entrance index={1}>{scopeFields}</Entrance>
            {deleteAction ? <Entrance index={2}>{deleteAction}</Entrance> : null}
          </View>
          <View style={styles.sideColumn}>
            <Entrance index={1}>{usageBlock ?? summaryBlock}</Entrance>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {usageBlock ? <Entrance index={0}>{usageBlock}</Entrance> : null}
          <Entrance index={usageBlock ? 1 : 0}>{amountField}</Entrance>
          <Entrance index={usageBlock ? 2 : 1}>{scopeFields}</Entrance>
          {deleteAction ? <Entrance index={3}>{deleteAction}</Entrance> : null}
        </View>
      )}

      {!budget ? (
        <>
          <SelectionSheet
            visible={sheet === 'month'}
            title="Ay"
            options={monthOptions}
            value={String(month)}
            onSelect={(value) => {
              setValue('month', Number(value), { shouldValidate: true, shouldDirty: true });
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
          <SelectionSheet
            visible={sheet === 'year'}
            title="İl"
            options={yearOptions}
            value={String(year)}
            onSelect={(value) => {
              setValue('year', Number(value), { shouldValidate: true, shouldDirty: true });
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
          <SelectionSheet
            visible={sheet === 'scope'}
            title="Əhatə"
            options={scopeOptions}
            value={categoryId === '' ? OVERALL_OPTION : categoryId}
            onSelect={(value) => {
              setValue('categoryId', value === OVERALL_OPTION ? '' : value, { shouldValidate: true, shouldDirty: true });
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
            emptyMessage="Aktiv xərc kateqoriyası yoxdur."
          />
        </>
      ) : null}
    </Screen>
  );
}

function SummaryRow({ label, value, icon, iconColor }: { label: string; value: string; icon?: IconName; iconColor?: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <View style={styles.summaryValue}>
        {icon ? <Ionicons name={icon} size={16} color={iconColor} /> : null}
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.summaryText}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

/** Server-side failure (e.g. 409 duplicate scope) shown next to the action; the page is never dimmed. */
function ServerNotice({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: colors.errorSoft }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <AppText variant="meta" color="error" style={styles.noticeText}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.section,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxxl,
  },
  formColumn: {
    flex: 1,
    maxWidth: Layout.maxForm,
    gap: Spacing.section,
  },
  sideColumn: {
    flex: 1,
    minWidth: 0,
  },
  fields: {
    gap: Spacing.lg,
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  periodMonth: {
    flex: 3,
    minWidth: 0,
  },
  periodYear: {
    flex: 2,
    minWidth: 0,
  },
  surface: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 28,
  },
  summaryValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 1,
  },
  summaryText: {
    flexShrink: 1,
  },
  danger: {
    alignItems: 'stretch',
  },
  footer: {
    gap: Spacing.md,
  },
  footerButtonWide: {
    alignSelf: 'flex-end',
    minWidth: 240,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  noticeText: {
    flex: 1,
  },
});
