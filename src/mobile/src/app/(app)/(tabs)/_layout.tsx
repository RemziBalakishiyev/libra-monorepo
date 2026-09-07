import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { tabs } from '@/constants/tabs';
import { useTheme } from '@/hooks/use-theme';

/** The five stable destinations. Phones and tablets get the floating tab bar; desktop uses the sidebar. */
export default function TabsLayout() {
  const { layout, colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => (layout === 'wide' ? null : <TabBar {...props} />)}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas }, animation: 'none' }}>
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
