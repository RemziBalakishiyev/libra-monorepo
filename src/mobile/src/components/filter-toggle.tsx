import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityHint={accessibilityHint}
      onPress={() => onChange(!value)}
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
