import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/form-field';
import { AppText } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useRegister } from '@/hooks/use-auth';
import { describeError } from '@/lib/api/errors';
import { registerSchema, type RegisterForm } from '@/lib/validation/auth';
import { AuthFrame } from '@/screens/auth/auth-frame';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

export function RegisterScreen() {
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await register.mutateAsync({
        email: values.email,
        password: values.password,
        displayName: values.displayName || undefined,
      });
    } catch (error) {
      setServerError(describeError(error, 'register'));
    }
  });

  const busy = formState.isSubmitting || register.isPending;

  return (
    <AuthFrame title="Qeydiyyat" subtitle="Bir dəqiqəyə şəxsi Libra hesabınızı yaradın">
      <ServerErrorBanner message={serverError} />

      <Controller
        control={control}
        name="displayName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Ad (istəyə bağlı)" icon="person-outline" value={value} onChangeText={onChange} onBlur={onBlur} error={formState.errors.displayName?.message} autoComplete="name" textContentType="name" editable={!busy} />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="E-poçt"
            icon="mail-outline"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={formState.errors.email?.message}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
            placeholder="ad@nümunə.az"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Şifrə (ən azı 8 simvol)"
            icon="lock-closed-outline"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={formState.errors.password?.message}
            secureToggle
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
            onSubmitEditing={() => void submit()}
            returnKeyType="go"
          />
        )}
      />

      <Button title="Hesab yarat" onPress={() => void submit()} loading={busy} />

      <View style={styles.footer}>
        <AppText color="textSecondary">Artıq hesabınız var?</AppText>
        <Link href="/login" accessibilityRole="link">
          <AppText variant="bodyStrong" color="primary">
            Daxil olun
          </AppText>
        </Link>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
  },
});
