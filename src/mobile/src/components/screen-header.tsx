import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { AppText } from '@/components/text';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
  /** Small line above the title (month, greeting). */
  eyebrow?: string;
  subtitle?: string;
  /** Shows a back button that pops the stack (or goes home when nothing can be popped). */
  back?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
  size?: 'large' | 'compact';
};

/** In-content header used by every screen (native headers are disabled for a consistent cross-platform look). */
export function ScreenHeader({ title, eyebrow, subtitle, back = false, onBack, trailing, size = 'large' }: ScreenHeaderProps) {
  const router = useRouter();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={styles.row}>
      {back ? <IconButton icon="chevron-back" accessibilityLabel="Geri" onPress={goBack} variant="filled" /> : null}
      <View style={styles.text}>
        {eyebrow ? (
          <AppText variant="meta" color="textSecondary" numberOfLines={1}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant={size === 'large' ? 'title' : 'heading'} accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
  },
  text: {
    flex: 1,
    gap: Spacing.xxs,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
