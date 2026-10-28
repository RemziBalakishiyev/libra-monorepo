import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/button';
import { TextField } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { useToast } from '@/components/toast';
import { Layout, MinTouchTarget, Motion, Radius, Spacing } from '@/constants/theme';
import { useFocusTimer, focusTimer } from '@/hooks/use-focus';
import { useProfile } from '@/hooks/use-profile';
import { useSetTaskCompletion } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import { confirmAsync } from '@/lib/confirm';
import { clampPhaseSeconds, focusPresets, normalizeSettings, type FocusPhase, type FocusSettings } from '@/lib/focus/machine';
import { focusNotificationsSupported, requestFocusNotificationPermission } from '@/lib/focus/notification';
import { cycleLabel, cycleMarkers, describeFocus } from '@/lib/focus/presentation';
import { useScreenFocused } from '@/hooks/use-screen-focused';
import { FocusScene } from '@/screens/plan/focus-scene';

/**
 * A whole number of minutes, or null when the field is empty or not a number.
 *
 * `parseDecimalInput` cannot be used here: asked for zero decimals it builds the regex `\d{1,0}`, which is
 * not a valid quantifier, so every value would be rejected and the field could never be edited.
 */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : null;
}

const phaseLabels: Record<FocusPhase, string> = {
  focus: 'Fokus',
  shortBreak: 'Qısa fasilə',
  longBreak: 'Uzun fasilə',
};

/**
 * The Fokus screen: one forest scene holding the whole timer, and the controls around it.
 *
 * The timer itself lives in the store, not here — leaving this screen, or the app, does not stop it. What the
 * scene draws is the real share the timer reports, and `describeFocus` decides the whole presentation from
 * that one state, so the figure, the title and the result can never tell three different stories.
 *
 * Every loop in the scene is decoration. None of it advances the timer, records a session or fires a
 * callback that does, and all of it stops when the screen is not being looked at.
 */
