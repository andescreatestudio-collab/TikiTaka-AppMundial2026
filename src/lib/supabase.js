import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG = {
  dev: {
    url: 'https://lyynaebnexpnetizymca.supabase.co',
    anonKey: 'sb_publishable_W8yt5cMAkxtrmwLCqdDxmw_neLwKDXx' 
  },
  prod: {
    url: 'https://ruwnxeyrfvuyzddmygkd.supabase.co',
    anonKey: 'sb_publishable_E3kRj91eyhd4mxtnQKAeCQ_GHqg4kRw'
  }
};

// Intentar cargar la preferencia síncronamente (no es posible con AsyncStorage)
// Así que usaremos un valor inicial y luego lo actualizaremos si es necesario.
// Pero para la mayoría de los casos, el cliente se importa y usa inmediatamente.
// Lo mejor es tener una variable global que el usuario pueda cambiar y que reinicie la app.

export let IS_DEV = false; // Valor por defecto

const ExpoSecureStoreAdapter = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};

// Función para inicializar el cliente
const createSupabaseClient = (isDevMode) => {
  const config = isDevMode ? CONFIG.dev : CONFIG.prod;
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};

// Exportamos el cliente inicial (se actualizará en el punto de entrada de la app si es necesario)
export let supabase = createSupabaseClient(false);

// Función para cambiar de ambiente y persistir
export const switchEnvironment = async (isDev) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('APP_ENV', isDev ? 'dev' : 'prod');
    }
  } else {
    await AsyncStorage.setItem('APP_ENV', isDev ? 'dev' : 'prod');
  }
  IS_DEV = isDev;
  supabase = createSupabaseClient(isDev);
};

// Función para inicializar la preferencia de ambiente asíncronamente (evita error en nivel raíz)
export const initSupabase = async () => {
  try {
    let val = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        val = window.localStorage.getItem('APP_ENV');
      }
    } else {
      val = await AsyncStorage.getItem('APP_ENV');
    }

    if (val === 'dev') {
      IS_DEV = true;
      supabase = createSupabaseClient(true);
      console.log('🚀 Supabase inicializado en modo DESARROLLO');
    } else {
      IS_DEV = false;
      supabase = createSupabaseClient(false);
      console.log('✅ Supabase inicializado en modo PRODUCCIÓN');
    }
  } catch (error) {
    console.error('Error al inicializar el ambiente de Supabase:', error);
  }
};

