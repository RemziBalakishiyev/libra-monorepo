import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { SleepStrip } from '@/components/sleep-strip';
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StaleNotice } from '@/components/states';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useActiveSleep, useDeleteSleep, useSleepHistory, useSleepSummary, useStartSleep, useStopSleep } from '@/hooks/use-sleep';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { SleepSession } from '@/lib/api/sleep';
import { newClientRequestId } from '@/lib/client-request-id';
import { confirmAsync } from '@/lib/confirm';
import { successHaptic } from '@/lib/haptics';
import { averageLabel, describeDuration, elapsedMinutes, formatDuration, formatInterval, qualityLabel, timeOf, wakeDayLabel } from '@/lib/sleep';
import { clearPendingStop, pendingStopFor, readPendingStop, writePendingStop, type PendingStop } from '@/lib/sleep-pending';
import {
  cancelReminder,
  defaultReminderSettings,
  reconcileReminder,
  readReminderSettings,
  reminderChoices,
  remindersSupported,
  requestReminderPermission,
  scheduleReminder,
  writeReminderSettings,
  type ReminderSettings,
} from '@/lib/sleep-reminder';

/** How often the running display recomputes itself from the stored start instant. */
const TICK_MS = 30_000;

/** Delay used by the development-only reminder check: long enough to background the app, short enough to sit through. */
const DevTestReminderMinutes = 1.5;

/**
 * The sleep screen: what is running now, the last seven nights, the optional reminder, and the history.
 *
 * The elapsed figure on screen is recomputed from the session's stored start instant — it is a rendering of the
 * server's data against the current clock, never a counter the app keeps. Nothing here is announced on a timer:
 * only the lifecycle changes (started, recorded) are spoken, once each.
 */
