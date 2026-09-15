/**
 * Web accessibility helpers for the shared controls.
 *
 * Two facts about the installed stack drive everything here:
 *
 * 1. **react-native-web 0.21 does not support `accessibilityState`.** Its forwarded-prop list
 *    (`modules/forwardedProps`) and `createDOMProps` accept only the individual `aria-*` attributes (plus the
 *    deprecated singular `accessibilityChecked` / `accessibilitySelected` forms). A component that describes its
 *    selection with `accessibilityState={{ checked }}` therefore renders no state at all on the web. React Native
 *    itself merges `aria-checked` / `aria-selected` / `aria-disabled` back into `accessibilityState`
 *    (`Pressable.js`, `View.js`), so passing the `aria-*` prop is the one form that is correct on both platforms.
 * 2. **react-native-web only activates non-button roles with Enter.** `PressResponder.isValidKeyPress` accepts
 *    Space exclusively for `<button>` elements and `role="button"`, so a `radio` or `checkbox` built on
 *    `Pressable` never responds to the key its ARIA pattern requires. `useRovingRadioGroup` and
 *    `useSpaceActivate` add that key back.
 *
 * The keyboard helpers attach real DOM listeners on web and do nothing on native, where the platform already
 * implements the corresponding gestures.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { Platform, type View } from 'react-native';

/** Attributes react-native-web understands but React Native's prop types do not declare. */
export interface WebAriaProps {
  'aria-current'?: 'page' | 'date' | 'step' | 'location' | 'time' | true;
  'aria-orientation'?: 'horizontal' | 'vertical';
  'aria-multiselectable'?: boolean;
}

/**
 * Applies web-only ARIA attributes. On native it returns nothing, so `accessibilityRole` and the state the
 * platform understands stay the single source of truth there.
 */
export function webAria(props: WebAriaProps): object {
  return Platform.OS === 'web' ? props : {};
}

/** The DOM node behind a React Native view ref, or null on native. */
function domNode(ref: RefObject<View | null>): HTMLElement | null {
  if (Platform.OS !== 'web') {
    return null;
  }
  return (ref.current as unknown as HTMLElement | null) ?? null;
}

function isEnabled(element: HTMLElement): boolean {
  return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
}

interface RovingOptions {
  /**
   * Called with the index the keyboard moved to, in DOM order among enabled items. Inline groups commit here;
   * dialog pickers move their pending selection instead, so the checked radio follows focus without the owning
   * field changing.
   */
  onSelect: (index: number) => void;
  /**
   * Space (and, where the component needs it, the commit step) on the focused item. Defaults to `onSelect`;
   * a control that closes on activation — the calendar — passes the closing variant so Space matches Enter.
   */
  onActivate?: (index: number) => void;
  /** `grid` uses `columns` for the vertical step (calendar); linear groups wrap around. */
  columns?: number;
  /** Skip wiring while the group is not interactive (e.g. a closed sheet). */
  enabled?: boolean;
}

/**
 * Keyboard behaviour of the WAI-ARIA radio group pattern for a container of `role="radio"` items:
 *
 * Inline groups commit straight from `onSelect`. Dialog pickers pass a pending setter instead and commit in
 * `onActivate`, so the checked radio follows focus inside the dialog while the owning field waits for Space,
 * Enter or a tap; those dialogs mount their body only while open, which resets the pending value on reopen.
 *
 * arrows move focus and the selection with it, Home/End jump to the ends, and Space checks the focused item.
 * Disabled items are skipped. Tab entry and exit are left to the roving `tabIndex` the component sets, so the
 * whole group is a single tab stop.
 *
 * @see https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 */
export function useRovingRadioGroup(containerRef: RefObject<View | null>, { onSelect, onActivate, columns = 0, enabled = true }: RovingOptions): void {
  // The listener reads the latest callbacks through a ref, so callers do not have to memoize them and the
  // listener is attached once per open group instead of on every keystroke.
  const handlers = useRef({ onSelect, onActivate });
  useEffect(() => {
    handlers.current = { onSelect, onActivate };
  });

  useEffect(() => {
    const node = domNode(containerRef);
    if (!node || !enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const items = [...node.querySelectorAll<HTMLElement>('[role="radio"]')].filter(isEnabled);
      if (items.length === 0) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const current = active ? items.indexOf(active) : -1;
      const grid = columns > 0;
      let next = current;
      let activate = false;

      switch (event.key) {
        case 'ArrowRight':
          next = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case 'ArrowLeft':
          next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
          break;
        case 'ArrowDown':
          next = grid ? Math.min(items.length - 1, (current < 0 ? 0 : current) + columns) : current < 0 ? 0 : (current + 1) % items.length;
          break;
        case 'ArrowUp':
          next = grid ? Math.max(0, (current < 0 ? 0 : current) - columns) : current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
          break;
        case 'Home':
          next = grid && current >= 0 ? current - (current % columns) : 0;
          break;
        case 'End':
          next = grid && current >= 0 ? Math.min(items.length - 1, current - (current % columns) + columns - 1) : items.length - 1;
          break;
        case ' ':
        case 'Spacebar':
          // react-native-web only activates buttons with Space; a radio needs it too.
          next = current;
          activate = true;
          break;
        default:
          return;
      }

      if (next < 0 || next >= items.length) {
        return;
      }
      event.preventDefault();
      items[next]!.focus();
      const { onSelect: select, onActivate: activateHandler } = handlers.current;
      if (activate) {
        (activateHandler ?? select)(next);
      } else {
        select(next);
      }
    };

    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, columns, enabled]);
}

/**
 * Space activation for a single checkable control (`role="checkbox"` or `switch`). Enter already works through
 * react-native-web; Space does not, because the element is not a button.
 *
 * @see https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
 */
export function useSpaceActivate(ref: RefObject<View | null>, onActivate: () => void, enabled = true): void {
  const handler = useRef(onActivate);
  useEffect(() => {
    handler.current = onActivate;
  });

  useEffect(() => {
    const node = domNode(ref);
    if (!node || !enabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        handler.current();
      }
    };
    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [ref, enabled]);
}
