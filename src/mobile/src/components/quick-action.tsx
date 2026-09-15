import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type QuickActionKind = 'expense' | 'income' | 'transfer' | 'meal' | 'task' | 'sleep';

export interface QuickActionDefinition {
  kind: QuickActionKind;
  title: string;
  hint: string;
  icon: IconName;
}

/** Finance's own Quick Add: the three money actions, unchanged. */
export const quickActionDefinitions: readonly QuickActionDefinition[] = [
  { kind: 'expense', title: 'Xərc', hint: 'Yeni xərc qeyd et', icon: 'arrow-up-outline' },
  { kind: 'income', title: 'Gəlir', hint: 'Yeni gəlir qeyd et', icon: 'arrow-down-outline' },
  { kind: 'transfer', title: 'Köçürmə', hint: 'Hesablar arasında köçür', icon: 'swap-horizontal-outline' },
];

/** The global Quick Add on Home, which reaches across modules. */
export const globalQuickActionDefinitions: readonly QuickActionDefinition[] = [
  { kind: 'expense', title: 'Xərc', hint: 'Yeni xərc qeyd et', icon: 'arrow-up-outline' },
  { kind: 'income', title: 'Gəlir', hint: 'Yeni gəlir qeyd et', icon: 'arrow-down-outline' },
  { kind: 'meal', title: 'Yemək', hint: 'Yeni qidalanma qeydi', icon: 'nutrition-outline' },
  { kind: 'task', title: 'Tapşırıq', hint: 'Yeni tapşırıq planlaşdır', icon: 'checkbox-outline' },
  // Opens the sleep screen and stops there: Quick Add never starts or ends a session on the user's behalf.
  { kind: 'sleep', title: 'Yuxu', hint: 'Yuxu ekranını açır', icon: 'moon-outline' },
  { kind: 'transfer', title: 'Köçürmə', hint: 'Hesablar arasında köçür', icon: 'swap-horizontal-outline' },
];

type QuickActionProps = {
  action: QuickActionDefinition;
  onPress: (kind: QuickActionKind) => void;
  /** `pill` = compact horizontal control for the dashboard row; `row` = list row for menus and sheets. */
  layout?: 'pill' | 'row';
  style?: StyleProp<ViewStyle>;
};

export function useQuickActionTint(kind: QuickActionKind): { strong: string; soft: string; text: string } {
  const { colors } = useTheme();
  if (kind === 'expense') {
    return { strong: colors.expense, soft: colors.expenseSoft, text: colors.expenseText };
  }
  if (kind === 'income') {
    return { strong: colors.income, soft: colors.incomeSoft, text: colors.incomeText };
  }
  if (kind === 'meal') {
    return { strong: colors.moduleNutrition, soft: colors.surfaceSubtle, text: colors.textPrimary };
  }
  if (kind === 'task') {
    return { strong: colors.modulePlan, soft: colors.surfaceSubtle, text: colors.textPrimary };
  }
  if (kind === 'sleep') {
    return { strong: colors.moduleSleep, soft: colors.surfaceSubtle, text: colors.textPrimary };
  }
  return { strong: colors.transfer, soft: colors.transferSoft, text: colors.transferText };
}

/** Xərc / Gəlir / Köçürmə. Distinct by semantic tint, coherent by shape. */
export function QuickAction({ action, onPress, layout = 'pill', style }: QuickActionProps) {
  const { colors } = useTheme();
  const tint = useQuickActionTint(action.kind);

  if (layout === 'row') {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={action.title}
        accessibilityHint={action.hint}
        onPress={() => onPress(action.kind)}
        scaleTo={0.985}
        containerStyle={styles.full}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={[styles.row, style]}>
        <View style={[styles.rowIcon, { backgroundColor: tint.soft }]}>
          <Ionicons name={action.icon} size={20} color={tint.strong} />
        </View>
        <View style={styles.rowText}>
          <AppText variant="bodyStrong">{action.title}</AppText>
          <AppText variant="caption" color="textSecondary">
            {action.hint}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </PressableScale>
    );
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityHint={action.hint}
      onPress={() => onPress(action.kind)}
      containerStyle={[styles.slot, style]}
      pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
      style={[styles.pill, { backgroundColor: tint.soft }]}>
      <Ionicons name={action.icon} size={18} color={tint.strong} />
      <AppText variant="bodyStrong" style={{ color: tint.text }} align="center">
        {action.title}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  slot: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.xxs,
  },
});
