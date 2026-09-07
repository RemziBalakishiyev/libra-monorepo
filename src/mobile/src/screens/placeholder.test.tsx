import { render } from '@testing-library/react-native';

import { PlaceholderScreen } from '@/screens/placeholder';

describe('PlaceholderScreen', () => {
  it('shows the coming-soon message and offers no actions or data', async () => {
    const view = await render(<PlaceholderScreen title="Qidalanma" icon="nutrition-outline" description="Növbəti mərhələdə." />);

    expect(view.getByRole('header', { name: 'Qidalanma' })).toBeTruthy();
    expect(view.getByText('Tezliklə')).toBeTruthy();
    expect(view.getByText('Növbəti mərhələdə.')).toBeTruthy();
    expect(view.queryAllByRole('button')).toHaveLength(0);
    expect(view.queryAllByRole('link')).toHaveLength(0);
    expect(view.queryByText(/AZN|USD|\d+[,.]\d{2}/)).toBeNull();
  });
});
