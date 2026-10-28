import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entrance } from '@/components/entrance';
import { AppText } from '@/components/text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/lib/motion';

export interface PopoverAnchor {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

type SheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  /**
   * `sheet` = bottom sheet on phones and a centred dialog on wider layouts; `dialog` = always centred;
   * `popover` = anchored to a trigger (desktop menus), placed with `anchor`.
   */
  presentation?: 'sheet' | 'dialog' | 'popover';
  anchor?: PopoverAnchor;
  /** Rendered under the scrollable body (action buttons). */
  footer?: ReactNode;
  /** Announces the purpose to screen readers. */
  accessibilityLabel?: string;
  maxWidth?: number;
  scrollable?: boolean;
  /** Hides the close control (popovers with self-explanatory rows). Escape and the scrim still dismiss. */
  hideClose?: boolean;
  testID?: string;
}>;

const FOCUSABLE = 'button,[href],input,select,textarea,[role="button"],[role="radio"],[role="tab"],[tabindex]:not([tabindex="-1"])';

/**
 * Modal surface used for selection lists, confirmations, menus and popovers. Phones get a bottom sheet with the
 * iOS sheet curve; tablets and desktop get a centred dialog or an anchored popover. On web, focus moves into
 * the surface on open, Tab is contained inside it, Escape closes it, and focus returns to the trigger on close.
 */
export function Sheet({ visible, onClose, title, presentation = 'sheet', anchor, footer, accessibilityLabel, maxWidth = 480, scrollable = true, hideClose = false, children, testID }: SheetProps) {
  const { colors, layout, shadows } = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // A phone sheet may use everything under the status bar; the body shrinks and scrolls inside that bound, so
  // the header and footer stay reachable on short screens and with enlarged text. Recomputed on rotation.
  const sheetMaxHeight = Math.max(240, windowHeight - insets.top - Spacing.xl);
  const isPopover = presentation === 'popover' && layout !== 'compact';
  const isDialog = !isPopover && (presentation === 'dialog' || layout !== 'compact');
  const previousFocus = useRef<Element | null>(null);
  const container = useRef<View>(null);
  const closeButton = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    if (visible) {
      previousFocus.current = document.activeElement;
      const timer = setTimeout(() => {
        const close = closeButton.current as unknown as HTMLElement | null;
        if (close?.focus) {
          close.focus();
          return;
        }
        const root = container.current as unknown as HTMLElement | null;
        const first = root?.querySelector<HTMLElement>(FOCUSABLE);
        first?.focus?.();
      }, 30);
      return () => clearTimeout(timer);
    }
    const previous = previousFocus.current as HTMLElement | null;
    previous?.focus?.();
    previousFocus.current = null;
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !visible) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const root = container.current as unknown as HTMLElement | null;
      if (!root) {
        return;
      }
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true' && element.getAttribute('aria-hidden') !== 'true');
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? root.contains(active) : false;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const body = (
    <View ref={container} style={styles.container}>
      {!isDialog && !isPopover ? <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} /> : null}
      {title || !hideClose ? (
        <View style={[styles.header, isPopover ? styles.headerPopover : null]}>
          {title ? (
            <AppText variant={isPopover ? 'meta' : 'heading'} color={isPopover ? 'textMuted' : 'textPrimary'} accessibilityRole="header" style={styles.flex}>
              {title}
            </AppText>
          ) : (
            <View style={styles.flex} />
          )}
          {!hideClose ? (
            <Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Bağla" onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.close, isPopover ? styles.closeSmall : null, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]}>
              <Ionicons name="close" size={isPopover ? 16 : 20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {scrollable ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
    </View>
  );

  const surfaceStyle: StyleProp<ViewStyle> = { backgroundColor: colors.surfaceRaised, borderColor: colors.border, boxShadow: shadows.overlay };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      <View style={[styles.root, isDialog ? styles.rootCenter : null]}>
        <Animated.View entering={FadeIn.duration(Motion.quick)} exiting={motion.exit()} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Bağla" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: isPopover ? 'transparent' : colors.scrim }]} />
        </Animated.View>
        {isPopover ? (
          <Entrance from="scale" exiting={motion.exit()} accessibilityViewIsModal accessibilityLabel={accessibilityLabel ?? title} containerStyle={[styles.popoverSlot, { maxWidth, top: anchor?.top, right: anchor?.right, bottom: anchor?.bottom, left: anchor?.left }]} style={[styles.popover, surfaceStyle, { transformOrigin: anchor?.left !== undefined ? 'left top' : 'right top' }]}>
            {body}
          </Entrance>
        ) : isDialog ? (
          <Entrance from="scale" exiting={motion.exit()} accessibilityViewIsModal accessibilityLabel={accessibilityLabel ?? title} containerStyle={[styles.dialogSlot, { maxWidth }]} style={[styles.dialog, surfaceStyle]}>
            {body}
          </Entrance>
        ) : (
          <Animated.View entering={motion.sheetIn()} exiting={motion.sheetOut()} accessibilityViewIsModal accessibilityLabel={accessibilityLabel ?? title} style={[styles.sheet, { maxHeight: sheetMaxHeight, backgroundColor: colors.surfaceRaised, paddingBottom: Math.max(insets.bottom, Spacing.md), boxShadow: shadows.overlay }]} testID={testID ? `${testID}-surface` : undefined}>
            {body}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rootCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  flex: {
    flex: 1,
  },
  container: {
    maxHeight: '100%',
    flexShrink: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
    paddingTop: Spacing.sm,
  },
  dialogSlot: {
    width: '100%',
    maxHeight: '86%',
  },
  dialog: {
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingTop: Spacing.sm,
    maxHeight: '100%',
  },
  popoverSlot: {
    position: 'absolute',
    width: 300,
    maxHeight: '80%',
  },
  popover: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingTop: Spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  headerPopover: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSmall: {
    width: 28,
    height: 28,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  body: {
    flexShrink: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.xxs,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
