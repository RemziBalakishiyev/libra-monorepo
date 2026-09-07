import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/text';
import { tabs } from '@/constants/tabs';
import { Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Minimal structural type of React Navigation's tab bar props (Expo Router bundles the navigator). */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
}

/**
 * Five-destination tab bar for phones and tablets. It is laid out in the normal flow under the scene, inside an
 * opaque canvas-coloured region that owns the bottom safe area, so content and focused controls can never sit
 * behind it; the floating pill is purely visual and grows with enlarged text instead of clipping labels. Tabs are peers, so nothing slides: the indicator pill
 * translates (240 ms) and the active icon scales 1 → 1.06. Quick Add lives in the screen headers, not here.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const { colors, shadows, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slot = width > 0 ? width / state.routes.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = state.index * slot;
    x.set(reducedMotion ? target : withTiming(target, { duration: Motion.move, easing: Motion.easeInOut }));
  }, [state.index, slot, reducedMotion, x]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={[styles.region, { backgroundColor: colors.canvas, paddingBottom: Math.max(insets.bottom, Layout.tabBarGutter) }]} testID="tab-bar-region">
      <View style={[styles.bar, { backgroundColor: colors.navSurface, borderColor: colors.navBorder, boxShadow: shadows.nav }]} accessibilityRole="tablist">
        <View onLayout={onLayout} style={styles.slots}>
          {slot > 0 ? (
            <Animated.View style={[styles.indicatorTrack, { width: slot }, indicatorStyle]}>
              <View style={[styles.indicator, { backgroundColor: colors.primarySoft }]} />
            </Animated.View>
          ) : null}
          {state.routes.map((route, index) => {
            const tab = tabs.find((item) => item.name === route.name);
            const active = index === state.index;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab?.title ?? route.name} onPress={onPress} style={styles.tab}>
                <TabIcon name={active ? (tab?.activeIcon ?? 'ellipse') : (tab?.icon ?? 'ellipse-outline')} active={active} color={active ? colors.primaryText : colors.textMuted} />
                <AppText variant="caption" align="center" style={{ color: active ? colors.primaryText : colors.textMuted }} numberOfLines={2}>
                  {tab?.title ?? route.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabIcon({ name, active, color }: { name: React.ComponentProps<typeof Ionicons>['name']; active: boolean; color: string }) {
  const { reducedMotion } = useTheme();
  const scale = useSharedValue(active ? 1.06 : 1);

  useEffect(() => {
    const target = active ? 1.06 : 1;
    scale.set(reducedMotion ? target : withTiming(target, { duration: Motion.quick, easing: Motion.easeOut }));
  }, [active, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={24} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  region: {
    paddingTop: Layout.tabBarGutter,
    paddingHorizontal: Spacing.lg,
  },
  bar: {
    minHeight: Layout.tabBarHeight,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  slots: {
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xxs,
    minHeight: Layout.tabBarHeight - 2,
  },
  indicatorTrack: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 4,
    right: 4,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
});
