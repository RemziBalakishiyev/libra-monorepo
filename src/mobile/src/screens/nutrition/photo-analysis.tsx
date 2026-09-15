import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { TextField } from '@/components/form-field';
import { NutritionItemEditor } from '@/components/nutrition-item-editor';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { AppText } from '@/components/text';
import { TimeField, formatTimeOf } from '@/components/time-field';
import { useToast } from '@/components/toast';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAnalyzeFoodPhoto, useConfirmFoodAnalysis, useDiscardFoodAnalysis } from '@/hooks/use-food-analysis';
import { ApiError } from '@/lib/api/client';
import { classifyError } from '@/lib/api/errors';
import type { FoodAnalysisDraft, FoodAnalysisItem, PickedPhoto } from '@/lib/api/food-analysis';
import type { MealType, NutritionItemInput } from '@/lib/api/nutrition';
import { useClientRequestId } from '@/lib/client-request-id';
import { isoDateOf, todayIsoDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { parseDecimalInput } from '@/lib/money';
import { formatGrams, formatKcal, itemTotals, mealForHour, meals, sumTotals } from '@/lib/nutrition';
import { cameraAvailable, pickPhoto, type PhotoSource } from '@/lib/photo-picker';
import { nutritionEntryFormSchema, type NutritionEntryForm, type NutritionItemForm } from '@/lib/validation/nutrition';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/** Navigate back this long after a confirmed save, so the success state is seen but never blocks. */
const SUCCESS_DELAY_MS = 550;

type Phase = 'choose' | 'preview' | 'analyzing' | 'review';

/** Something that stopped the analysis, in words the user can act on. */
type Problem = { title: string; message: string; retryable: boolean };

type FoodPhotoScreenProps = {
  /** Local calendar date the diary was showing. */
  date?: string;
  mealType?: MealType;
};

/**
 * Add a meal from a photo: choose → preview → analyze → review → confirm.
 *
 * The analysis only ever produces an estimate. Nothing reaches the diary until the reviewed items are confirmed
 * on the last step, so abandoning the screen at any point leaves the day exactly as it was.
 */
export function FoodPhotoScreen({ date, mealType }: FoodPhotoScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const analyze = useAnalyzeFoodPhoto();
  const discard = useDiscardFoodAnalysis();
  const requestId = useClientRequestId();
  const [phase, setPhase] = useState<Phase>('choose');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [draft, setDraft] = useState<FoodAnalysisDraft | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  /**
   * Which attempt the screen is currently showing. Replacing the photo or starting again bumps it, so a slow
   * answer to an abandoned request is dropped instead of overwriting what is on screen now.
   */
  const attempt = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  const choose = async (source: PhotoSource) => {
    // Anything still running belongs to the picture being replaced.
    inFlight.current?.abort();
    inFlight.current = null;
    const outcome = await pickPhoto(source);

    if (outcome.kind === 'cancelled') {
      return;
    }
    if (outcome.kind === 'denied') {
      setProblem({
        title: source === 'camera' ? 'Kameraya icazə verilmədi' : 'Şəkillərə icazə verilmədi',
        message: outcome.canAskAgain
          ? 'Şəkil əlavə etmək üçün icazə lazımdır. Yeməyi əl ilə də əlavə edə bilərsiniz.'
          : 'İcazəni cihazın parametrlərindən açın. Yeməyi əl ilə də əlavə edə bilərsiniz.',
        retryable: false,
      });
      return;
    }
    if (outcome.kind === 'failed') {
      setProblem({ title: 'Şəkil açılmadı', message: 'Başqa şəkil seçin və ya yeməyi əl ilə əlavə edin.', retryable: false });
      return;
    }

    attempt.current += 1;
    requestId.reset();
    setProblem(null);
    setDraft(null);
    setPhoto(outcome.photo);
    setPhase('preview');
  };

  const startAnalysis = async () => {
    if (!photo || phase === 'analyzing') {
      return;
    }

    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    const mine = attempt.current;
    setProblem(null);
    setPhase('analyzing');

    try {
      const result = await analyze.mutateAsync({ photo, clientRequestId: requestId.current(), signal: controller.signal });
      if (mine !== attempt.current) {
        // A newer photo is on screen; this answer describes a picture the user already replaced.
        return;
      }

      if (result.items.length === 0) {
        setProblem(describeOutcome(result));
        setPhase('preview');
        return;
      }

      setDraft(result);
      setPhase('review');
    } catch (error) {
      if (mine !== attempt.current || controller.signal.aborted) {
        return;
      }
      setProblem(describeAnalysisError(error));
      setPhase('preview');
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
      }
    }
  };

  const cancelDraft = () => {
    const current = draft;
    attempt.current += 1;
    setDraft(null);
    setPhase('preview');
    if (current) {
      // Nothing was ever added; the server-side draft and its picture simply go away.
      discard.mutate(current.id);
    }
  };

  const openManual = () => router.replace(`/nutrition/new?date=${date ?? todayIsoDate()}${mealType ? `&mealType=${mealType}` : ''}` as never);

  if (phase === 'review' && draft && photo) {
    return (
      // Remounting on the draft keeps the review form's defaults derived from data, never from an effect.
      <PhotoReview key={draft.id} draft={draft} photo={photo} date={date} mealType={mealType} onCancel={cancelDraft} />
    );
  }

  return (
    <Screen
      maxWidth={Layout.maxForm}
      testID="food-photo-screen"
      footer={
        photo ? (
          <Button
            title="Təhlil et"
            icon="sparkles-outline"
            onPress={() => void startAnalysis()}
            loading={phase === 'analyzing'}
            testID="analyze-photo"
            accessibilityHint="Şəkli AI qiymətləndirməsi üçün göndərir"
          />
        ) : undefined
      }>
      <Entrance style={styles.stack}>
        <ScreenHeader back title="Şəkildən əlavə et" size="compact" />

        {problem ? <ServerErrorBanner message={`${problem.title}. ${problem.message}`} /> : null}

        <View style={[styles.notice, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name="cloud-upload-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Şəkil qidalanma dəyərlərinin AI ilə qiymətləndirilməsi üçün Libra serverinə göndərilir. Nəticə yalnız təxmindir və siz təsdiqləyənə qədər gündəliyə düşmür.
          </AppText>
        </View>

        {photo ? (
          <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" accessibilityLabel="Seçilmiş yemək şəkli" testID="photo-preview" />
            {phase === 'analyzing' ? (
              <View style={styles.analyzing} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} accessibilityLabel="Şəkil təhlil edilir" />
                <AppText variant="caption" color="textSecondary">
                  Şəkil təhlil edilir…
                </AppText>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.placeholder, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}>
            <Ionicons name="camera-outline" size={28} color={colors.moduleNutrition} />
            <AppText variant="bodyStrong">Yeməyin şəklini seçin</AppText>
            <AppText variant="caption" color="textSecondary" style={styles.centerText}>
              Boşqab tam görünsün; nəticəni göndərməzdən əvvəl yoxlaya və düzəldə bilərsiniz.
            </AppText>
          </View>
        )}

        {/* Choosing again stays available while an analysis runs: it aborts the old request rather than waiting. */}
        <View style={styles.sources}>
          {cameraAvailable ? <Button title="Kamera" variant="soft" icon="camera-outline" onPress={() => void choose('camera')} testID="pick-camera" /> : null}
          <Button
            title={photo ? 'Başqa şəkil seç' : 'Şəkil seç'}
            variant={photo ? 'ghost' : 'soft'}
            icon="images-outline"
            onPress={() => void choose('library')}
            testID="pick-library"
          />
        </View>

        <Button title="Əl ilə əlavə et" variant="ghost" size="sm" icon="create-outline" onPress={openManual} testID="photo-manual" />
      </Entrance>
    </Screen>
  );
}

type PhotoReviewProps = {
  draft: FoodAnalysisDraft;
  photo: PickedPhoto;
  date: string | undefined;
  mealType: MealType | undefined;
  onCancel: () => void;
};

/**
 * The estimate, open for editing. Every value is the model's suggestion until the user changes it, and a value
 * the model could not judge is left empty on purpose — the form asks for it rather than confirming a zero.
 */
function PhotoReview({ draft, photo, date, mealType, onCancel }: PhotoReviewProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const confirm = useConfirmFoodAnalysis();
  const requestId = useClientRequestId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { control, handleSubmit, formState } = useForm<NutritionEntryForm>({
    resolver: zodResolver(nutritionEntryFormSchema),
    defaultValues: {
      mealType: mealType ?? mealForHour(new Date().getHours()),
      date: date ?? todayIsoDate(),
      time: formatTimeOf(new Date()),
      note: '',
      items: draft.items.map(toItemForm),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const busy = confirm.isPending || saved;

  const totals = sumTotals(
    (items ?? []).map((item) =>
      itemTotals({
        name: item?.name ?? '',
        quantityMode: item?.quantityMode ?? 'PerPortion',
        quantity: parseDecimalInput(item?.quantity ?? '', 3) ?? 0,
        energyKcalPerUnit: parseDecimalInput(item?.energyKcal ?? '', 2) ?? 0,
        proteinGramsPerUnit: parseDecimalInput(item?.protein ?? '', 2) ?? 0,
        carbGramsPerUnit: parseDecimalInput(item?.carbs ?? '', 2) ?? 0,
        fatGramsPerUnit: parseDecimalInput(item?.fat ?? '', 2) ?? 0,
      }),
    ),
  );

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  const submit = () => {
    if (busy) {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      const [year, month, day] = values.date.split('-').map(Number) as [number, number, number];
      const [hours, minutes] = values.time.split(':').map(Number) as [number, number];
      const consumedAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
      try {
        await confirm.mutateAsync({
          draftId: draft.id,
          input: {
            mealType: values.mealType,
            consumedAtUtc: consumedAt.toISOString(),
            note: values.note.trim() === '' ? null : values.note.trim(),
            items: values.items.map(toItemInput),
          },
          // The same key on every retry; the draft itself stops a lost response from creating a second meal.
          clientRequestId: requestId.current(),
          dates: [values.date, isoDateOf(consumedAt)],
        });
        setSaved(true);
        successHaptic();
        doneTimer.current = setTimeout(() => {
          doneTimer.current = null;
          router.back();
          toast({ title: 'Yemək əlavə olundu', tone: 'success' });
        }, SUCCESS_DELAY_MS);
      } catch (error) {
        // Everything typed stays on screen, and the same draft can be confirmed again safely.
        setServerError(describeAnalysisError(error).message);
      }
    })();
  };

  const confidence = draft.confidence === null ? null : Math.round(draft.confidence * 100);

  return (
    <Screen
      maxWidth={Layout.maxForm}
      testID="food-photo-review"
      footer={
        <Button
          title="Təsdiqlə və əlavə et"
          onPress={submit}
          loading={confirm.isPending}
          success={saved}
          successTitle="Əlavə olundu"
          testID="confirm-analysis"
          accessibilityHint="Yoxlanmış dəyərləri gündəliyə yazır"
        />
      }>
      <Entrance style={styles.stack}>
        <ScreenHeader back title="AI təxminini yoxlayın" size="compact" />
        <ServerErrorBanner message={serverError} />

        <View style={[styles.estimateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="Təhlil edilən şəkil" testID="review-photo" />
          <View style={styles.estimateText}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.surfaceSubtle }]}>
                <Ionicons name="sparkles-outline" size={12} color={colors.moduleNutrition} />
                <AppText variant="meta" color="textSecondary">
                  AI təxmini
                </AppText>
              </View>
              {confidence !== null ? (
                <AppText variant="meta" color="textMuted" testID="analysis-confidence">
                  Modelin öz qiymətləndirməsi: {confidence}%
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" color="textSecondary" testID="analysis-notes">
              {draft.notes ?? 'Dəyərləri yoxlayıb düzəldin; təsdiqləyənə qədər heç nə yazılmır.'}
            </AppText>
          </View>
        </View>

        <View>
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
                options={meals.map((meal) => ({ value: meal.type, label: meal.shortLabel, accessibilityLabel: meal.label, icon: meal.icon }))}
              />
            )}
          />
        </View>

        <View style={styles.whenRow}>
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

        <View style={styles.items}>
          {fields.map((field, index) => (
            <View key={field.id} style={styles.itemBlock}>
              {draft.items[index]?.portionDescription ? (
                <AppText variant="meta" color="textMuted" testID={`estimate-portion-${index}`}>
                  Təxmin: {draft.items[index]!.portionDescription}
                  {draft.items[index]!.estimatedGrams !== null ? ` · ~${formatGrams(draft.items[index]!.estimatedGrams!)}` : ''}
                </AppText>
              ) : null}
              <NutritionItemEditor control={control} index={index} disabled={busy} onRemove={fields.length > 1 ? () => remove(index) : undefined} />
            </View>
          ))}
          {formState.errors.items?.message ? (
            <AppText variant="caption" color="error" accessibilityRole="alert">
              {formState.errors.items.message}
            </AppText>
          ) : null}
          <Button title="Başqa yemək əlavə et" variant="soft" icon="add" onPress={() => append(blankItem())} disabled={busy || fields.length >= 20} testID="add-item" />
        </View>

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
            />
          )}
        />

        <View style={[styles.totals, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <View style={styles.totalsHeader}>
            <Ionicons name="nutrition-outline" size={18} color={colors.moduleNutrition} />
            <AppText variant="bodyStrong" style={styles.flex}>
              Cəmi
            </AppText>
            <AppText variant="bodyStrong" style={styles.tabular} testID="review-total-energy">
              {formatKcal(totals.energyKcal)}
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary" testID="review-total-macros">
            Zülal {formatGrams(totals.proteinGrams)} · Karbohidrat {formatGrams(totals.carbGrams)} · Yağ {formatGrams(totals.fatGrams)}
          </AppText>
        </View>

        <Button title="Ləğv et və şəkli sil" variant="ghost" size="sm" icon="close" onPress={onCancel} disabled={busy} testID="cancel-analysis" />
      </Entrance>
    </Screen>
  );
}

/** An empty food row: nothing is prefilled, so a missing value is never confused with an entered zero. */
function blankItem(): NutritionItemForm {
  return { name: '', quantityMode: 'PerPortion', quantity: '1', energyKcal: '', protein: '', carbs: '', fat: '' };
}

/** The estimate as form text. A null nutrient stays an empty field so the user is asked, not guessed for. */
function toItemForm(item: FoodAnalysisItem): NutritionItemForm {
  return {
    name: item.name,
    quantityMode: item.suggestedQuantityMode,
    quantity: decimalText(item.suggestedQuantity),
    energyKcal: optionalDecimalText(item.suggestedEnergyKcalPerUnit),
    protein: optionalDecimalText(item.suggestedProteinGramsPerUnit),
    carbs: optionalDecimalText(item.suggestedCarbGramsPerUnit),
    fat: optionalDecimalText(item.suggestedFatGramsPerUnit),
  };
}

function toItemInput(item: NutritionItemForm): NutritionItemInput {
  return {
    name: item.name.trim(),
    quantityMode: item.quantityMode,
    quantity: parseDecimalInput(item.quantity, 3)!,
    energyKcalPerUnit: parseDecimalInput(item.energyKcal, 2)!,
    proteinGramsPerUnit: parseDecimalInput(item.protein, 2)!,
    carbGramsPerUnit: parseDecimalInput(item.carbs, 2)!,
    fatGramsPerUnit: parseDecimalInput(item.fat, 2)!,
  };
}

function decimalText(value: number): string {
  return String(value).replace('.', ',');
}

function optionalDecimalText(value: number | null): string {
  return value === null ? '' : decimalText(value);
}

/** A picture the model could read but could not estimate from. Each case says what would help. */
function describeOutcome(draft: FoodAnalysisDraft): Problem {
  if (draft.outcome === 'NoFoodDetected') {
    return { title: 'Şəkildə yemək tapılmadı', message: draft.notes ?? 'Boşqabın şəklini çəkin və ya yeməyi əl ilə əlavə edin.', retryable: true };
  }
  return {
    title: 'Şəkil qiymətləndirmə üçün kifayət etmədi',
    message: draft.notes ?? 'Daha aydın və yaxın bir şəkil çəkin, ya da yeməyi əl ilə əlavə edin.',
    retryable: true,
  };
}

/** Turns a failed analysis or confirmation into copy that says what actually happened. */
export function describeAnalysisError(error: unknown): Problem {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return { title: 'Şəkil çox böyükdür', message: 'Daha kiçik və ya daha az keyfiyyətli şəkil seçin.', retryable: false };
    }
    if (error.status === 429) {
      return { title: 'Çox sayda təhlil', message: 'Bir qədər gözləyib yenidən cəhd edin, ya da yeməyi əl ilə əlavə edin.', retryable: true };
    }
    if (error.status === 504) {
      return { title: 'Təhlil çox uzun çəkdi', message: 'Yenidən cəhd edin, ya da yeməyi əl ilə əlavə edin.', retryable: true };
    }
    if (error.status === 503) {
      return { title: 'Təhlil xidməti əlçatan deyil', message: error.detail ?? 'Bir az sonra yenidən cəhd edin, ya da yeməyi əl ilə əlavə edin.', retryable: true };
    }
    if (error.status === 409) {
      return { title: 'Bu təxmin artıq keçərli deyil', message: 'Yeni şəkil çəkin; heç nə gündəliyə yazılmadı.', retryable: false };
    }
    if (error.status === 400) {
      return { title: 'Şəkil qəbul edilmədi', message: error.detail ?? 'JPEG, PNG və ya WebP formatında aydın bir şəkil seçin.', retryable: false };
    }
    return { title: 'Təhlil alınmadı', message: error.detail ?? error.title, retryable: true };
  }

  const kind = classifyError(error);
  if (kind === 'offline') {
    return { title: 'İnternet bağlantısı yoxdur', message: 'Bağlantı bərpa olunanda yenidən cəhd edin.', retryable: true };
  }
  return { title: 'Serverə qoşulmaq mümkün olmadı', message: 'Bağlantını yoxlayıb yenidən cəhd edin.', retryable: true };
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.lg,
  },
  flex: {
    flex: 1,
  },
  centerText: {
    textAlign: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.huge,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  previewCard: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: 240,
  },
  analyzing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  estimateCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
  },
  estimateText: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.full,
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
  itemBlock: {
    gap: Spacing.xxs,
  },
  totals: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.xs,
  },
  totalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
