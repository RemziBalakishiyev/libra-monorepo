import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { StyleSheet, View, type LayoutChangeEvent, type ScrollView, type TextInput } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Entrance } from '@/components/entrance';
import { TextField } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ErrorState, FormSkeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { TimeField } from '@/components/time-field';
import { useToast } from '@/components/toast';
import { Layout, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useCreateTask, useDeleteTask, useTask, useUpdateTask } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { CreateTaskInput, TaskDetail, TaskRecurrenceInput, UpdateTaskInput } from '@/lib/api/tasks';
import { useClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { todayIsoDate } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { priorities, recurrenceLabels, timeLabel, weekdays as weekdayOptions } from '@/lib/tasks';
import { taskFormSchema, type TaskForm } from '@/lib/validation/tasks';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

/** Navigate back this long after a confirmed save, so the success state is seen but never blocks. */
const SUCCESS_DELAY_MS = 550;

type TaskFormScreenProps = {
  /** Editing an existing task. */
  id?: string;
  /** Local calendar date the Plan screen was showing. */
  date?: string;
};

export function TaskFormScreen({ id, date }: TaskFormScreenProps) {
  const existing = useTask(id);
  const title = id ? 'Tapşırığa düzəliş' : 'Yeni tapşırıq';

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

  return <TaskEditor detail={existing.data} date={date} />;
}

type Phase = 'idle' | 'submitting' | 'success';

type FieldKey = 'title' | 'when' | 'priority' | 'repeat' | 'note';

function defaultsFor(detail: TaskDetail | undefined, date: string | undefined): TaskForm {
  const task = detail?.task;
  const series = detail?.series;
  return {
    // A new task starts on the day the user is looking at, at Normal priority, with nothing else filled in.
    title: task?.title ?? '',
    date: task?.plannedDate ?? date ?? todayIsoDate(),
    time: timeLabel(task?.plannedTime ?? null) ?? '',
    priority: task?.priority ?? 'Normal',
    note: task?.note ?? '',
    // The recurrence control only appears on a new task: editing one edits that single day, and the schedule
    // is changed from its own action instead.
    recurrence: 'None',
    weekdays: series?.weekdays ?? [],
    endDate: series?.endDate ?? '',
  };
}

function toRecurrence(values: TaskForm): TaskRecurrenceInput | undefined {
  if (values.recurrence === 'None') {
    return undefined;
  }
  return {
    kind: values.recurrence,
    weekdays: values.recurrence === 'Weekly' ? [...values.weekdays].sort((left, right) => left - right) : undefined,
    startDate: values.date,
    endDate: values.endDate === '' ? null : values.endDate,
  };
}

/**
 * Create or edit one task. Creation is deliberately short: the title is focused first and everything else has a
 * usable default, with the time, note and repetition behind their own disclosures.
 *
 * Editing a task edits that single day. A repeating task says so, and its schedule is stopped from the Plan
 * screen's own action rather than hidden inside this form.
 */
function TaskEditor({ detail, date }: { detail: TaskDetail | undefined; date: string | undefined }) {
  const router = useRouter();
  const { colors, layout, reducedMotion } = useTheme();
  const toast = useToast();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const requestId = useClientRequestId();
  const task = detail?.task;
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [showTime, setShowTime] = useState(Boolean(task?.plannedTime));
  const [showNote, setShowNote] = useState(Boolean(task?.note));
  const [showRepeat, setShowRepeat] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});
  const titleRef = useRef<TextInput>(null);
  const wide = layout === 'wide';

  const { control, handleSubmit, setValue } = useForm<TaskForm>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaultsFor(detail, date),
  });
  const recurrence = useWatch({ control, name: 'recurrence' });
  const selectedWeekdays = useWatch({ control, name: 'weekdays' });
  const busy = phase === 'submitting' || remove.isPending;

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

  /** Which block each error belongs to, in the order the blocks appear on screen. */
  const blockWithError = (errors: FieldErrors<TaskForm>): FieldKey | undefined => {
    if (errors.title) {
      return 'title';
    }
    if (errors.date || errors.time) {
      return 'when';
    }
    if (errors.weekdays || errors.endDate) {
      return 'repeat';
    }
    return errors.note ? 'note' : undefined;
  };

  const revealFirstError = (errors: FieldErrors<TaskForm>) => {
    const first = blockWithError(errors);
    if (first === 'repeat') {
      setShowRepeat(true);
    }
    const offset = first ? fieldOffsets.current[first] : undefined;
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - Spacing.md), animated: !reducedMotion });
    }
    if (first === 'title') {
      titleRef.current?.focus();
    }
  };

  const submit = () => {
    if (phase !== 'idle') {
      return;
    }
    void handleSubmit(async (values) => {
      setServerError(null);
      setPhase('submitting');
      const plannedTime = values.time === '' ? null : `${values.time}:00`;
      const note = values.note.trim() === '' ? null : values.note.trim();
      try {
        if (task) {
          const input: UpdateTaskInput = {
            title: values.title.trim(),
            note,
            plannedDate: values.date,
            plannedTime,
            priority: values.priority,
            // What this screen last read; a newer stored value means someone else already changed it.
            expectedUpdatedAtUtc: task.updatedAtUtc,
          };
          await update.mutateAsync({ id: task.id, input });
        } else {
          const input: CreateTaskInput = {
            title: values.title.trim(),
            note,
            plannedDate: values.date,
            plannedTime,
            priority: values.priority,
            recurrence: toRecurrence(values),
          };
          // The same id travels with every retry of this form, so a double tap cannot create two tasks.
          await create.mutateAsync({ input, clientRequestId: requestId.current() });
          requestId.reset();
        }
        setPhase('success');
        successHaptic();
        doneTimer.current = setTimeout(() => {
          doneTimer.current = null;
          router.back();
          toast({ title: task ? 'Dəyişikliklər yadda saxlanıldı' : 'Tapşırıq əlavə olundu', tone: 'success' });
        }, SUCCESS_DELAY_MS);
      } catch (error) {
        // Everything typed stays on screen so nothing has to be entered twice.
        setPhase('idle');
        setServerError(describeError(error));
      }
    }, revealFirstError)();
  };

  const onDelete = async () => {
    if (!task) {
      return;
    }
    const confirmed = await confirmAsync('Tapşırığı sil', `“${task.title}” silinsin?`);
    if (!confirmed) {
      return;
    }
    setServerError(null);
    try {
      await remove.mutateAsync({ id: task.id });
      router.back();
      toast({ title: 'Tapşırıq silindi', tone: 'success' });
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const toggleWeekday = (day: number) => {
    const next = selectedWeekdays?.includes(day) ? selectedWeekdays.filter((value) => value !== day) : [...(selectedWeekdays ?? []), day];
    setValue('weekdays', next, { shouldValidate: true });
  };

  const title = task ? 'Tapşırığa düzəliş' : 'Yeni tapşırıq';

  const form = (
    <>
      <View onLayout={(event) => onFieldLayout('title', event)}>
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <TextField
              ref={titleRef}
              label="Tapşırığın adı"
              icon="checkbox-outline"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              editable={!busy}
              placeholder="Məsələn, Həkimə zəng et"
              autoFocus={!task}
              returnKeyType="done"
              onSubmitEditing={submit}
              testID="task-title"
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
              {/* No maximum: a plan is about the future. Nutrition keeps its own restriction. */}
              <DateField label="Tarix" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
            </View>
          )}
        />
        {showTime ? (
          <Controller
            control={control}
            name="time"
            render={({ field, fieldState }) => (
              <View style={styles.whenCellNarrow}>
                <TimeField value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
              </View>
            )}
          />
        ) : null}
      </View>

      {!showTime ? <Button title="Saat əlavə et" variant="ghost" size="sm" icon="time-outline" onPress={() => setShowTime(true)} disabled={busy} testID="task-add-time" /> : null}

      <View onLayout={(event) => onFieldLayout('priority', event)}>
        <AppText variant="meta" color="textSecondary" style={styles.label}>
          Prioritet
        </AppText>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <SegmentedControl
              accessibilityLabel="Prioritet"
              testID="task-priority"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
              size="sm"
              options={priorities.map((entry) => ({ value: entry.value, label: entry.label, icon: entry.icon }))}
            />
          )}
        />
      </View>

      {!task ? (
        <View onLayout={(event) => onFieldLayout('repeat', event)} style={styles.block}>
          {showRepeat ? (
            <>
              <AppText variant="meta" color="textSecondary" style={styles.label}>
                Təkrarlanma
              </AppText>
              <Controller
                control={control}
                name="recurrence"
                render={({ field }) => (
                  <SegmentedControl
                    accessibilityLabel="Təkrarlanma"
                    testID="task-recurrence"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={busy}
                    size="sm"
                    options={(['None', 'Daily', 'Weekly'] as const).map((kind) => ({ value: kind, label: recurrenceLabels[kind], icon: kind === 'None' ? 'close-outline' : kind === 'Daily' ? 'repeat-outline' : 'calendar-outline' }))}
                  />
                )}
              />
              {recurrence === 'Weekly' ? (
                <Controller
                  control={control}
                  name="weekdays"
                  render={({ fieldState }) => (
                    <View style={styles.block}>
                      {/* A labelled set of independent checkboxes; React Native has no `group` role. */}
                      <View style={styles.weekdays} accessibilityLabel="Həftənin günləri">
                        {weekdayOptions.map((day) => {
                          const selected = selectedWeekdays?.includes(day.value) ?? false;
                          return (
                            <PressableScale
                              key={day.value}
                              accessibilityRole="checkbox"
                              aria-checked={selected}
                              aria-disabled={busy}
                              accessibilityLabel={day.long}
                              disabled={busy}
                              onPress={() => toggleWeekday(day.value)}
                              scaleTo={0.95}
                              style={[styles.weekday, { backgroundColor: selected ? colors.modulePlan : colors.surfaceSubtle, borderColor: selected ? colors.modulePlan : colors.border }]}
                              testID={`weekday-${day.value}`}>
                              <AppText variant="caption" color={selected ? 'onHero' : 'textSecondary'}>
                                {day.label}
                              </AppText>
                            </PressableScale>
                          );
                        })}
                      </View>
                      {fieldState.error?.message ? (
                        <AppText variant="caption" color="error" accessibilityRole="alert">
                          {fieldState.error.message}
                        </AppText>
                      ) : null}
                    </View>
                  )}
                />
              ) : null}
              {recurrence !== 'None' ? (
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field, fieldState }) => (
                    <View style={styles.endRow}>
                      <View style={styles.flex}>
                        {field.value === '' ? (
                          <Button title="Bitmə tarixi əlavə et" variant="ghost" size="sm" icon="calendar-outline" onPress={() => field.onChange(todayIsoDate())} disabled={busy} testID="task-add-end" />
                        ) : (
                          <DateField label="Bitmə tarixi" value={field.value} onChange={field.onChange} error={fieldState.error?.message} disabled={busy} />
                        )}
                      </View>
                      {field.value !== '' ? (
                        <IconButton icon="close" accessibilityLabel="Bitmə tarixini sil" size={18} onPress={() => field.onChange('')} disabled={busy} testID="task-clear-end" />
                      ) : null}
                    </View>
                  )}
                />
              ) : null}
            </>
          ) : (
            <Button title="Təkrarlanma əlavə et" variant="ghost" size="sm" icon="repeat-outline" onPress={() => setShowRepeat(true)} disabled={busy} testID="task-add-recurrence" />
          )}
        </View>
      ) : task.seriesId ? (
        <View style={[styles.seriesNote, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name="repeat-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Bu, təkrarlanan tapşırığın bir günüdür. Dəyişiklik yalnız bu günə aiddir; təkrarlanmanı Plan
            ekranındakı əməliyyatlardan dayandıra bilərsiniz.
          </AppText>
        </View>
      ) : null}

      <View onLayout={(event) => onFieldLayout('note', event)}>
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
                placeholder="Məsələn, sənədləri götür"
                testID="task-note"
              />
            )}
          />
        ) : (
          <Button title="Qeyd əlavə et" variant="ghost" size="sm" icon="create-outline" onPress={() => setShowNote(true)} disabled={busy} testID="task-add-note" />
        )}
      </View>

      {task ? (
        <View style={styles.dangerZone}>
          <Button title="Tapşırığı sil" variant="danger" icon="trash-outline" onPress={() => void onDelete()} disabled={busy} loading={remove.isPending} testID="task-delete" />
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      maxWidth={wide ? Layout.maxFormWide : Layout.maxForm}
      testID="task-form"
      footer={
        <Button
          title={task ? 'Yadda saxla' : 'Tapşırıq əlavə et'}
          onPress={submit}
          loading={phase === 'submitting'}
          success={phase === 'success'}
          successTitle={task ? 'Yadda saxlanıldı' : 'Əlavə olundu'}
          testID="task-submit"
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
  },
  stack: {
    gap: Spacing.lg,
  },
  block: {
    gap: Spacing.sm,
  },
  label: {
    marginBottom: Spacing.xs,
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
  weekdays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  weekday: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  seriesNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  dangerZone: {
    paddingTop: Spacing.xs,
  },
});
