import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ConfirmProvider } from '@/components/confirm-dialog';
import { CalendarSheet } from '@/components/date-field';
import { confirmAsync } from '@/lib/confirm';

describe('ConfirmProvider + confirmAsync', () => {
  it('resolves true when the destructive action is accepted and false when cancelled', async () => {
    const view = await render(
      <ConfirmProvider>
        <Text>app</Text>
      </ConfirmProvider>,
    );

    let result: Promise<boolean> | undefined;
    await act(async () => {
      result = confirmAsync('Əməliyyatı sil', 'Bu əməliyyat silinsin?');
    });
    expect(await view.findByText('Bu əməliyyat silinsin?')).toBeTruthy();
    await fireEvent.press(view.getByTestId('confirm-accept'));
    await expect(result).resolves.toBe(true);

    await act(async () => {
      result = confirmAsync('Köçürməni sil', 'Silinsin?');
    });
    await view.findByText('Silinsin?');
    await fireEvent.press(view.getByRole('button', { name: 'Ləğv et' }));
    await expect(result).resolves.toBe(false);
  });
});

describe('CalendarSheet', () => {
  it('lists every day of the month as a labelled button and selects one', async () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    const view = await render(<CalendarSheet visible value="2026-09-06" onClose={onClose} onChange={onChange} title="Tarix" />);

    expect(view.getByText('Sentyabr 2026')).toBeTruthy();
    expect(view.getByRole('button', { name: '30 sentyabr 2026' })).toBeTruthy();
    expect(view.getByRole('button', { name: '6 sentyabr 2026' }).props.accessibilityState.selected).toBe(true);

    await fireEvent.press(view.getByRole('button', { name: '12 sentyabr 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-09-12');
    expect(onClose).toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Növbəti ay' }));
    expect(view.getByText('Oktyabr 2026')).toBeTruthy();
  });
});