export function SleepScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const toast = useToast();
  const profile = useProfile();
  const active = useActiveSleep();
  const summary = useSleepSummary();
  const history = useSleepHistory();
  const start = useStartSleep();
  const stop = useStopSleep();
  const remove = useDeleteSleep();

  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PendingStop | null>(null);
  const [reminder, setReminder] = useState<ReminderSettings>(defaultReminderSettings);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  /** Guards a double press: a second start or stop while the first is open never reaches the network. */
  const inFlight = useRef(false);

  const userId = profile.data?.id;
  const session = active.data ?? null;
  const wide = layout === 'wide';
  const applicable = pendingStopFor(pending, userId, session?.id);

  // The running display ticks from the stored instant. It is plain text, not a live region, so a screen reader
  // is never interrupted twice a minute by a number that changed on its own.
  useEffect(() => {
    if (!session?.isOpen) {
      return;
    }
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, [session?.isOpen, session?.id]);

  // What the last run left behind: a wake-up that never reached the server, and the reminder settings.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, settings] = await Promise.all([readPendingStop(), readReminderSettings(userId)]);
      if (!cancelled) {
        setPending(stored);
        setReminder(settings);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // On resume the stored alarm and the operating system are brought back into agreement, once the running
  // session is actually known. A wake-up left over from a session that is no longer running is dropped at the
  // same time: whatever it named is already closed, so keeping it would be an offer to re-send the past.
  useEffect(() => {
    if (active.isPending) {
      return;
    }
    void reconcileReminder(userId, session?.id);
    if (pending && pendingStopFor(pending, userId, session?.id) === null) {
      void clearPendingStop().then(() => setPending(null));
    }
  }, [active.isPending, pending, session?.id, userId]);

  const syncPendingStop = useCallback(
    async (target: PendingStop) => {
      try {
        await stop.mutateAsync({ id: target.sessionId, endedAtUtc: target.endedAtUtc });
        await clearPendingStop();
        await cancelReminder();
        setPending(null);
        toast({ title: 'Yuxu qeyd olundu', tone: 'success' });
      } catch (error) {
        toast({ title: describeError(error), tone: 'error' });
      }
    },
    [stop, toast],
  );

  const onRefresh = () => {
    setRefreshing(true);
    setNow(new Date());
    void Promise.allSettled([active.refetch(), summary.refetch(), history.refetch()]).finally(() => setRefreshing(false));
  };

  const onStart = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const started = await start.mutateAsync({ clientRequestId: newClientRequestId() });
      successHaptic();
      toast({ title: 'Yuxu başladı', tone: 'success' });
      // The alarm is scheduled only once the server confirmed a session exists to attach it to.
      if (reminder.enabled && userId) {
        const scheduled = await scheduleReminder(userId, started.id, started.startedAtUtc, reminder.minutes);
        setReminderNote(scheduled ? null : 'Xatırlatma qurula bilmədi.');
      }
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      inFlight.current = false;
    }
  };

  const onStop = async () => {
    if (!session || inFlight.current) {
      return;
    }
    inFlight.current = true;
    // The wake instant is captured once, here, and kept until the server confirms it.
    const target: PendingStop = { userId: userId ?? '', sessionId: session.id, endedAtUtc: new Date().toISOString() };
    try {
      await writePendingStop(target);
      setPending(target);
      await cancelReminder();
      await stop.mutateAsync({ id: session.id, endedAtUtc: target.endedAtUtc });
      await clearPendingStop();
      setPending(null);
      successHaptic();
      toast({ title: 'Yuxu qeyd olundu', tone: 'success' });
    } catch (error) {
      // The captured moment stays on the device; the banner offers to send it again.
      toast({ title: describeError(error), tone: 'error' });
    } finally {
      inFlight.current = false;
    }
  };

  const onToggleReminder = async (enabled: boolean) => {
    if (!userId) {
      return;
    }
    setReminderNote(null);
    if (!enabled) {
      await cancelReminder();
      const next = { ...reminder, enabled: false };
      setReminder(next);
      await writeReminderSettings(userId, next);
      return;
    }

    // Permission is asked for here, in the moment the user turns the reminder on.
    const outcome = await requestReminderPermission();
    if (outcome !== 'granted') {
      setReminderNote(outcome === 'unsupported' ? 'Brauzerdə xatırlatma yoxdur.' : 'Bildiriş icazəsi verilmədi.');
      const next = { ...reminder, enabled: false };
      setReminder(next);
      await writeReminderSettings(userId, next);
      return;
    }

    const next = { ...reminder, enabled: true };
    setReminder(next);
    await writeReminderSettings(userId, next);
    if (session?.isOpen) {
      const scheduled = await scheduleReminder(userId, session.id, session.startedAtUtc, next.minutes);
      setReminderNote(scheduled ? null : 'Xatırlatma qurula bilmədi.');
    }
  };

  /**
   * Development only: schedule the running session's reminder 90 seconds out so the whole lifecycle — delivery
   * while backgrounded, cancellation by "Oyandım", reconciliation on resume — can be checked on a device in one
   * sitting instead of six hours. It goes through `scheduleReminder`, the same path the real setting uses, and
   * attaches to the same session, so what it proves is what ships. `__DEV__` keeps it out of a release build.
   */
  const onTestReminder = async () => {
    if (!userId || !session?.isOpen) {
      return;
    }
    setReminderNote(null);
    const outcome = await requestReminderPermission();
    if (outcome !== 'granted') {
      setReminderNote(outcome === 'unsupported' ? 'Brauzerdə xatırlatma yoxdur.' : 'Bildiriş icazəsi verilmədi.');
      return;
    }
    const scheduled = await scheduleReminder(userId, session.id, new Date().toISOString(), DevTestReminderMinutes);
    setReminderNote(scheduled ? 'Sınaq xatırlatması 90 saniyəyə quruldu. Tətbiqi arxa plana salın.' : 'Sınaq xatırlatması qurula bilmədi.');
  };

  const onChangeReminderMinutes = async (minutes: number) => {
    if (!userId) {
      return;
    }
    const next = { ...reminder, minutes };
    setReminder(next);
    await writeReminderSettings(userId, next);
    if (next.enabled && session?.isOpen) {
      const scheduled = await scheduleReminder(userId, session.id, session.startedAtUtc, minutes);
      setReminderNote(scheduled ? null : 'Bu müddət artıq keçib.');
    }
  };

  const onDelete = async (target: SleepSession) => {
    const confirmed = await confirmAsync('Yuxunu sil', `${wakeDayLabel(target)} · ${formatInterval(target)} silinsin?`);
    if (!confirmed) {
      return;
    }
    try {
      await remove.mutateAsync({ id: target.id });
      toast({ title: 'Yuxu silindi', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const openSession = (target: SleepSession) => router.push({ pathname: '/sleep/[id]', params: { id: target.id } });

  const card = (() => {
    if (active.isPending || summary.isPending) {
      return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLiveRegion="polite" accessibilityLabel="Yuxu məlumatı yüklənir…">
          <Skeleton width={120} height={12} />
          <Skeleton width="60%" height={32} radius={Radius.md} />
          <Skeleton height={48} radius={Radius.md} />
        </View>
      );
    }

    if (session?.isOpen) {
      const minutes = elapsedMinutes(session, now);
      return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="sleep-active-card">
          <View style={styles.cardHead}>
            <Ionicons name="moon" size={18} color={colors.moduleSleep} />
            <AppText variant="meta" color="textSecondary" style={styles.flex}>
              Yuxu davam edir
            </AppText>
            <AppText variant="meta" color="textMuted" testID="sleep-started-at">
              {timeOf(session.startedAtUtc)}-dan
            </AppText>
          </View>
          {/* Deliberately not a live region: it changes on its own every half minute. */}
          <AppText variant="display" style={styles.tabular} accessibilityLabel={`Keçən vaxt: ${describeDuration(minutes)}`} testID="sleep-elapsed">
            {formatDuration(minutes)}
          </AppText>
          <AppText variant="caption" color="textMuted">
            Müddət başlanğıc vaxtından hesablanır; tətbiq bağlansa da davam edir.
          </AppText>
          <Button title="Oyandım" icon="sunny-outline" onPress={() => void onStop()} loading={stop.isPending} testID="sleep-stop" />
        </View>
      );
    }

    const latest = summary.data?.latest ?? null;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="sleep-idle-card">
        {latest ? (
          <>
            <View style={styles.cardHead}>
              <Ionicons name="moon-outline" size={18} color={colors.moduleSleep} />
              <AppText variant="meta" color="textSecondary" style={styles.flex}>
                Son yuxu · {wakeDayLabel(latest)}
              </AppText>
            </View>
            <AppText variant="display" style={styles.tabular} accessibilityLabel={`Son yuxu: ${describeDuration(latest.durationMinutes ?? 0)}`} testID="sleep-latest">
              {formatDuration(latest.durationMinutes ?? 0)}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {formatInterval(latest)}
              {qualityLabel(latest.quality) ? ` · ${qualityLabel(latest.quality)}` : ''}
            </AppText>
          </>
        ) : (
          <>
            <View style={styles.cardHead}>
              <Ionicons name="moon-outline" size={18} color={colors.moduleSleep} />
              <AppText variant="bodyStrong" style={styles.flex}>
                Hələ yuxu qeyd olunmayıb
              </AppText>
            </View>
            <AppText variant="caption" color="textSecondary">
              Yatmağa gedəndə başladın; oyananda bir toxunuşla bitirin.
            </AppText>
          </>
        )}
        <Button title="Yatmağa başla" icon="moon-outline" onPress={() => void onStart()} loading={start.isPending} testID="sleep-start" />
      </View>
    );
  })();

  const week = summary.data ? (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="sleep-week">
      <View style={styles.cardHead}>
        <AppText variant="bodyStrong" style={styles.flex}>
          Son 7 gün
        </AppText>
      </View>
      <SleepStrip days={summary.data.days} />
      <AppText variant="caption" color="textSecondary" testID="sleep-average">
        Orta: {averageLabel(summary.data)}
      </AppText>
    </View>
  ) : null;

  const reminderCard = (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="sleep-reminder">
      <View style={styles.cardHead}>
        <Ionicons name="alarm-outline" size={18} color={colors.moduleSleep} />
        <AppText variant="bodyStrong" style={styles.flex}>
          Xatırlatma
        </AppText>
        <PressableScale
          accessibilityRole="switch"
          aria-checked={reminder.enabled}
          aria-disabled={!remindersSupported}
          accessibilityLabel="Oyanma xatırlatması"
          accessibilityHint="Yuxu başlayandan sonra bildiriş göndərir"
          disabled={!remindersSupported}
          onPress={() => void onToggleReminder(!reminder.enabled)}
          scaleTo={0.94}
          style={[styles.switch, { backgroundColor: reminder.enabled ? colors.moduleSleep : colors.surfaceSubtle, borderColor: reminder.enabled ? colors.moduleSleep : colors.border }]}
          testID="sleep-reminder-toggle">
          <View style={[styles.knob, { backgroundColor: colors.surface, alignSelf: reminder.enabled ? 'flex-end' : 'flex-start' }]} />
        </PressableScale>
      </View>

      {remindersSupported ? (
        <>
          <SegmentedControl
            accessibilityLabel="Xatırlatma müddəti"
            testID="sleep-reminder-minutes"
            value={String(reminder.minutes)}
            onChange={(value) => void onChangeReminderMinutes(Number(value))}
            disabled={!reminder.enabled}
            size="sm"
            options={reminderChoices.map((minutes) => ({ value: String(minutes), label: formatDuration(minutes) }))}
          />
          <AppText variant="caption" color={reminderNote ? 'warningText' : 'textMuted'} testID="sleep-reminder-status">
            {reminderNote ??
              (reminder.enabled
                ? 'Yuxu başlayandan sonra bu cihazda bildiriş gəlir. Vaxtı sistem müəyyən edir və başqa cihazdan ləğv edilə bilməz.'
                : 'Sönülüdür. Yalnız bu cihazda işləyir.')}
          </AppText>
          {/* Development builds only; never rendered in a release bundle. */}
          {__DEV__ && session?.isOpen ? (
            <Button title="Sınaq: 90 saniyəyə bildiriş" variant="ghost" size="sm" icon="bug-outline" onPress={() => void onTestReminder()} testID="sleep-reminder-test" />
          ) : null}
        </>
      ) : (
        <AppText variant="caption" color="textMuted" testID="sleep-reminder-status">
          Brauzerdə bildiriş xatırlatması yoxdur. Yuxu izləməsi tam işləyir.
        </AppText>
      )}
    </View>
  );

  const list = (() => {
    if (history.isPending) {
      return <ListSkeleton rows={3} label="Tarixçə yüklənir…" />;
    }
    if (history.isError && !history.data) {
      return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
    }
    const items = history.data?.items.filter((item) => !item.isOpen) ?? [];
    if (items.length === 0) {
      return (
        <EmptyState
          icon="moon-outline"
          accent={colors.moduleSleep}
          title="Tarixçə boşdur"
          message="Qeyd etdiyiniz yuxular burada toplanır."
          actionTitle="Əl ilə əlavə et"
          onAction={() => router.push('/sleep/new')}
          compact
        />
      );
    }

    return (
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="sleep-history">
        {items.map((item, index) => (
          <View key={item.id} style={[styles.row, index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${wakeDayLabel(item)}, ${describeDuration(item.durationMinutes ?? 0)}${qualityLabel(item.quality) ? `, ${qualityLabel(item.quality)}` : ''}`}
              accessibilityHint="Yuxunu açır və düzəliş etməyə imkan verir"
              onPress={() => openSession(item)}
              scaleTo={0.995}
              containerStyle={styles.flex}
              pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
              style={styles.rowBody}
              testID={`sleep-row-${item.id}`}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {wakeDayLabel(item)} · {formatDuration(item.durationMinutes ?? 0)}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {formatInterval(item)}
                  {qualityLabel(item.quality) ? ` · ${qualityLabel(item.quality)}` : ''}
                </AppText>
              </View>
            </PressableScale>
            <IconButton
              icon="trash-outline"
              accessibilityLabel={`${wakeDayLabel(item)} yuxusunu sil`}
              size={18}
              onPress={() => void onDelete(item)}
              testID={`sleep-delete-${item.id}`}
            />
          </View>
        ))}
      </View>
    );
  })();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="sleep-screen">
      <Entrance index={0}>
        <ScreenHeader
          back
          title="Yuxu"
          eyebrow="Plan"
          size="compact"
          trailing={
            <IconButton
              icon="add"
              accessibilityLabel="Əl ilə yuxu əlavə et"
              accessibilityHint="Keçmiş bir yuxunu qeyd edir"
              variant="primary"
              onPress={() => router.push('/sleep/new')}
              testID="sleep-add"
            />
          }
        />
      </Entrance>

      {/* A wake-up the server has not confirmed yet is named as such, with the moment it recorded. */}
      {applicable ? (
        <Entrance index={1}>
          <View style={[styles.pending, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert" testID="sleep-pending">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.warningText} />
            <View style={styles.flex}>
              <AppText variant="caption" color="warningText">
                {timeOf(applicable.endedAtUtc)} oyanışı hələ göndərilməyib.
              </AppText>
            </View>
            <Button title="Yenidən göndər" variant="ghost" size="sm" onPress={() => void syncPendingStop(applicable)} loading={stop.isPending} testID="sleep-retry-stop" />
          </View>
        </Entrance>
      ) : null}

      {active.isError && !active.data ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : (
        <>
          {summary.isError && summary.data ? <StaleNotice error={summary.error} onRetry={() => void summary.refetch()} /> : null}
          {wide ? (
            <View style={styles.columns}>
              <Entrance index={2} style={styles.columnMain}>
                <View style={styles.stack}>
                  {card}
                  {list}
                </View>
              </Entrance>
              <Entrance index={3} style={styles.columnSide}>
                <View style={styles.stack}>
                  {week}
                  {reminderCard}
                </View>
              </Entrance>
            </View>
          ) : (
            <>
              <Entrance index={2}>{card}</Entrance>
              <Entrance index={3}>{week}</Entrance>
              <Entrance index={4}>{reminderCard}</Entrance>
              <Entrance index={5}>{list}</Entrance>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  stack: {
    gap: Spacing.md,
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.huge,
    alignItems: 'flex-start',
  },
  columnMain: {
    flex: 7,
  },
  columnSide: {
    flex: 5,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingLeft: Spacing.md,
    borderRadius: Radius.md,
  },
  section: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    minHeight: MinTouchTarget,
    borderRadius: Radius.md,
  },
  switch: {
    width: 48,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
  },
});
