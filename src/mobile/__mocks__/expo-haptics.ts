/** Jest stand-in for expo-haptics: no native feedback in tests. */
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' } as const;
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' } as const;
export async function notificationAsync(): Promise<void> {}
export async function impactAsync(): Promise<void> {}
export async function selectionAsync(): Promise<void> {}
