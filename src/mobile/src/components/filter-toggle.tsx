import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef } from 'react';
import { StyleSheet, type View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSpaceActivate } from '@/lib/a11y';

type FilterToggleProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon?: IconName;
  /** Small count shown after the label, e.g. archived items available. */
  count?: number;
  accessibilityHint?: string;
};

/** Compact secondary filter (e.g. "Arxivdəkilər"): a checkable chip instead of a full-width switch row. */
export function FilterToggle({ label, value, onChange, icon = 'archive-outline', count, accessibilityHint }: FilterToggleProps) {
  const { colors } = useTheme();
  const ref = useRef<View>(null);
  const toggle = useCallback(() => onChange(!value), [onChange, value]);
  // react-native-web activates non-button roles with Enter only; a checkbox also answers to Space.
  useSpaceActivate(ref, toggle);

  return (
    <PressableScale
      ref={ref}
      accessibilityRole="checkbox"
      aria-checked={value}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityHint={accessibilityHint}
      onPress={toggle}
      scaleTo={0.97}
      containerStyle={styles.slot}
      pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
      style={[styles.chip, { backgroundColor: value ? colors.primarySoft : colors.surface, borderColor: value ? colors.primarySoft : colors.border }]}>
      <Ionicons name={value ? 'checkmark-circle' : icon} size={16} color={value ? colors.primaryText : colors.textSecondary} />
      <AppText variant="meta" color={value ? 'primaryText' : 'textSecondary'} numberOfLines={1}>
        {label}
        {count !== undefined ? ` · ${count}` : ''}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignSelf: 'flex-start',
    minHeight: MinTouchTarget - 4,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
