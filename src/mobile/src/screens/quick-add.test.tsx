import { fireEvent, render } from '@testing-library/react-native';

import { QuickAddScreen, quickActions } from '@/screens/quick-add';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

describe('QuickAddScreen', () => {
  beforeEach(() => mockReplace.mockReset());

  it('offers expense, income, and transfer and navigates to the matching form', async () => {
    const view = await render(<QuickAddScreen />);

    expect(quickActions.map((action) => action.title)).toEqual(['Xərc', 'Gəlir', 'Köçürmə']);

    await fireEvent.press(view.getByRole('button', { name: 'Xərc' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/finance/transactions/new?type=Expense');

    await fireEvent.press(view.getByRole('button', { name: 'Gəlir' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/finance/transactions/new?type=Income');

    await fireEvent.press(view.getByRole('button', { name: 'Köçürmə' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/finance/transfers/new');
  });
});