export function FocusScreen() {
  const router = useRouter();
  const { colors, reducedMotion } = useTheme();
  const toast = useToast();
  const profile = useProfile();
  const timer = useFocusTimer();
  const completion = useSetTaskCompletion();
  const screenFocused = useScreenFocused();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const [foreground, setForeground] = useState(true);

  const userId = profile.data?.id;
  useEffect(() => {
    void focusTimer.hydrate(userId);
  }, [userId]);

  // Decorative loops stop with the app, not just with the screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => subscription.remove();
  }, []);

  const state = timer.state;
  const phase: FocusPhase = state?.phase ?? 'focus';
  const status = state?.status ?? 'ready';
  // The store owns the instant everything is derived from; render never reads a clock of its own.
  const view = describeFocus(state, timer.settings, timer.nowMs);
  const markers = cycleMarkers(state, timer.settings);
  const cycleText = cycleLabel(state, timer.settings);
  const still = reducedMotion || !screenFocused || !foreground;

  // A completed run pulses the ring once. Keyed on the session so it cannot replay on a re-render, and
  // never set for a session that was stopped early.
  const celebrateKey = view.celebrate && state ? hashId(state.sessionId) : 0;

  // ── Entrance: the scene, then the controls, ~70 ms apart. Controls stay pressable throughout. ─────────
  const reveal = useSharedValue(reducedMotion ? 1 : 0);
  const revealControls = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      reveal.set(1);
      revealControls.set(1);
      return;
    }
    reveal.set(withTiming(1, { duration: 560, easing: Motion.easeOut }));
    revealControls.set(withDelay(70, withTiming(1, { duration: 560, easing: Motion.easeOut })));
    // Mount only: a data refresh must not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sceneStyle = useAnimatedStyle(() => ({
    opacity: reveal.get(),
    transform: [{ translateY: (1 - reveal.get()) * 14 }, { scale: 0.97 + 0.03 * reveal.get() }],
  }));
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: revealControls.get(),
    transform: [{ translateY: (1 - revealControls.get()) * 10 }],
  }));

  const choosePhase = async (next: FocusPhase) => {
    if (state && (state.status === 'running' || state.status === 'paused')) {
      // A run in progress is never discarded by a tap on another phase.
      toast({ title: 'Əvvəlcə cari sessiyanı dayandırın', tone: 'error' });
      return;
    }
    await focusTimer.prepare(next, next === 'focus' ? (state?.link ?? null) : null);
  };

  const onStart = async () => {
    // Permission is asked in the moment it becomes useful, once, and a refusal changes nothing.
    if (focusNotificationsSupported && !permissionAsked) {
      setPermissionAsked(true);
      await requestFocusNotificationPermission();
    }
    await focusTimer.start();
  };

  const onStop = async () => {
    // Stopping keeps the time spent, so it is confirmed but never labelled as a deletion.
    const confirmed = await confirmAsync(
      'Sessiyanı dayandır',
      phase === 'focus'
        ? 'Bu fokus vaxtından əvvəl bitəcək. Keçirdiyiniz vaxt yazılacaq, lakin tamamlanmış fokus sayılmayacaq.'
        : 'Fasilə bitəcək.',
      'Dayandır',
      false,
    );
    if (confirmed) {
      await focusTimer.finish();
    }
  };

  const onPrimary = async () => {
    switch (view.primaryAction) {
      case 'start':
        await onStart();
        return;
      case 'pause':
        await focusTimer.pause();
        return;
      case 'resume':
        await focusTimer.resume();
        return;
      case 'advance':
        await focusTimer.advance();
        return;
      default:
        // Focusing again after a stop: a fresh focus phase, keeping the task it was attached to.
        await focusTimer.prepare('focus', state?.link ?? null);
    }
  };

  const onCompleteTask = async () => {
    const link = state?.link;
    if (!link) {
      return;
    }
    try {
      // The ordinary task mutation: finishing a focus run never completes a task on its own.
      await completion.mutateAsync({ id: link.taskId, completed: true });
      toast({ title: 'Tapşırıq tamamlandı', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  return (
    <Screen maxWidth={Layout.maxForm} contentStyle={styles.page} testID="focus-screen">
      <View style={styles.head}>
        <IconButton icon="chevron-down" accessibilityLabel="Kiçilt" accessibilityHint="Fokus ekranını bağlayır, taymer işləməyə davam edir" variant="filled" onPress={() => router.back()} testID="focus-minimize" />
        <View style={styles.flex} />
        <IconButton icon="options-outline" accessibilityLabel="Fokus ayarları" variant="filled" onPress={() => setSettingsOpen(true)} testID="focus-settings-open" />
      </View>

      <SegmentedControl
        accessibilityLabel="Mərhələ"
        testID="focus-phase"
        value={phase}
        onChange={(next) => void choosePhase(next)}
        size="sm"
        options={(['focus', 'shortBreak', 'longBreak'] as const).map((value) => ({ value, label: phaseLabels[value] }))}
      />

      {/* The task the run is attached to, as one compact control. */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={state?.link ? `Tapşırıq: ${state.link.title}` : 'Tapşırıqsız fokus'}
        accessibilityHint={state?.link ? 'Tapşırığın əlaqəsini silir' : 'Tapşırığı Plan ekranındakı “Bu işə fokuslan” ilə əlavə edin'}
        disabled={!state?.link || status === 'running' || status === 'paused'}
        dimWhenDisabled={false}
        onPress={() => void focusTimer.setLink(null)}
        scaleTo={0.98}
        style={[styles.taskChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="focus-task">
        <Ionicons name={state?.link ? 'checkbox-outline' : 'ellipse-outline'} size={15} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.flex} testID="focus-link">
          {state?.link?.title ?? 'Tapşırıqsız fokus'}
        </AppText>
        {state?.link && status !== 'running' && status !== 'paused' ? <Ionicons name="close" size={14} color={colors.textMuted} /> : null}
      </PressableScale>

      <Animated.View style={sceneStyle}>
        <FocusScene view={view} cycle={markers} cycleLabel={cycleText} still={still} celebrateKey={celebrateKey} />
      </Animated.View>

      <Animated.View style={[styles.controls, controlsStyle]}>
        <View style={styles.result} testID="focus-state">
          <AppText variant="bodyStrong" testID="focus-title">
            {view.title}
          </AppText>
          {view.detail ? (
            <AppText variant="caption" color="textSecondary" testID="focus-detail">
              {view.detail}
            </AppText>
          ) : null}
        </View>

        {/* One prominent primary action, whatever the state calls for. */}
        <Button title={view.primaryLabel} icon={primaryIcon(view.primaryAction)} onPress={() => void onPrimary()} disabled={timer.userId === null} testID="focus-primary" />

        {/* Stopping is a separate, quieter control — never the same button as pausing. */}
        {view.showStop ? <Button title="Sessiyanı dayandır" variant="ghost" onPress={() => void onStop()} testID="focus-stop" /> : null}

        {view.kind === 'ready' ? (
          <View style={styles.presets}>
            {focusPresets.map((seconds) => {
              const selected = (state?.durationSeconds ?? timer.settings.focusSeconds) === seconds;
              return (
                <PressableScale
                  key={seconds}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  accessibilityLabel={`${Math.round(seconds / 60)} dəqiqə`}
                  onPress={() => void focusTimer.setDuration(seconds)}
                  scaleTo={0.96}
                  style={[styles.preset, { backgroundColor: selected ? colors.primarySoft : colors.surfaceSubtle, borderColor: selected ? colors.primaryText : colors.border }]}
                  testID={`focus-preset-${seconds}`}>
                  <AppText variant="caption" color={selected ? 'primaryText' : 'textSecondary'}>
                    {Math.round(seconds / 60)} dəq
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        ) : null}

        {/* Completing the task is a separate, explicit action: finishing a run never does it. */}
        {state?.link && (view.kind === 'completed' || view.kind === 'stopped') ? (
          <Button title="Tapşırığı bitir" variant="soft" onPress={() => void onCompleteTask()} loading={completion.isPending} testID="focus-complete-task" />
        ) : null}

        {timer.pending > 0 ? (
          <AppText variant="caption" color="textMuted" style={styles.centerText} testID="focus-pending">
            {timer.pending} qeyd göndərilməyi gözləyir
          </AppText>
        ) : null}
      </Animated.View>

      <FocusSettingsSheet
        visible={settingsOpen}
        settings={timer.settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          void focusTimer.saveSettings(next);
          setSettingsOpen(false);
        }}
        locked={status === 'running' || status === 'paused'}
      />
    </Screen>
  );
}

function primaryIcon(action: 'start' | 'pause' | 'resume' | 'advance' | 'restart'): 'play' | 'pause' | 'arrow-forward' | 'refresh' {
  return action === 'pause' ? 'pause' : action === 'advance' ? 'arrow-forward' : action === 'restart' ? 'refresh' : 'play';
}

/** A stable small number from a session id, so the celebration keys off the session and not the render. */
function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1_000_000;
  }
  return hash + 1;
}

function FocusSettingsSheet({
  visible,
  settings,
  onClose,
  onSave,
  locked,
}: {
  visible: boolean;
  settings: FocusSettings;
  onClose: () => void;
  onSave: (settings: FocusSettings) => void;
  locked: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Fokus ayarları" maxWidth={420} testID="focus-settings">
      {/* The body mounts with the sheet, so the draft starts from the stored settings every time it opens. */}
      {visible ? <FocusSettingsBody settings={settings} onSave={onSave} locked={locked} /> : null}
    </Sheet>
  );
}

function FocusSettingsBody({ settings, onSave, locked }: { settings: FocusSettings; onSave: (settings: FocusSettings) => void; locked: boolean }) {
  const [draft, setDraft] = useState(settings);

  const minutes = (seconds: number) => String(Math.round(seconds / 60));
  const change = (key: keyof FocusSettings) => (text: string) => {
    const value = wholeNumber(text);
    // An empty field is left mid-edit rather than snapping back, and is clamped when it is saved.
    setDraft((current) => ({ ...current, [key]: value === null ? current[key] : clampPhaseSeconds(value * 60) }));
  };

  return (
    <View style={styles.settings}>
      {locked ? (
        <AppText variant="caption" color="textSecondary" testID="focus-settings-note">
          Dəyişikliklər növbəti mərhələdən qüvvəyə minir; işləyən mərhələ başladığı müddəti saxlayır.
        </AppText>
      ) : null}
      <TextField label="Fokus (dəqiqə)" value={minutes(draft.focusSeconds)} onChangeText={change('focusSeconds')} keyboardType="number-pad" inputMode="numeric" testID="focus-setting-focus" />
      <TextField label="Qısa fasilə (dəqiqə)" value={minutes(draft.shortBreakSeconds)} onChangeText={change('shortBreakSeconds')} keyboardType="number-pad" inputMode="numeric" testID="focus-setting-short" />
      <TextField label="Uzun fasilə (dəqiqə)" value={minutes(draft.longBreakSeconds)} onChangeText={change('longBreakSeconds')} keyboardType="number-pad" inputMode="numeric" testID="focus-setting-long" />
      <TextField
        label="Uzun fasilədən əvvəl fokus sayı"
          value={String(draft.runsBeforeLongBreak)}
          onChangeText={(text) => {
            const value = wholeNumber(text);
            setDraft((current) => ({ ...current, runsBeforeLongBreak: value === null ? current.runsBeforeLongBreak : Math.min(8, Math.max(2, value)) }));
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          testID="focus-setting-cycle"
        />
      <Button title="Yadda saxla" onPress={() => onSave(normalizeSettings(draft))} testID="focus-settings-save" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: Spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget - 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controls: {
    gap: Spacing.md,
  },
  result: {
    alignItems: 'center',
    gap: 2,
  },
  centerText: {
    textAlign: 'center',
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  preset: {
    minHeight: MinTouchTarget - 8,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settings: {
    gap: Spacing.md,
  },
});
