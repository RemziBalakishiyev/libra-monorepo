import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { FieldMessage, SwitchRow, TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { categoryColor, categoryVisual } from '@/constants/categories';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api/client';
import { describeError } from '@/lib/api/errors';
import type { Category, CategoryKind } from '@/lib/api/finance';
import { withAlpha } from '@/lib/color';
import { confirmAsync } from '@/lib/confirm';
import { categoryFormSchema, type CategoryForm } from '@/lib/validation/finance';

const kindOptions: readonly SegmentOption<CategoryKind>[] = [
  { value: 'Expense', label: 'Xərc', tint: 'expense' },
  { value: 'Income', label: 'Gəlir', tint: 'income' },
];

/** How long the success state stays visible before the screen pops. */
const SUCCESS_FEEDBACK_MS = 600;

type Phase = 'idle' | 'submitting' | 'deleting' | 'saved' | 'deleted';

type AppRouter = ReturnType<typeof useRouter>;

/** Pops back to the list, or replaces it when the form was opened directly (deep link, page refresh on web). */
function leave(router: AppRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/finance/categories');
  }
}

type CategoryFormScreenProps = {
  /** Existing category to edit; omit to create. */
  id?: string;
  initialKind?: CategoryKind;
};

export function CategoryFormScreen({ id, initialKind = 'Expense' }: CategoryFormScreenProps) {
  const router = useRouter();
  const categories = useCategories(undefined, true);
  const title = id ? 'Kateqoriya' : 'Yeni kateqoriya';

  if (id && categories.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} onBack={() => leave(router)} />
        <FormSkeleton fields={2} label="Kateqoriya yüklənir…" />
      </Screen>
    );
  }

  if (id && categories.isError) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} onBack={() => leave(router)} />
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      </Screen>
    );
  }

  const category = id ? categories.data?.find((candidate) => candidate.id === id) : undefined;
  if (id && !category) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} onBack={() => leave(router)} />
        <EmptyState icon="pricetag-outline" title="Kateqoriya tapılmadı" message="Bu kateqoriya silinmiş ola bilər." actionTitle="Siyahıya qayıt" onAction={() => leave(router)} />
      </Screen>
    );
  }

  return <CategoryEditor category={category} initialKind={initialKind} />;
}

type CategoryEditorProps = {
  category: Category | undefined;
  initialKind: CategoryKind;
};

/**
 * Create or edit one category. Kind is immutable after creation; a name must be unique per kind (409 shows the
 * server message under the field); categories in use cannot be deleted, only archived (409 on delete).
 */
