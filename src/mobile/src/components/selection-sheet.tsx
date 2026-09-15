import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup } from '@/lib/a11y';

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

/**
 * Selection list in a sheet: every option is a full-width 48 pt row, so long Azerbaijani labels never clip.
 * One pattern for every sheet list — a labelled radio group whose rows carry `aria-checked`, entered once with
 * Tab and traversed with the arrow keys. Arrow keys move a *pending* selection inside the dialog: the checked
 * radio follows focus, while the owning field only changes when the user commits (Space, Enter or a tap).
 * Escape closes without committing, and reopening restores the committed value.
 */
export function SelectionSheet<TValue extends string>({ visible, title, options, value, onSelect, onClose, emptyMessage = 'Seçim yoxdur.', footer }: SelectionSheetProps<TValue>) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={footer}>
      {options.length === 0 ? (
        <AppText color="textSecondary" style={styles.empty}>
          {emptyMessage}
        </AppText>
      ) : visible ? (
        // Mounted only while open, so the pending selection always starts from the committed value.
        <OptionList title={title} options={options} value={value} onSelect={onSelect} />
      ) : null}
    </Sheet>
  );
}

function OptionList<TValue extends string>({ title, options, value, onSelect }: Pick<SelectionSheetProps<TValue>, 'title' | 'options' | 'value' | 'onSelect'>) {
  const { colors } = useTheme();
  const listRef = useRef<View>(null);
  /** The row the dialog is showing as chosen; the owning field changes only on commit. */
  const [pending, setPending] = useState(value);
  const enabledOptions = options.filter((option) => !option.disabled);
  const moveTo = (position: number) => {
    const option = enabledOptions[position];
    if (option) {
      setPending(option.value);
    }
  };
  const commitAt = (position: number) => {
    const option = enabledOptions[position];
    if (option) {
      onSelect(option.value);
    }
  };
  useRovingRadioGroup(listRef, { onSelect: moveTo, onActivate: commitAt });

  return (
    <View ref={listRef} accessibilityRole="radiogroup" accessibilityLabel={title} testID="selection-options">
      {options.map((option) => {
        const selected = option.value === pending;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            aria-checked={selected}
            aria-disabled={Boolean(option.disabled)}
            accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
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
      })}
    </View>
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
