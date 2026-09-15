import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuickAction, quickActionDefinitions, type QuickActionDefinition, type QuickActionKind } from '@/components/quick-action';
import { Sheet } from '@/components/sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type QuickAddOrigin = 'top-right' | 'sidebar';

type QuickAddMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: QuickActionKind) => void;
  /** Which trigger opened it; wide layouts anchor a popover next to that trigger. */
  origin?: QuickAddOrigin;
  title?: string;
  /** Which actions to offer. Finance passes its own three; Home passes the global set. */
  actions?: readonly QuickActionDefinition[];
};

/**
 * Quick Add: a bottom sheet on phones and an anchored popover on tablet / desktop. Both come from `Sheet`, so
 * dismissal, Escape, focus containment and focus restoration behave the same as every other overlay.
 */
export function QuickAddMenu({ visible, onClose, onSelect, origin = 'top-right', title = 'Tez əlavə et', actions = quickActionDefinitions }: QuickAddMenuProps) {
  const { pagePadding } = useTheme();
  const insets = useSafeAreaInsets();
  const anchor = origin === 'sidebar' ? { top: insets.top + 96, left: Spacing.lg } : { top: insets.top + 72, right: pagePadding };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} presentation="popover" anchor={anchor} accessibilityLabel={title} scrollable={false} maxWidth={300}>
      {actions.map((action) => (
        <QuickAction key={action.kind} action={action} layout="row" onPress={onSelect} />
      ))}
    </Sheet>
  );
}
