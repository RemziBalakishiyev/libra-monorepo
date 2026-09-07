import { View } from 'react-native';

/** Jest stand-in for the native date picker: renders nothing interactive. */
export default function DateTimePicker() {
  return <View testID="mock-datetimepicker" />;
}

export const DateTimePickerAndroid = {
  open: jest.fn(),
  dismiss: jest.fn(),
};

export type DateTimePickerEvent = { type: 'set' | 'dismissed'; nativeEvent: { timestamp?: number } };
