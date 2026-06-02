/**
 * app/reset-password.tsx — TikiTaka WC2026
 *
 * Flujo web:
 *  1. Usuario hace clic en el link del correo → Supabase redirige a
 *     http://localhost:8081/reset-password#access_token=...
 *  2. Supabase (detectSessionInUrl=true) procesa el hash → emite PASSWORD_RECOVERY.
 *  3. _layout.tsx detecta PASSWORD_RECOVERY → router.replace('/reset-password').
 *  4. Esta pantalla detecta la sesión y habilita el formulario.
 *
 * Flujo nativo: igual pero via deep link mobile://reset-password.
 *
 * BUG FIX: sessionReady se maneja con useRef + un único setState para evitar
 * re-renders excesivos que hacían que el TextInput perdiera el foco en cada letra.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();

  // Inputs controlados — estados locales independientes, sin lógica auth
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);

  // sessionReady como ref para evitar re-renders del árbol completo cuando
  // llega el evento de Supabase. Solo usamos un estado booleano simple para
  // controlar la UI de "esperando sesión".
  const sessionReadyRef = useRef(false);
  const [formEnabled, setFormEnabled] = useState(false);

  useEffect(() => {
    // Verificar sesión ya activa al montar (cuando _layout navega aquí
    // después de detectar PASSWORD_RECOVERY, la sesión puede ya estar lista)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !sessionReadyRef.current) {
        console.log('[reset-password] Sesión activa al montar →', session.user?.email);
        sessionReadyRef.current = true;
        setFormEnabled(true);
      }
    });

    // Escuchar eventos posteriores (por si el token llega después del mount)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[reset-password] auth event:', event, '| session:', !!session);

      if (!sessionReadyRef.current && session &&
          (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        sessionReadyRef.current = true;
        setFormEnabled(true);   // único setState de auth → un solo re-render
      }

      // Post-cambio: signOut activa SIGNED_OUT → redirigir al login
      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // sin dependencias → el efecto se ejecuta UNA sola vez al montar

  // ── Validación ────────────────────────────────────────────────────────
  const validate = () => {
    if (!newPassword || !confirmPassword) {
      setErrorMsg('Ambos campos son obligatorios.');
      return false;
    }
    if (newPassword.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  };

  // ── Cambio de contraseña ──────────────────────────────────────────────
  const handleChangePassword = async () => {
    setErrorMsg(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        console.error('[reset-password] updateUser error:', error);
        setErrorMsg(error.message);
      } else {
        // Cerrar sesión temporal → SIGNED_OUT → el listener navega al login
        await supabase.auth.signOut();
        // El Alert no funciona en web; usamos errorMsg como éxito visual
        // La navegación la maneja el listener de SIGNED_OUT arriba
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  // ── Pantalla de espera ────────────────────────────────────────────────
  if (!formEnabled) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
        <Text style={styles.waitText}>Verificando enlace de recuperación…</Text>
        <TouchableOpacity style={styles.cancelLink} onPress={() => router.replace('/login')}>
          <Ionicons name="arrow-back" size={16} color="#00FF41" />
          <Text style={styles.cancelLinkText}>Cancelar y volver al login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Formulario ────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>TIKI-TAKA</Text>
        <Text style={styles.subtitle}>Restablecer contraseña</Text>
        <Text style={styles.description}>
          Escribe tu nueva contraseña. Debe tener al menos 6 caracteres.
        </Text>

        {/* Nueva contraseña */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>NUEVA CONTRASEÑA</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#b9ccb2"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.eyeIcon} onPress={() => setShowNew(v => !v)}>
              <Ionicons name={showNew ? 'eye-off' : 'eye'} size={22} color="#00FF41" />
            </Pressable>
          </View>
        </View>

        {/* Confirmar contraseña */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>CONFIRMAR CONTRASEÑA</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#b9ccb2"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.eyeIcon} onPress={() => setShowConfirm(v => !v)}>
              <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={22} color="#00FF41" />
            </Pressable>
          </View>
        </View>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* Botón */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { opacity: (pressed || loading) ? 0.7 : 1 },
          ]}
          onPress={handleChangePassword}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.buttonText}>CAMBIAR CONTRASEÑA</Text>
          }
        </Pressable>

        {/* Volver */}
        <TouchableOpacity style={styles.cancelLink} onPress={() => router.replace('/login')}>
          <Ionicons name="arrow-back" size={16} color="#00FF41" />
          <Text style={styles.cancelLinkText}>Volver al inicio de sesión</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131313',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  waitText: {
    color: '#b9ccb2',
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
  },
  inner: {
    padding: 24,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#00FF41',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#b9ccb2',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    color: '#00FF41',
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  input: {
    flex: 1,
    backgroundColor: '#201f1f',
    color: '#e5e2e1',
    paddingLeft: 16,
    paddingRight: 48,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  errorText: {
    color: '#ff4d4d',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#00FF41',
    paddingVertical: 14,
    borderRadius: 4,
    marginTop: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cancelLink: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cancelLinkText: {
    color: '#00FF41',
    fontSize: 14,
    fontWeight: '600',
  },
});
