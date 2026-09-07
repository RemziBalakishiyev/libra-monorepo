import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SelectionOption<TValue extends string> {
  value: TValue;
  label: string;
  hint?: string;
  icon?: IconName;
  iconColor?: string;
  /** Right-aligned detail, e.g. this month's spend. */
  trailing?: ReactNode;
  disabled?: boolean;
}

type SelectionSheetProps<TValue extends string> = {
  visible: boolean;
  title: string;
  options: readonly SelectionOption<TValue>[];
  value: TValue | '';
  onSelect: (value: TValue) => void;
  onClose: () => void;
  emptyMessage?: string;
  /** Optional action under the list, e.g. "Yeni hesab". */
  footer?: ReactNode;
};

/** Selection list in a sheet: every option is a full-width 48 pt row, so long Azerbaijani labels never clip. */
export function SelectionSheet<TValue extends string>({ visible, title, options, value, onSelect, onClose, emptyMessage = 'Seçim yoxdur.', footer }: SelectionSheetProps<TValue>) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={footer}>
      {options.length === 0 ? (
        <AppText color="textSecondary" style={styles.empty}>
          {emptyMessage}
        </AppText>
      ) : (
        options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected, disabled: Boolean(option.disabled) }}
              accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
              disabled={option.disabled}
              onPress={() => onSelect(option.value)}
              scaleTo={0.99}
              containerStyle={styles.full}
              pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
              style={[styles.option, { backgroundColor: selected ? colors.primarySoft : 'transparent' }]}>
              {option.icon ? (
                <View style={[styles.optionIcon, { backgroundColor: colors.surfaceSubtle }]}>
                  <Ionicons name={option.icon} size={18} color={option.iconColor ?? colors.textSecondary} />
                </View>
              ) : null}
              <View style={styles.optionText}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {option.label}
                </AppText>
                {option.hint ? (
                  <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                    {option.hint}
                  </AppText>
                ) : null}
              </View>
              {option.trailing}
              {selected ? <Ionicons name="checkmark" size={20} color={colors.primaryText} /> : null}
            </PressableScale>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  empty: {
    padding: Spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: Spacing.xxs,
  },
});
