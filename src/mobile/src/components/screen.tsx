import type { PropsWithChildren, ReactNode, Ref } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /** Render children in a scroll view (default) or let the child manage scrolling (lists). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Tab screens sit under no native header and need top safe-area padding; pushed screens do too since headers are custom. */
  edges?: ('top' | 'bottom')[];
  /** Tab screens: the tab bar region below already owns the bottom safe area, so only breathing room is added. */
  tabInset?: boolean;
  maxWidth?: number;
  /** Rendered below the scroll view, above the bottom inset: sticky submit actions. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Access to the scroll view (forms scroll the first invalid field into view). */
  scrollRef?: Ref<ScrollView>;
  testID?: string;
}>;

/**
 * Page container: canvas background, safe areas, keyboard avoidance, and a deliberate max width so desktop web
 * is a composed layout instead of a stretched phone. The phone tab bar is laid out below this container by the
 * navigator (it is not an overlay), so tab screens never need extra clearance.
 */
export function Screen({ children, scroll = true, refreshing = false, onRefresh, edges = ['top', 'bottom'], tabInset = false, maxWidth = Layout.maxContent, footer, contentStyle, scrollRef, testID }: ScreenProps) {
  const { colors, pagePadding, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const top = edges.includes('top') ? insets.top : 0;
  const bottom = edges.includes('bottom') && !footer && !tabInset ? insets.bottom : 0;
  const paddingBottom = Spacing.xxl + bottom;
  const paddingTop = top + (layout === 'wide' ? Spacing.xxl : Spacing.md);

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]} testID={testID}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[styles.content, { paddingTop, paddingBottom, paddingHorizontal: pagePadding }]}
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>
            <View style={[styles.inner, { maxWidth }, contentStyle]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.listRoot, { paddingTop, paddingHorizontal: pagePadding }]}>
            <View style={[styles.flex, styles.inner, { maxWidth }, contentStyle]}>{children}</View>
          </View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md), paddingHorizontal: pagePadding, backgroundColor: colors.canvas, borderTopColor: colors.border }]}>
            <View style={[styles.inner, { maxWidth }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  listRoot: {
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    gap: Spacing.xxl,
  },
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
