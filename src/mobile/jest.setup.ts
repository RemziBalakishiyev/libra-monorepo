// Reanimated needs its Jest helpers installed before any animated component renders.
require('react-native-reanimated').setUpTests();
// Gesture Handler (swipeable rows) needs its Jest mocks.
require('react-native-gesture-handler/jestSetup');
// Safe-area insets are read by every Screen; the library's mock provides a provider-free default frame.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
