import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { QuickAddMenu } from '@/components/quick-add-menu';
import { Sheet } from '@/components/sheet';

describe('Sheet', () => {
  it('announces its title, closes from the close control and from the scrim', async () => {
    const onClose = jest.fn();
    const view = await render(
      <Sheet visible onClose={onClose} title="Hesab">
        <Text>Nağd</Text>
      </Sheet>,
    );

    expect(view.getByRole('header', { name: 'Hesab' })).toBeTruthy();
    expect(view.getByLabelText('Hesab').props.accessibilityViewIsModal).toBe(true);

    const closers = view.getAllByRole('button', { name: 'Bağla' });
    expect(closers).toHaveLength(2);
    await fireEvent.press(closers[0]!);
    await fireEvent.press(closers[1]!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while hidden', async () => {
    const view = await render(
      <Sheet visible={false} onClose={jest.fn()} title="Gizli">
        <Text>məzmun</Text>
      </Sheet>,
    );
    expect(view.queryByText('məzmun')).toBeNull();
  });
});

describe('QuickAddMenu', () => {
  it('lists the three actions as a sheet and reports the chosen one', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const view = await render(<QuickAddMenu visible onClose={onClose} onSelect={onSelect} />);

    expect(view.getByRole('header', { name: 'Tez əlavə et' })).toBeTruthy();
    expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual(expect.arrayContaining(['Xərc', 'Gəlir', 'Köçürmə']));

    await fireEvent.press(view.getByRole('button', { name: 'Köçürmə' }));
    expect(onSelect).toHaveBeenCalledWith('transfer');
  });
});
