import { PlaceholderScreen } from '@/screens/placeholder';

export default function AiRoute() {
  return (
    <PlaceholderScreen
      title="AI"
      icon="sparkles-outline"
      accent="moduleAi"
      description="Şəxsi məlumatlarınıza əsaslanan köməkçi sonrakı mərhələdə əlavə olunacaq."
      upcoming={['Həftəlik nəticələr', 'Məlumatlarınız üzrə söhbət', 'Təsdiqlə işləyən təkliflər']}
    />
  );
}
