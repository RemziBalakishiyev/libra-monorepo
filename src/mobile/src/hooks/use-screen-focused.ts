import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Whether the screen that calls it is the one in view. Decorative motion (the Home hero's drift) runs only
 * while this is true, so nothing animates behind another tab or a pushed screen.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
