import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View, type ScrollView, type TextInput } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { Button } from '@/components/button';
import { CategoryField } from '@/components/category-field';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { SelectRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SelectionSheet } from '@/components/selection-sheet';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText, MoneyText } from '@/components/text';
import { useToast } from '@/components/toast';
import { accountVisual } from '@/constants/categories';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useAccounts, useCategories } from '@/hooks/use-finance';
import { useCreateRecurringTemplate, useDeleteRecurringTemplate, useRecurringTemplate, useUpdateRecurringTemplate } from '@/hooks/use-recurring';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { RecurringTemplate } from '@/lib/api/recurring';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { todayIsoDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/money';
import { recurringTemplateFormSchema, type RecurringTemplateForm } from '@/lib/validation/finance';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

const SUCCESS_DELAY_MS = 550;
const dayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

export function RecurringFormScreen({ id }: { id?: string }) {
  const existing = useRecurringTemplate(id);
  const title = id ? 'Şablona düzəliş' : 'Yeni təkrarlanan';

  if (id && existing.isPending) {
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

  return <TemplateEditor template={existing.data} />;
}

type Phase = 'idle' | 'submitting' | 'success';

function defaultsFor(template: RecurringTemplate | undefined): RecurringTemplateForm {
  return {
    title: template?.title ?? '',
    type: template?.type ?? 'Expense',
    amount: template ? String(template.amount) : '',
    categoryId: template?.categoryId ?? '',
    accountId: template?.accountId ?? '',
    dayOfMonth: template?.dayOfMonth ?? 1,
    startDate: template?.startDate ?? todayIsoDate(),
    endDate: template?.endDate ?? '',
    note: template?.note ?? '',
  };
}

/**
 * A plan, not a payment: nothing here moves money. Editing applies to every month that is not yet recorded —
 * earlier ones the user never got to included — and leaves recorded months exactly as they were. A template
 * with recorded history is deactivated rather than deleted.
 */
function TemplateEditor({ template }: { template: RecurringTemplate | undefined }) {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const create = useCreateRecurringTemplate();
  const update = useUpdateRecurringTemplate();
  const remove = useDeleteRecurringTemplate();
  const requestId = useClientRequestId();
  const [phase, setPhase] = useState<Phase>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [accountSheet, setAccountSheet] = useState(false);
  const [daySheet, setDaySheet] = useState(false);
  const [showEnd, setShowEnd] = useState(Boolean(template?.endDate));
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const wide = layout === 'wide';

  const { control, handleSubmit, setValue } = useForm<RecurringTemplateForm>({
    resolver: zodResolver(recurringTemplateFormSchema),
    defaultValues: defaultsFor(template),
  });
  const [type, accountId, dayOfMonth, amountText] = useWatch({ control, name: ['type', 'accountId', 'dayOfMonth', 'amount'] });
  const accounts = useAccounts();
  const categories = useCategories(type);
  const account = accounts.data?.find((candidate) => candidate.id === accountId);
  const amount = parseAmount(amountText ?? '');
  const busy = phase === 'submitting' || remove.isPending || update.isPending;

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
    void handleSubmit(
      async (values) => {
        setServerError(null);
        setPhase('submitting');
        const input = {
          title: values.title.trim(),
          type: values.type,
          amount: parseAmount(values.amount)!,
          categoryId: values.categoryId,
          accountId: values.accountId,
          dayOfMonth: values.dayOfMonth,
          startDate: values.startDate,
          endDate: values.endDate === '' ? null : values.endDate,
          note: values.note.trim() === '' ? null : values.note.trim(),
        };
        try {
          if (template) {
            await update.mutateAsync({ id: template.id, input: { ...input, isActive: template.isActive, expectedUpdatedAtUtc: template.updatedAtUtc } });
          } else {
            await create.mutateAsync({ input, clientRequestId: requestId.current() });
            requestId.reset();
          }
          setPhase('success');
          successHaptic();
          doneTimer.current = setTimeout(() => {
            doneTimer.current = null;
            router.back();
            toast({ title: template ? 'Şablon yeniləndi' : 'Şablon əlavə olundu', tone: 'success' });
          }, SUCCESS_DELAY_MS);
        } catch (error) {
          setPhase('idle');
          setServerError(describeError(error));
        }
      },
      () => {
        setShakeKey((key) => key + 1);
        titleRef.current?.focus();
      },
    )();
  };

  const onToggleActive = async () => {
    if (!template) {
      return;
    }
    const deactivating = template.isActive;
    if (deactivating) {
      const confirmed = await confirmAsync('Şablonu dayandır', `“${template.title}” bundan sonra heç bir ayda təklif olunmayacaq. Qeyd olunmuş aylar tarixçədə qalır; qeyd olunmamış aylar avtomatik ödənilmiş sayılmır.`, 'Dayandır', false);
      if (!confirmed) {
        return;
      }
    }
    setServerError(null);
    try {
      await update.mutateAsync({
        id: template.id,
        input: {
          title: template.title,
          type: template.type,
          amount: template.amount,
          categoryId: template.categoryId,
          accountId: template.accountId,
          dayOfMonth: template.dayOfMonth,
          startDate: template.startDate,
          endDate: template.endDate,
          note: template.note,
          isActive: !template.isActive,
          expectedUpdatedAtUtc: template.updatedAtUtc,
        },
      });
      toast({ title: deactivating ? 'Şablon dayandırıldı' : 'Şablon aktivləşdirildi', tone: 'success' });
      router.back();
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const onDelete = async () => {
    if (!template) {
      return;
    }
    const confirmed = await confirmAsync('Şablonu sil', `“${template.title}” silinsin? Qeyd olunmuş ayları olan şablon silinmir, yalnız dayandırılır.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync(template.id);
      router.back();
      toast({ title: 'Şablon silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const form = (
    <>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            accessibilityLabel="Növ"
            testID="template-type"
            value={field.value}
            onChange={(value) => {
              field.onChange(value);
              setValue('categoryId', '', { shouldValidate: false });
            }}
            disabled={busy}
            options={[
              { value: 'Expense', label: 'Xərc', icon: 'arrow-up-outline', tint: 'expense' },
              { value: 'Income', label: 'Gəlir', icon: 'arrow-down-outline', tint: 'income' },
            ]}
          />
        )}
      />
      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <TextField ref={titleRef} label="Ad" icon="repeat-outline" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} editable={!busy} placeholder={type === 'Income' ? 'Məsələn, Maaş' : 'Məsələn, Kirayə'} autoFocus={!template} testID="template-title" />
        )}
      />
      <Controller
        control={control}
        name="amount"
        render={({ field, fieldState }) => <AmountInput label="Aylıq məbləğ" layout="field" value={field.value} onChangeText={field.onChange} currencyCode={account?.currencyCode} error={fieldState.error?.message} shakeKey={shakeKey} flow={type} editable={!busy} testID="template-amount" />}
      />
      <Controller
        control={control}
        name="accountId"
        render={({ fieldState }) => (
          <SelectRow
            label="Hesab"
            value={account?.name}
            placeholder="Hesab seçin"
            hint={account ? `${accountVisual(account.type).label} · ${account.currencyCode} · valyuta bu hesabdan götürülür` : 'Şablonun valyutası seçilən hesabdan götürülür'}
            icon={account ? accountVisual(account.type).icon : 'wallet-outline'}
            error={fieldState.error?.message}
            disabled={busy}
            onPress={() => setAccountSheet(true)}
          />
        )}
      />
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => <CategoryField value={field.value} onChange={field.onChange} categories={categories.data ?? []} error={fieldState.error?.message} disabled={busy} />}
      />
      <Controller
        control={control}
        name="dayOfMonth"
        render={({ fieldState }) => (
          <SelectRow
            label="Ayın günü"
            value={`${dayOfMonth}`}
            placeholder="Gün seçin"
            hint={dayOfMonth >= 29 ? 'Qısa aylarda ayın son gününə keçir, növbəti ay yenidən bu gün olur' : 'Hər ay bu gün'}
            icon="calendar-number-outline"
            error={fieldState.error?.message}
            disabled={busy}
            onPress={() => setDaySheet(true)}
          />
        )}
      />
      <View style={styles.datesRow}>
        <Controller
          control={control}
          name="startDate"
          render={({ field, fieldState }) => (
            <View style={styles.flex}>
              <DateField label="Başlanğıc" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
            </View>
          )}
        />
        {showEnd ? (
          <Controller
            control={control}
            name="endDate"
            render={({ field, fieldState }) => (
              <View style={styles.flex}>
                <DateField label="Bitmə" value={field.value === '' ? todayIsoDate() : field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
              </View>
            )}
          />
        ) : null}
      </View>
      {!showEnd ? (
        <Button
          title="Bitmə tarixi əlavə et"
          variant="ghost"
          size="sm"
          icon="calendar-outline"
          onPress={() => {
            setShowEnd(true);
            setValue('endDate', todayIsoDate(), { shouldValidate: true });
          }}
          disabled={busy}
        />
      ) : (
        <Button
          title="Bitmə tarixini sil"
          variant="ghost"
          size="sm"
          icon="close-outline"
          onPress={() => {
            setShowEnd(false);
            setValue('endDate', '', { shouldValidate: true });
          }}
          disabled={busy}
        />
      )}
      <Controller
        control={control}
        name="note"
        render={({ field, fieldState }) => <TextField label="Qeyd (istəyə bağlı)" icon="create-outline" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} editable={!busy} testID="template-note" />}
      />

      <View style={[styles.explainer, { backgroundColor: colors.surfaceSubtle }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={styles.flex}>
          {account && amount
            ? `Hər ay ${dayOfMonth}-də ${type === 'Income' ? 'gəlir' : 'ödəniş'} gözlənilir: `
            : 'Şablon plandır: '}
          {account && amount ? <MoneyText variant="caption" color="textSecondary" amount={amount} currencyCode={account.currencyCode} /> : null}
          {account && amount ? '. ' : ''}
          Heç nə avtomatik qeyd olunmur — hər ayı Təkrarlananlar ekranında özünüz təsdiqləyirsiniz.
        </AppText>
      </View>

      {template ? (
        <View style={styles.dangerZone}>
          <Button
            title={template.isActive ? 'Şablonu dayandır' : 'Şablonu aktivləşdir'}
            variant={template.isActive ? 'secondary' : 'soft'}
            icon={template.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            onPress={() => void onToggleActive()}
            disabled={busy}
            testID="template-toggle-active"
          />
          <Button title="Şablonu sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} testID="template-delete" />
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      testID="template-form"
      footer={<Button title={template ? 'Yadda saxla' : 'Şablon əlavə et'} onPress={submit} loading={phase === 'submitting'} success={phase === 'success'} successTitle={template ? 'Yadda saxlanıldı' : 'Əlavə olundu'} testID="template-submit" />}>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={template ? 'Şablona düzəliş' : 'Yeni təkrarlanan'} size="compact" />
        <ServerErrorBanner message={serverError} />
        {form}
      </Entrance>

      <SelectionSheet
        visible={accountSheet}
        title="Hesab"
        value={accountId ?? ''}
        options={(accounts.data ?? [])
          .filter((item) => !item.isArchived)
          .map((item) => ({ value: item.id, label: item.name, hint: `${accountVisual(item.type).label} · ${item.currencyCode}`, icon: accountVisual(item.type).icon, iconColor: colors.primary }))}
        onSelect={(value) => {
          setValue('accountId', value, { shouldValidate: true });
          setAccountSheet(false);
        }}
        onClose={() => setAccountSheet(false)}
        emptyMessage="Aktiv hesab yoxdur. Əvvəlcə hesab yaradın."
      />
      <SelectionSheet
        visible={daySheet}
        title="Ayın günü"
        value={String(dayOfMonth)}
        options={dayOptions.map((day) => ({ value: String(day), label: String(day), hint: day >= 29 ? 'Qısa aylarda ayın son günü' : undefined }))}
        onSelect={(value) => {
          setValue('dayOfMonth', Number(value), { shouldValidate: true });
          setDaySheet(false);
        }}
        onClose={() => setDaySheet(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  stack: {
    gap: Spacing.lg,
  },
  datesRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  explainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  dangerZone: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
});