function CategoryEditor({ category, initialKind }: CategoryEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const { layout } = useTheme();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [phase, setPhase] = useState<Phase>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(category?.isArchived ?? false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wide = layout === 'wide';
  const locked = Boolean(category);

  const { control, handleSubmit, formState, setError } = useForm<CategoryForm>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category?.name ?? '', kind: category?.kind ?? initialKind },
  });
  const name = useWatch({ control, name: 'name' });
  const kind = useWatch({ control, name: 'kind' });
  const busy = phase !== 'idle';

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const finish = (next: 'saved' | 'deleted', message: string) => {
    setPhase(next);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    // The one notification is shown on the destination screen after the success state has been seen.
    doneTimer.current = setTimeout(() => {
      doneTimer.current = null;
      leave(router);
      toast({ title: message, tone: 'success' });
    }, SUCCESS_FEEDBACK_MS);
  };

  /** Built inside the handler so nothing runs during render; `phase` guards a second tap while a request is in flight. */
  const submit = () => {
    if (busy) {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      setPhase('submitting');
      try {
        if (category) {
          await update.mutateAsync({ id: category.id, input: { name: values.name, isArchived } });
          finish('saved', 'Kateqoriya yeniləndi');
        } else {
          await create.mutateAsync({ name: values.name, kind: values.kind });
          finish('saved', 'Kateqoriya yaradıldı');
        }
      } catch (error) {
        setPhase('idle');
        if (error instanceof ApiError && error.status === 409) {
          // Name taken for this kind: the server message belongs under the name field.
          setError('name', { type: 'server', message: describeError(error) });
        } else {
          setServerError(describeError(error));
        }
      }
    })();
  };

  const onDelete = async () => {
    if (!category || busy) {
      return;
    }
    const confirmed = await confirmAsync('Kateqoriyanı sil', `"${category.name}" silinsin? İstifadə olunan kateqoriya silinə bilməz, yalnız arxivlənə bilər.`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    setPhase('deleting');
    try {
      await remove.mutateAsync(category.id);
      finish('deleted', 'Kateqoriya silindi');
    } catch (error) {
      setPhase('idle');
      setServerError(describeError(error));
    }
  };

  const preview = (
    <View style={styles.previewBlock}>
      <CategoryPreview name={name} kind={kind} isArchived={isArchived} isSystemDefault={category?.isSystemDefault ?? false} />
      <AppText variant="caption" color="textMuted">
        İkon və rəng ada görə avtomatik seçilir; kateqoriya siyahılarda və qrafiklərdə belə görünəcək.
      </AppText>
    </View>
  );

  const fields = (
    <View style={styles.fields}>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Kateqoriya adı"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={formState.errors.name?.message}
            hint="Eyni növdə ad təkrarlana bilməz."
            icon="pricetag-outline"
            editable={!busy}
            maxLength={100}
            autoFocus={!category}
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        )}
      />
      <View style={styles.field}>
        <AppText variant="meta" color="textSecondary">
          Növ
        </AppText>
        <Controller
          control={control}
          name="kind"
          render={({ field: { onChange, value } }) => (
            <SegmentedControl options={kindOptions} value={value} onChange={onChange} accessibilityLabel="Növ" disabled={busy || locked} />
          )}
        />
        <FieldMessage error={formState.errors.kind?.message} hint={locked ? 'Növ dəyişdirilə bilməz' : undefined} />
      </View>
      {category ? <SwitchRow label="Arxivlə" description="Yeni əməliyyatlarda seçilməsin" value={isArchived} onChange={setIsArchived} disabled={busy} /> : null}
    </View>
  );

  const danger = category ? (
    <Button
      title="Kateqoriyanı sil"
      variant="danger"
      icon="trash-outline"
      onPress={() => void onDelete()}
      loading={phase === 'deleting'}
      success={phase === 'deleted'}
      successTitle="Silindi"
      disabled={phase === 'submitting' || phase === 'saved'}
      style={wide ? styles.buttonWide : undefined}
    />
  ) : null;

  const footer = (
    <View style={styles.footer}>
      <FieldMessage error={serverError ?? undefined} />
      <Button
        title={category ? 'Yadda saxla' : 'Kateqoriya yarat'}
        onPress={submit}
        loading={phase === 'submitting'}
        success={phase === 'saved'}
        successTitle={category ? 'Yadda saxlanıldı' : 'Kateqoriya yaradıldı'}
        disabled={phase === 'deleting' || phase === 'deleted'}
        style={wide ? styles.buttonWide : undefined}
      />
    </View>
  );

  return (
    <Screen maxWidth={wide ? Layout.maxFormWide : Layout.maxForm} footer={footer}>
      <ScreenHeader back title={category ? category.name : 'Yeni kateqoriya'} eyebrow={category ? 'Kateqoriya' : undefined} onBack={() => leave(router)} />
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.column}>
            <Entrance index={0}>{fields}</Entrance>
            {danger ? <Entrance index={2}>{danger}</Entrance> : null}
          </View>
          <Entrance index={1} style={styles.column}>
            {preview}
          </Entrance>
        </View>
      ) : (
        <>
          <Entrance index={0}>{preview}</Entrance>
          <Entrance index={1}>{fields}</Entrance>
          {danger ? <Entrance index={2}>{danger}</Entrance> : null}
        </>
      )}
    </Screen>
  );
}

type CategoryPreviewProps = {
  name: string;
  kind: CategoryKind;
  isArchived: boolean;
  isSystemDefault: boolean;
};

/** Live row exactly as the category will appear in lists: icon and colour derive from the typed name. */
function CategoryPreview({ name, kind, isArchived, isSystemDefault }: CategoryPreviewProps) {
  const { colors, scheme } = useTheme();
  const trimmed = name.trim();
  const visual = categoryVisual(trimmed, kind);
  const tint = categoryColor(trimmed, scheme, kind);
  const metaParts = [kind === 'Income' ? 'Gəlir' : 'Xərc'];
  if (isSystemDefault) {
    metaParts.push('sistem');
  }
  if (isArchived) {
    metaParts.push('arxivdə');
  }
  const meta = metaParts.join(' · ');
  const shownName = trimmed || 'Kateqoriya adı';

  return (
    <View style={styles.field}>
      <AppText variant="meta" color="textSecondary">
        Önizləmə
      </AppText>
      <View
        accessible
        accessibilityLabel={`Önizləmə: ${shownName}, ${meta}`}
        style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }, isArchived ? styles.archived : null]}>
        <View style={[styles.previewIcon, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.18 : 0.12) }]}>
          <Ionicons name={visual.icon} size={20} color={tint} />
        </View>
        <View style={styles.previewText}>
          <AppText variant="bodyStrong" color={trimmed ? 'textPrimary' : 'textDisabled'} numberOfLines={1}>
            {shownName}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.section,
  },
  column: {
    flex: 1,
    gap: Spacing.section,
  },
  fields: {
    gap: Spacing.md,
  },
  field: {
    gap: Spacing.xs,
  },
  previewBlock: {
    gap: Spacing.sm,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
    gap: 1,
  },
  archived: {
    opacity: 0.7,
  },
  footer: {
    gap: Spacing.xs,
  },
  buttonWide: {
    alignSelf: 'flex-start',
    minWidth: 240,
  },
});
