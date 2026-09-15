import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Entrance } from '@/components/entrance';
import { QuickAction, globalQuickActionDefinitions, type QuickActionKind } from '@/components/quick-action';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { quickActionHref } from '@/lib/quick-add';

type QuickActionLink = { key: QuickActionKind; title: string; hint: string; href: ReturnType<typeof quickActionHref> };

/** Route table for the quick-add screen (also used by deep links and tests). */
export const quickActions: readonly QuickActionLink[] = globalQuickActionDefinitions.map((action) => ({
  key: action.kind,
  title: action.title,
  hint: action.hint,
  href: quickActionHref(action.kind),
}));

/** Modal route with the most common actions across modules. Replaces itself with the chosen form. */
export function QuickAddScreen() {
  const router = useRouter();
  const { colors, shadows } = useTheme();

  return (
    <Screen maxWidth={Layout.maxForm}>
      <Entrance style={styles.stack}>
        <View style={styles.heading}>
          <AppText variant="title" accessibilityRole="header">
            Tez əlavə et
          </AppText>
          <AppText color="textSecondary">Nə qeyd etmək istəyirsiniz?</AppText>
        </View>
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
          {globalQuickActionDefinitions.map((action) => (
            <QuickAction key={action.kind} action={action} layout="row" onPress={(kind) => router.replace(quickActionHref(kind))} />
          ))}
        </View>
      </Entrance>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.xl,
  },
  heading: {
    gap: Spacing.xs,
  },
  list: {
    padding: Spacing.sm,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.xxs,
  },
});
