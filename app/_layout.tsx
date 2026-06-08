import 'react-native-url-polyfill/auto';
import { useEffect, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as Linking from 'expo-linking';
import { supabase, initSupabase } from '../src/lib/supabase';
import { Session } from '@supabase/supabase-js';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [envInitialized, setEnvInitialized] = useState(false);
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const isPasswordRecovery = useRef(false);

  useEffect(() => {
    initSupabase().then(() => {
      setEnvInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (!envInitialized) return;

    // ── Manejo de deep links (fix para APK nativo) ──────────────────
    const handleDeepLink = (url: string) => {
      if (url.includes('reset-password')) {
        const hash = url.split('#')[1];
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }).then(({ error }) => {
            if (!error) {
              isPasswordRecovery.current = true;
              router.replace('/reset-password');
            }
          });
        }
      }
    };

    // App cerrada → abre por deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // App abierta → llega deep link
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // ── Auth state change ───────────────────────────────────────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('AUTH STATE CHANGE:', event);
      setSession(session);

      if (event === 'PASSWORD_RECOVERY') {
        console.log('PASSWORD_RECOVERY detectado -> navegando a /reset-password');
        isPasswordRecovery.current = true;
        router.replace('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, [envInitialized]);

  useEffect(() => {
    console.log('NAVEGACIÓN - Sesión:', !!session, 'Iniciado:', initialized, 'Pathname:', pathname);
    if (!initialized || !envInitialized) return;

    const isAuthPage = pathname.includes('login') || pathname.includes('register');
    const isResetPage = pathname.includes('reset-password');

    if (isPasswordRecovery.current) {
      if (isResetPage) {
        isPasswordRecovery.current = false;
      }
      return;
    }

    if (!session && !isAuthPage && !isResetPage) {
      router.replace('/login');
    } else if (session && isAuthPage) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, envInitialized, pathname]);

  if (!envInitialized) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="groups/selection"
          options={{
            presentation: 'modal',
            headerShown: false
          }}
        />
        <Stack.Screen name="groups/create" options={{ title: 'Crear Grupo' }} />
        <Stack.Screen name="groups/join" options={{ title: 'Unirse al Grupo' }} />
        <Stack.Screen
          name="simulation-panel"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="champion"
          options={{
            presentation: 'modal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="invite"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="reset-password"
          options={{ headerShown: false }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}