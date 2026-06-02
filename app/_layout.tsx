import 'react-native-url-polyfill/auto';
import { useEffect, useRef, useState } from 'react';
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
  // Ref que indica que estamos en modo PASSWORD_RECOVERY.
  // Usamos ref (no state) para NO provocar re-renders adicionales en el guard.
  const isPasswordRecovery = useRef(false);

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

      // Cuando Supabase detecta el token del correo de recuperación,
      // marcar el flag ANTES de navegar para que el guard no interfiera.
      if (event === 'PASSWORD_RECOVERY') {
        console.log('PASSWORD_RECOVERY detectado -> navegando a /reset-password');
        isPasswordRecovery.current = true;   // bloquea el guard
        router.replace('/reset-password');
      }
    });

    return () => subscription.unsubscribe();
  }, [envInitialized]);

  useEffect(() => {
    console.log('NAVEGACIÓN - Sesión:', !!session, 'Iniciado:', initialized, 'Pathname:', pathname);
    if (!initialized || !envInitialized) return;

    const isAuthPage  = pathname.includes('login') || pathname.includes('register');
    const isResetPage = pathname.includes('reset-password');

    // Si estamos en modo recuperación, limpiar el flag cuando ya estemos en la pantalla
    // correcta y NO redirigir al dashboard aunque haya sesión.
    if (isPasswordRecovery.current) {
      if (isResetPage) {
        isPasswordRecovery.current = false; // ya llegamos, limpiar
      }
      return; // nunca redirigir durante el flujo de recuperación
    }

    if (!session && !isAuthPage && !isResetPage) {
      // Sin sesión fuera de páginas públicas -> Forzar Login
      router.replace('/login');
    } else if (session && isAuthPage) {
      // Sesión activa en login/register -> Ir a la App
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
        <Stack.Screen name="groups/join"   options={{ title: 'Unirse al Grupo' }} />
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
