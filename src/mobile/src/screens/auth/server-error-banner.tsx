import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { Entrance } from '@/components/entrance';
import { AppText } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/lib/motion';

/** Problem Details message from the server, announced as an alert. Renders nothing when there is no error. */
export function ServerErrorBanner({ message }: { message: string | null | undefined }) {
  const { colors } = useTheme();
  const motion = useMotion();
  if (!message) {
    return null;
  }
  return (
    <Entrance exiting={motion.exit()} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.banner, { backgroundColor: colors.errorSoft }]}>
      <Ionicons name="alert-circle" size={18} color={colors.error} />
      <AppText variant="meta" color="error" style={styles.text}>
        {message}
      </AppText>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  text: {
    flex: 1,
  },
});
