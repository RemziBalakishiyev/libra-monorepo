import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionHeaderProps = {
  title: string;
  /** Right-aligned link such as "Hamısı". */
  actionTitle?: string;
  onAction?: () => void;
  /** Small trailing caption when there is no action. */
  caption?: string;
};

/** Section divider used instead of wrapping every block in a card. */
export function SectionHeader({ title, actionTitle, onAction, caption }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <AppText variant="subheading" accessibilityRole="header" style={styles.flex} numberOfLines={1}>
        {title}
      </AppText>
      {actionTitle && onAction ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`${actionTitle}: ${title}`} onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}>
          <AppText variant="meta" color="primaryText">
            {actionTitle}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.primaryText} />
        </Pressable>
      ) : caption ? (
        <AppText variant="caption" color="textMuted">
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 32,
  },
  flex: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    minHeight: 32,
    justifyContent: 'center',
  },
});
