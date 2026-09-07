import { PlaceholderScreen } from '@/screens/placeholder';

export default function PlanRoute() {
  return (
    <PlaceholderScreen
      title="Plan"
      icon="checkbox-outline"
      accent="modulePlan"
      description="Gündəlik tapşırıqlar və yuxu izləməsi növbəti mərhələlərdə əlavə olunacaq."
      upcoming={['Bu gün və gələcək tapşırıqlar', 'Yuxu başlanğıcı və oyanma', 'Xatırlatmalar']}
    />
  );
}
