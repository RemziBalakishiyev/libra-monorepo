import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { StyleSheet, View, type LayoutChangeEvent, type ScrollView } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Button } from '@/components/button';
import { CategoryField } from '@/components/category-field';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { ProgressTrack } from '@/components/budget-progress';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SelectionSheet } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual, categoryColor, categoryVisual } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAccounts, useBudgets, useCategories, useCreateTransaction, useDashboard, useDeleteTransaction, useTransaction, useUpdateTransaction } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Account, Category, Transaction, TransactionType } from '@/lib/api/finance';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { calendarDayIn, localDateToUtcIso, todayIsoDate, utcIsoToLocalDate } from '@/lib/dates';
import { budgetImpact, type OriginalContribution } from '@/lib/finance-insights';
import { successHaptic } from '@/lib/haptics';
import { useMotion } from '@/lib/motion';
import { parseAmount } from '@/lib/money';
import { transactionFormSchema, type TransactionForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/** Navigate back this long after a confirmed save, so the success state is seen but never blocks. */
const SUCCESS_DELAY_MS = 550;

type TransactionFormScreenProps = {
  id?: string;
  initialType?: TransactionType;
};

export function TransactionFormScreen({ id, initialType = 'Expense' }: TransactionFormScreenProps) {
  const existing = useTransaction(id);
  const accounts = useAccounts();
  const categories = useCategories();
  const title = id ? 'Əməliyyat' : initialType === 'Income' ? 'Yeni gəlir' : 'Yeni xərc';

  if ((id && existing.isPending) || accounts.isPending || categories.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <FormSkeleton fields={5} />
      </Screen>
    );
  }

  if (id && existing.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }

  if (accounts.isError || categories.isError) {
    const error = accounts.error ?? categories.error;
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <ErrorState
          error={error}
          onRetry={() => {
            void accounts.refetch();
            void categories.refetch();
          }}
        />
      </Screen>
    );
  }

  return <TransactionEditor transaction={existing.data} initialType={initialType} accounts={accounts.data ?? []} categories={categories.data ?? []} />;
}

type EditorProps = {
  transaction: Transaction | undefined;
  initialType: TransactionType;
  accounts: Account[];
  categories: Category[];
};

type Phase = 'idle' | 'submitting' | 'success';

/** Immutable budget context of one submission (see `submissionBaseline`). */
interface SubmissionBaseline {
  categoryBudget: { amount: number; usedAmount: number } | null;
  overallBudget: { amount: number; usedAmount: number } | null;
  spentInCategory: number;
}

type FieldKey = 'amount' | 'accountId' | 'categoryId' | 'date' | 'note';

/** Field order on screen, used to scroll the first invalid one into view. */
const FIELD_ORDER: FieldKey[] = ['amount', 'categoryId', 'accountId', 'date', 'note'];

