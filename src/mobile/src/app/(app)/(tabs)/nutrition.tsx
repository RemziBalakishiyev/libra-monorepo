import { PlaceholderScreen } from '@/screens/placeholder';

export default function NutritionRoute() {
  return (
    <PlaceholderScreen
      title="Qidalanma"
      icon="nutrition-outline"
      accent="moduleNutrition"
      description="Yeməklər, kalori və makro izləməsi növbəti mərhələdə əlavə olunacaq."
      upcoming={['Yemək və makro qeydləri', 'Foto ilə AI təxmini (təsdiqlə)', 'Gündəlik kalori hədəfi']}
    />
  );
}
