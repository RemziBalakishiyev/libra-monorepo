import { fireEvent, render } from '@testing-library/react-native';

import { TabBar, type TabBarProps } from '@/components/tab-bar';

const routes = [
  { key: 'index-1', name: 'index' },
  { key: 'finance-1', name: 'finance' },
  { key: 'nutrition-1', name: 'nutrition' },
  { key: 'plan-1', name: 'plan' },
  { key: 'ai-1', name: 'ai' },
];

describe('TabBar', () => {
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: false }));

  beforeEach(() => {
    navigate.mockReset();
  });

  function renderBar(index: number) {
    const props = { state: { index, routes }, navigation: { navigate, emit } } as unknown as TabBarProps;
    return render(<TabBar {...props} />);
  }

  it('renders the five destinations and navigates on press', async () => {
    const view = await renderBar(0);

    expect(view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Ana səhifə', 'Maliyyə', 'Qidalanma', 'Plan', 'AI']);
    expect(view.getByRole('tab', { name: 'Ana səhifə' }).props.accessibilityState.selected).toBe(true);

    await fireEvent.press(view.getByRole('tab', { name: 'Maliyyə' }));
    expect(navigate).toHaveBeenCalledWith('finance');
  });

  it('owns its region in the layout and carries no floating action', async () => {
    const view = await renderBar(1);

    expect(view.queryByRole('button', { name: 'Tez əlavə et' })).toBeNull();
    const region = view.getByTestId('tab-bar-region');
    const flattened = Object.assign({}, ...[region.props.style].flat(Infinity).filter(Boolean)) as { position?: string; backgroundColor?: string };
    expect(flattened.position).toBeUndefined();
    expect(flattened.backgroundColor).toBeTruthy();
  });
});
