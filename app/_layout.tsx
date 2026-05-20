import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
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

  useEffect(() => {
    initSupabase().then(() => {
      setEnvInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (!envInitialized) return;

    // Escuchar cambios en la sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('AUTH STATE CHANGE:', event);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [envInitialized]);

  useEffect(() => {
    console.log('NAVEGACIÓN - Sesión:', !!session, 'Iniciado:', initialized, 'Pathname:', pathname);
    if (!initialized || !envInitialized) return;

    const isAuthPage = pathname.includes('login') || pathname.includes('register');

    if (!session && !isAuthPage) {
      // No hay sesión y no estamos en login/register -> Forzar Login
      router.replace('/login');
    } else if (session && isAuthPage) {
      // Hay sesión y estamos en login/register -> Ir a la App
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
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
