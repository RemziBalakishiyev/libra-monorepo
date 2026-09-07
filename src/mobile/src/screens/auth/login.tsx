import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/form-field';
import { AppText } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useLogin } from '@/hooks/use-auth';
import { describeError } from '@/lib/api/errors';
import { loginSchema, type LoginForm } from '@/lib/validation/auth';
import { AuthFrame } from '@/screens/auth/auth-frame';
import { ServerErrorBanner } from '@/screens/auth/server-error-banner';

export function LoginScreen() {
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login.mutateAsync(values);
      // Navigation happens automatically: the session store flips to signedIn and the root guard switches groups.
    } catch (error) {
      setServerError(describeError(error, 'login'));
    }
  });

  const busy = formState.isSubmitting || login.isPending;

  return (
    <AuthFrame title="Xoş gəlmisiniz" subtitle="Davam etmək üçün hesabınıza daxil olun">
      <ServerErrorBanner message={serverError} />

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
            label="Şifrə"
            icon="lock-closed-outline"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={formState.errors.password?.message}
            secureToggle
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            onSubmitEditing={() => void submit()}
            returnKeyType="go"
          />
        )}
      />

      <Button title="Daxil ol" onPress={() => void submit()} loading={busy} />

      <View style={styles.footer}>
        <AppText color="textSecondary">Hesabınız yoxdur?</AppText>
        <Link href="/register" accessibilityRole="link">
          <AppText variant="bodyStrong" color="primary">
            Qeydiyyatdan keçin
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
