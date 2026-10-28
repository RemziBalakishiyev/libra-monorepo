import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ConfirmProvider } from '@/components/confirm-dialog';
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