function TransactionEditor({ transaction, initialType, accounts, categories }: EditorProps) {
  const router = useRouter();
  const { colors, layout, reducedMotion } = useTheme();
  const toast = useToast();
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const requestId = useClientRequestId();
  const dashboard = useDashboard({});
  const budgets = useBudgets(dashboard.data ? { year: dashboard.data.year, month: dashboard.data.month, currencyCode: dashboard.data.currencyCode } : {});
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [accountSheet, setAccountSheet] = useState(false);
  /**
   * Budget figures captured when a submission starts. The mutation invalidates every finance query, so live
   * budgets already include the saved amount while the success state is still on screen; the preview keeps
   * comparing against this snapshot until the form leaves (or the request fails and editing resumes).
   */
  const [submissionBaseline, setSubmissionBaseline] = useState<SubmissionBaseline | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});
  const wide = layout === 'wide';

  const { control, handleSubmit, formState, setValue } = useForm<TransactionForm>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      // Preselect the first account in the dashboard currency (or the only/first account) so an expense takes 2–3 taps.
      accountId: transaction?.accountId ?? (accounts.find((item) => item.currencyCode === dashboard.data?.currencyCode) ?? accounts[0])?.id ?? '',
      categoryId: transaction?.categoryId ?? '',
      amount: transaction ? String(transaction.amount).replace('.', ',') : '',
      date: transaction ? utcIsoToLocalDate(transaction.occurredAtUtc) : todayIsoDate(),
      note: transaction?.note ?? '',
    },
  });
  const accountId = useWatch({ control, name: 'accountId' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const amountText = useWatch({ control, name: 'amount' });
  const dateText = useWatch({ control, name: 'date' });
  const account = accounts.find((item) => item.id === accountId);
  const category = categories.find((item) => item.id === categoryId);
  const typeCategories = categories.filter((item) => item.kind === type);
  const amount = parseAmount(amountText ?? '') ?? 0;
  // Fields lock while the request is in flight; the short success state keeps them readable (no dimmed page).
  const busy = phase === 'submitting' || remove.isPending;

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const changeType = (next: TransactionType) => {
    if (next === type) {
      return;
    }
    setType(next);
    setValue('categoryId', '', { shouldValidate: false });
  };

  /** Called from layout events only: remembers where each field sits so an invalid submit can scroll to it. */
  const onFieldLayout = (key: FieldKey, event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };

  const revealFirstError = (errors: FieldErrors<TransactionForm>) => {
    const first = FIELD_ORDER.find((key) => errors[key]);
    if (first === 'amount' || !first) {
      setShakeKey((key) => key + 1);
    }
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
      setSubmissionBaseline({ categoryBudget: liveCategoryBudget ? { amount: liveCategoryBudget.amount, usedAmount: liveCategoryBudget.usedAmount } : null, overallBudget: dashboard.data?.overallBudget ? { amount: dashboard.data.overallBudget.amount, usedAmount: dashboard.data.overallBudget.usedAmount } : null, spentInCategory: liveSpentInCategory });
      setPhase('submitting');
      const input = {
        accountId: values.accountId,
        categoryId: values.categoryId,
        type,
        amount: parseAmount(values.amount)!,
        occurredAtUtc: localDateToUtcIso(values.date),
        note: values.note.trim() === '' ? null : values.note.trim(),
      };
      const message = transaction ? 'Dəyişikliklər yadda saxlanıldı' : type === 'Income' ? 'Gəlir əlavə olundu' : 'Xərc əlavə olundu';
      try {
        if (transaction) {
          await update.mutateAsync({ id: transaction.id, input });
        } else {
          // The same id is sent on every retry of this form, so a double tap cannot create two records.
          await create.mutateAsync({ input, clientRequestId: requestId.current() });
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
        setPhase('idle');
        setSubmissionBaseline(null);
        setServerError(describeError(error));
      }
    }, revealFirstError)();
  };

  const onDelete = async () => {
    if (!transaction) {
      return;
    }
    const confirmed = await confirmAsync('Əməliyyatı sil', `${transaction.categoryName} · ${formatAmount(transaction.amount, transaction.currencyCode)} · ${transaction.accountName} silinsin? Balans və büdcə dərhal yenilənəcək.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync(transaction.id);
      router.back();
      toast({ title: 'Əməliyyat silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  // Budget impact is only meaningful inside the dashboard month and currency.
  const sameCurrency = !account || !dashboard.data || account.currencyCode === dashboard.data.currencyCode;
  const targetMonth = dateText ? { year: Number(dateText.slice(0, 4)), month: Number(dateText.slice(5, 7)) } : null;
  const inDashboardMonth = Boolean(dashboard.data && targetMonth && targetMonth.year === dashboard.data.year && targetMonth.month === dashboard.data.month);
  const liveCategoryBudget = category && sameCurrency ? (budgets.data?.find((budget) => budget.categoryId === category.id) ?? null) : null;
  const liveSpentInCategory = category ? (dashboard.data?.expenseByCategory.find((item) => item.categoryId === category.id)?.amount ?? 0) : 0;
  // While a submission is in flight or its success state is showing, compare against the frozen baseline.
  const frozen = phase !== 'idle' ? submissionBaseline : null;
  const categoryBudget = frozen ? frozen.categoryBudget : liveCategoryBudget ? { amount: liveCategoryBudget.amount, usedAmount: liveCategoryBudget.usedAmount } : null;
  const overallBudget = frozen ? frozen.overallBudget : (dashboard.data?.overallBudget ?? null);
  const original: OriginalContribution | undefined =
    transaction && dashboard.data && transaction.type === 'Expense' && transaction.currencyCode === dashboard.data.currencyCode
      ? (() => {
          const day = calendarDayIn(transaction.occurredAtUtc, dashboard.data.timeZone);
          return { amount: transaction.amount, sameMonth: day.year === dashboard.data.year && day.month === dashboard.data.month, sameCategory: transaction.categoryId === category?.id };
        })()
      : undefined;
  const impact =
    type === 'Expense' && sameCurrency && inDashboardMonth && category
      ? budgetImpact(amount, category.name, categoryBudget, overallBudget, original)
      : null;
  const spentInCategory = frozen ? frozen.spentInCategory : liveSpentInCategory;
  const currencyCode = account?.currencyCode ?? dashboard.data?.currencyCode ?? 'AZN';
  const submitTitle = transaction ? 'Yadda saxla' : type === 'Income' ? 'Gəlir əlavə et' : 'Xərc əlavə et';
  // Real usage this month (largest first) decides the shortcut order; income has no usage data, so the configured order stays.
  const recentIds = type === 'Expense' ? (dashboard.data?.expenseByCategory.map((item) => item.categoryId) ?? []) : [];

  const fields = (
    <>
      <SegmentedControl
        accessibilityLabel="Növ"
        value={type}
        onChange={changeType}
        disabled={busy}
        options={[
          { value: 'Expense', label: 'Xərc', tint: 'expense', icon: 'arrow-up-outline' },
          { value: 'Income', label: 'Gəlir', tint: 'income', icon: 'arrow-down-outline' },
        ]}
      />

      <View onLayout={(event) => onFieldLayout('amount', event)}>
        <Controller
          control={control}
          name="amount"
          render={({ field: { onChange, onBlur, value } }) => (
            <AmountInput value={value} onChangeText={onChange} onBlur={onBlur} currencyCode={account?.currencyCode} error={formState.errors.amount?.message} flow={type} editable={!busy} shakeKey={shakeKey} autoFocus={!transaction} />
          )}
        />
      </View>

      <View onLayout={(event) => onFieldLayout('categoryId', event)}>
        <Controller
          control={control}
          name="categoryId"
          render={({ field: { onChange, value } }) => (
            <CategoryField categories={typeCategories.map((item) => ({ id: item.id, name: item.name, kind: item.kind }))} value={value} onChange={onChange} error={formState.errors.categoryId?.message} disabled={busy} recentIds={recentIds} shortcutLimit={4} />
          )}
        />
      </View>

      {/* Account, date and the optional note form one calm section under the amount and category. */}
      <View style={styles.details}>
        <AppText variant="overline" color="textMuted">
          TƏFƏRRÜATLAR
        </AppText>
        <View onLayout={(event) => onFieldLayout('accountId', event)}>
          <SelectRow
          label="Hesab"
          value={account?.name}
          hint={account ? `${accountVisual(account.type).label} · ${account.currencyCode}` : undefined}
          placeholder="Hesab seçin"
          icon={account ? accountVisual(account.type).icon : 'wallet-outline'}
          iconColor={account ? colors.primary : undefined}
          onPress={() => setAccountSheet(true)}
          error={formState.errors.accountId?.message}
          disabled={busy}
        />
      </View>

      <View onLayout={(event) => onFieldLayout('date', event)}>
        <Controller control={control} name="date" render={({ field: { onChange, value } }) => <DateField label="Tarix" value={value} onChange={onChange} error={formState.errors.date?.message} disabled={busy} />} />
      </View>

      <View onLayout={(event) => onFieldLayout('note', event)}>
        <Controller
          control={control}
          name="note"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={value} onChangeText={onChange} onBlur={onBlur} error={formState.errors.note?.message} editable={!busy} placeholder="Məsələn, Bravo" returnKeyType="done" onSubmitEditing={submit} />
          )}
        />
      </View>
      </View>

      {impact && !wide ? <BudgetImpactNote impact={impact} currencyCode={currencyCode} editing={Boolean(transaction)} /> : null}

      {transaction ? (
        <View style={styles.dangerZone}>
          <Button title="Əməliyyatı sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} />
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      footer={<Button title={submitTitle} onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle={transaction ? 'Yadda saxlanıldı' : 'Əlavə olundu'} testID="transaction-submit" />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={transaction ? 'Əməliyyat' : type === 'Income' ? 'Yeni gəlir' : 'Yeni xərc'} size="compact" />
        <ServerErrorBanner message={serverError} />
        {wide ? (
          <View style={styles.columns}>
            <View style={[styles.stack, styles.formColumn]}>{fields}</View>
            <View style={styles.summaryColumn}>
              <LiveSummary account={account} category={category} spentInCategory={spentInCategory} impact={impact} currencyCode={currencyCode} type={type} amount={amount} editing={Boolean(transaction)} />
            </View>
          </View>
        ) : (
          fields
        )}
      </Entrance>

      <SelectionSheet
        visible={accountSheet}
        title="Hesab"
        value={account?.id ?? ''}
        options={accounts.map((item) => ({ value: item.id, label: item.name, hint: `${accountVisual(item.type).label} · ${item.currencyCode}`, icon: accountVisual(item.type).icon, iconColor: colors.primary, trailing: <MoneyText variant="meta" color="textSecondary" amount={item.currentBalance} currencyCode={item.currencyCode} showCode={false} /> }))}
        onSelect={(value) => {
          setValue('accountId', value, { shouldValidate: true });
          setAccountSheet(false);
        }}
        onClose={() => setAccountSheet(false)}
        emptyMessage="Aktiv hesab yoxdur. Əvvəlcə hesab yaradın."
      />
    </Screen>
  );
}

/** Explains what this expense does to the relevant budget. Warns; never prevents a legitimate expense. */
function BudgetImpactNote({ impact, currencyCode, editing }: { impact: NonNullable<ReturnType<typeof budgetImpact>>; currencyCode: string; editing: boolean }) {
  const { colors } = useTheme();
  const motion = useMotion();
  const tone = impact.exceeds ? colors.warning : colors.income;
  const toneText = impact.exceeds ? 'warningText' : 'incomeText';
  return (
    <Entrance exiting={motion.exit()} accessibilityRole="summary" accessibilityLiveRegion="polite" style={[styles.impact, { backgroundColor: impact.exceeds ? colors.warningSoft : colors.surface, borderColor: impact.exceeds ? colors.warningSoft : colors.border }]}>
      <View style={styles.impactHeader}>
        <Ionicons name={impact.exceeds ? 'alert-circle' : 'checkmark-circle'} size={18} color={impact.exceeds ? colors.warningText : colors.incomeText} />
        <AppText variant="meta" style={styles.flex}>
          {impact.title}: qalıq {formatAmount(impact.remainingBefore, currencyCode, false)} → {formatAmount(impact.remainingAfter, currencyCode)}
        </AppText>
      </View>
      <ProgressTrack percent={impact.percentAfter} color={tone} label={`${impact.title} bu xərcdən sonra`} height={6} />
      <AppText variant="caption" color={impact.exceeds ? toneText : 'textSecondary'}>
        {impact.exceeds ? `Bu xərc büdcəni ${formatAmount(-impact.remainingAfter, currencyCode)} aşacaq. Yenə də əlavə edə bilərsiniz.` : `Bu xərcdən sonra büdcənin ${Math.max(0, Math.round(100 - impact.percentAfter))}%-i qalır.`}
        {editing ? ' Əvvəlki məbləğ nəzərə alınıb.' : ''}
      </AppText>
    </Entrance>
  );
}

type LiveSummaryProps = {
  account: Account | undefined;
  category: Category | undefined;
  spentInCategory: number;
  impact: ReturnType<typeof budgetImpact>;
  currencyCode: string;
  type: TransactionType;
  amount: number;
  editing: boolean;
};

/** Desktop companion column: the account, the category's month so far, and the budget consequence. */
function LiveSummary({ account, category, spentInCategory, impact, currencyCode, type, amount, editing }: LiveSummaryProps) {
  const { colors, shadows, scheme } = useTheme();
  const visual = category ? categoryVisual(category.name, category.kind) : null;
  const tint = category ? categoryColor(category.name, scheme, category.kind) : colors.textMuted;
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <AppText variant="subheading">Xülasə</AppText>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={account ? accountVisual(account.type).icon : 'wallet-outline'} size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <AppText variant="meta" color="textSecondary">
            Hesab
          </AppText>
          <AppText variant="bodyStrong">{account?.name ?? 'Seçilməyib'}</AppText>
        </View>
        {account ? <MoneyText variant="bodyStrong" amount={account.currentBalance} currencyCode={account.currencyCode} highlightNegative showCode={false} /> : null}
      </View>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name={visual?.icon ?? 'pricetag-outline'} size={18} color={tint} />
        </View>
        <View style={styles.flex}>
          <AppText variant="meta" color="textSecondary">
            Kateqoriya · bu ay
          </AppText>
          <AppText variant="bodyStrong">{category?.name ?? 'Seçilməyib'}</AppText>
        </View>
        {category && type === 'Expense' ? <MoneyText variant="bodyStrong" amount={spentInCategory} currencyCode={currencyCode} showCode={false} /> : null}
      </View>
      {amount > 0 ? (
        <View style={[styles.summaryRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md }]}>
          <View style={styles.flex}>
            <AppText variant="meta" color="textSecondary">
              {type === 'Income' ? 'Gəlir' : 'Xərc'}
            </AppText>
          </View>
          <MoneyText variant="heading" amount={amount} currencyCode={currencyCode} flow={type} showCode={false} />
        </View>
      ) : null}
      {impact ? <BudgetImpactNote impact={impact} currencyCode={currencyCode} editing={editing} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  details: {
    gap: Spacing.md,
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
  dangerZone: {
    paddingTop: Spacing.md,
  },
  impact: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
