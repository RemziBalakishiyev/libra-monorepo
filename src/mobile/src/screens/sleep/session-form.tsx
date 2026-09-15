import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { StyleSheet, View, type LayoutChangeEvent, type ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { TextField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { TimeField } from '@/components/time-field';
import { useToast } from '@/components/toast';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useCorrectSleep, useDeleteSleep, useRecordSleep, useSleepSession } from '@/hooks/use-sleep';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { SleepSession } from '@/lib/api/sleep';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { successHaptic } from '@/lib/haptics';
import { describeDuration, formatDuration, formatInterval, qualityLabels, splitInstant, wakeDayLabel } from '@/lib/sleep';
import { createSleepFormSchema, instantFor, toInstant, type SleepForm } from '@/lib/validation/sleep';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/** Navigate back this long after a confirmed save, so the success state is seen but never blocks. */
const SUCCESS_DELAY_MS = 550;

type SleepFormScreenProps = {
  /** Correcting an existing session. Absent for manual entry. */
  id?: string;
};

export function SleepFormScreen({ id }: SleepFormScreenProps) {
  const existing = useSleepSession(id);
  const title = id ? 'Yuxuya düzəliş' : 'Yuxu əlavə et';

  if (id && existing.isPending) {
    return (
      <Screen maxWidth={Layout.maxForm}>
        <ScreenHeader back title={title} size="compact" />
        <FormSkeleton fields={4} />
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

  return <SleepEditor session={existing.data} />;
}

type Phase = 'idle' | 'submitting' | 'success';

type FieldKey = 'start' | 'end' | 'quality' | 'note';

/** How long a night entered by hand is assumed to have been, before the user adjusts either end. */
const DefaultNightMinutes = 8 * 60;

/** A night entered by hand ends now and runs eight hours back — always in the past, whatever the hour is. */
function defaultsFor(session: SleepSession | undefined): SleepForm {
  if (session) {
    const start = splitInstant(session.startedAtUtc);
    const end = session.endedAtUtc ? splitInstant(session.endedAtUtc) : splitInstant(new Date().toISOString());
    return {
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      open: session.isOpen,
      quality: session.quality === null ? '' : (String(session.quality) as SleepForm['quality']),
      note: session.note ?? '',
    };
  }

  const now = new Date();
  const end = splitInstant(now.toISOString());
  const start = splitInstant(new Date(now.getTime() - DefaultNightMinutes * 60_000).toISOString());
  return {
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    open: false,
    quality: '',
    note: '',
  };
}

/**
 * Record a night that was not tracked, or correct one that was.
 *
 * The quality rating lives here, and it is optional on purpose: waking up is recorded by the sleep screen, and
 * nothing about this form is required to make that stick. A session that is still running can be closed here —
 * that is how a forgotten night gets a real wake-up time — or left running and simply corrected; its length is
 * never trimmed for it, and discarding it is an explicit, named action.
 */
function SleepEditor({ session }: { session: SleepSession | undefined }) {
  const router = useRouter();
  const { colors, layout, reducedMotion } = useTheme();
  const toast = useToast();
  const record = useRecordSleep();
  const correct = useCorrectSleep();
  const remove = useDeleteSleep();
  const requestId = useClientRequestId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});
  const wide = layout === 'wide';

  // The rules judge the instants that will be sent, which for a correction may keep the stored seconds.
  const schema = useMemo(() => createSleepFormSchema(session ? { startedAtUtc: session.startedAtUtc, endedAtUtc: session.endedAtUtc } : undefined), [session]);
  const { control, handleSubmit, setValue } = useForm<SleepForm>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(session),
  });
  const values = useWatch({ control });
  const busy = phase === 'submitting' || remove.isPending;
  const stillOpen = values.open === true;

  useEffect(
    () => () => {
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
      }
    },
    [],
  );

  // The length shown under the fields is the same arithmetic the server will do, recomputed as they change.
  const preview = (() => {
    if (stillOpen) {
      return null;
    }
    if (!values.startDate || !values.startTime || !values.endDate || !values.endTime) {
      return null;
    }
    const minutes = Math.round((toInstant(values.endDate, values.endTime).getTime() - toInstant(values.startDate, values.startTime).getTime()) / 60_000);
    return minutes > 0 ? minutes : null;
  })();

  const onFieldLayout = (key: FieldKey, event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  };

  const revealFirstError = (errors: FieldErrors<SleepForm>) => {
    const first: FieldKey | undefined = errors.startDate || errors.startTime ? 'start' : errors.endDate || errors.endTime ? 'end' : errors.note ? 'note' : undefined;
    const offset = first ? fieldOffsets.current[first] : undefined;
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - Spacing.md), animated: !reducedMotion });
    }
  };

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(async (form) => {
      setServerError(null);
      setPhase('submitting');
      // Editing only the rating must not nudge the interval: an unchanged minute keeps its stored instant.
      const startedAtUtc = instantFor(form.startDate, form.startTime, session?.startedAtUtc);
      const endedAtUtc = form.open ? null : instantFor(form.endDate, form.endTime, session?.endedAtUtc);
      const quality = form.quality === '' ? null : Number(form.quality);
      const note = form.note.trim() === '' ? null : form.note.trim();
      try {
        if (session) {
          await correct.mutateAsync({
            id: session.id,
            // What this screen last read; a newer stored value means someone else already changed it.
            input: { startedAtUtc, endedAtUtc, quality, note, expectedUpdatedAtUtc: session.updatedAtUtc },
          });
        } else {
          // The same id travels with every retry of this form, so a double tap cannot record two nights.
          await record.mutateAsync({ input: { startedAtUtc, endedAtUtc: endedAtUtc!, quality, note }, clientRequestId: requestId.current() });
          requestId.reset();
        }
        setPhase('success');
        successHaptic();
        doneTimer.current = setTimeout(() => {
          doneTimer.current = null;
          router.back();
          toast({ title: session ? 'Dəyişikliklər yadda saxlanıldı' : 'Yuxu əlavə olundu', tone: 'success' });
        }, SUCCESS_DELAY_MS);
      } catch (error) {
        // Everything typed stays on screen so nothing has to be entered twice.
        setPhase('idle');
        setServerError(describeError(error));
      }
    }, revealFirstError)();
  };

  const onDelete = async () => {
    if (!session) {
      return;
    }
    const label = session.isOpen ? `${formatInterval(session)} (davam edir)` : `${wakeDayLabel(session)} · ${formatInterval(session)}`;
    const confirmed = await confirmAsync(session.isOpen ? 'Yuxunu ləğv et' : 'Yuxunu sil', `${label} silinsin?`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync({ id: session.id });
      router.back();
      toast({ title: 'Yuxu silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const title = session ? 'Yuxuya düzəliş' : 'Yuxu əlavə et';

  const form = (
    <>
      {session?.isOpen ? (
        <View style={[styles.notice, { backgroundColor: colors.surfaceSubtle }]} testID="sleep-open-notice">
          <Ionicons name="moon-outline" size={16} color={colors.moduleSleep} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Bu yuxu hələ davam edir. Oyanma vaxtını yazıb bitirə, yalnız başlanğıcı düzəldib açıq saxlaya, və ya
            tamamilə ləğv edə bilərsiniz. Müddət heç vaxt öz-özünə qısaldılmır.
          </AppText>
        </View>
      ) : null}

      {/* Each moment names itself: two fields both labelled "Saat" would be indistinguishable to a screen reader. */}
      <View style={styles.block} onLayout={(event) => onFieldLayout('start', event)}>
        <View style={styles.whenRow}>
          <Controller
            control={control}
            name="startDate"
            render={({ field, fieldState }) => (
              <View style={styles.whenCell}>
                <DateField label="Yatma tarixi" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} maximumDate={new Date()} />
              </View>
            )}
          />
          <Controller
            control={control}
            name="startTime"
            render={({ field, fieldState }) => (
              <View style={styles.whenCellNarrow}>
                <TimeField label="Yatma saatı" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
              </View>
            )}
          />
        </View>
      </View>

      {stillOpen ? (
        <Button
          title="Oyanma vaxtını yaz"
          variant="secondary"
          icon="sunny-outline"
          onPress={() => setValue('open', false, { shouldValidate: true })}
          disabled={busy}
          testID="sleep-close-open"
        />
      ) : (
        <View style={styles.block} onLayout={(event) => onFieldLayout('end', event)}>
          <View style={styles.whenRow}>
            <Controller
              control={control}
              name="endDate"
              render={({ field, fieldState }) => (
                <View style={styles.whenCell}>
                  <DateField label="Oyanma tarixi" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} maximumDate={new Date()} />
                </View>
              )}
            />
            <Controller
              control={control}
              name="endTime"
              render={({ field, fieldState }) => (
                <View style={styles.whenCellNarrow}>
                  <TimeField label="Oyanma saatı" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
                </View>
              )}
            />
          </View>
          {session?.isOpen ? (
            <Button title="Açıq saxla" variant="ghost" size="sm" onPress={() => setValue('open', true, { shouldValidate: true })} disabled={busy} testID="sleep-keep-open" />
          ) : null}
          <AppText variant="caption" color="textMuted" accessibilityLabel={preview === null ? 'Müddət hesablanmayıb' : `Müddət: ${describeDuration(preview)}`} testID="sleep-form-duration">
            {preview === null ? 'Müddət: —' : `Müddət: ${formatDuration(preview)}`}
          </AppText>
        </View>
      )}

      <View style={styles.block} onLayout={(event) => onFieldLayout('quality', event)}>
        <AppText variant="meta" color="textSecondary">
          Keyfiyyət (istəyə bağlı)
        </AppText>
        <Controller
          control={control}
          name="quality"
          render={({ field }) => (
            <SegmentedControl
              accessibilityLabel="Yuxunun keyfiyyəti"
              testID="sleep-quality"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              size="sm"
              options={[
                { value: '' as const, label: '—', accessibilityLabel: 'Qiymətləndirmə yoxdur' },
                ...([1, 2, 3, 4, 5] as const).map((score) => ({ value: String(score) as SleepForm['quality'], label: String(score), accessibilityLabel: `${score} — ${qualityLabels[score]}` })),
              ]}
            />
          )}
        />
        {/* The number alone would say nothing; the chosen step is always named in words as well. */}
        <AppText variant="caption" color="textMuted" testID="sleep-quality-label">
          {values.quality === '' || values.quality === undefined ? 'Qiymətləndirmədən də yazıla bilər.' : qualityLabels[Number(values.quality)]}
        </AppText>
      </View>

      <View onLayout={(event) => onFieldLayout('note', event)}>
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
              placeholder="Məsələn, gecə iki dəfə oyandım"
              testID="sleep-note"
            />
          )}
        />
      </View>

      {session ? (
        <View style={styles.dangerZone}>
          <Button
            title={session.isOpen ? 'Yuxunu ləğv et' : 'Yuxunu sil'}
            variant="danger"
            icon="trash-outline"
            onPress={() => void onDelete()}
            disabled={busy}
            loading={remove.isPending}
            testID="sleep-form-delete"
          />
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      testID="sleep-form"
      footer={
        <Button
          title={session ? 'Yadda saxla' : 'Yuxunu əlavə et'}
          onPress={submit}
          loading={phase === 'submitting'}
          success={phase === 'success'}
          successTitle={session ? 'Yadda saxlanıldı' : 'Əlavə olundu'}
          testID="sleep-submit"
        />
      }>
      <Entrance style={styles.stack}>
        <ScreenHeader back title={title} size="compact" />
        <ServerErrorBanner message={serverError} />
        {form}
      </Entrance>
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
  block: {
    gap: Spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
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
  dangerZone: {
    paddingTop: Spacing.xs,
  },
});
