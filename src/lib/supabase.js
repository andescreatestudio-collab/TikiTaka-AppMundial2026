import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = 'https://ruwnxeyrfvuyzddmygkd.supabase.co';
const supabaseAnonKey = 'sb_publishable_E3kRj91eyhd4mxtnQKAeCQ_GHqg4kRw';

const storage = Platform.OS === 'web' ? {
  getItem: (key) => typeof window !== 'undefined' ? window.localStorage.getItem(key) : null,
  setItem: (key, value) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
  removeItem: (key) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
} : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const initSupabase = async () => {};
export const switchEnvironment = async () => {};
export let IS_DEV = false;
