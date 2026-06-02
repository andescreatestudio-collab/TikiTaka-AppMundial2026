import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword]               = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);
  const router = useRouter();

  // ── Modal recuperación de contraseña (funciona en web y nativo) ──────
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail]         = useState('');
  const [recoveryLoading, setRecoveryLoading]     = useState(false);
  const [recoveryMsg, setRecoveryMsg]             = useState<string | null>(null);
  const [recoveryError, setRecoveryError]         = useState<string | null>(null);

  // ── Login ────────────────────────────────────────────────────────────
  async function signInWithEmail() {
    console.log('BOTON PRESIONADO');
    setLoading(true);
    setErrorMsg(null);

    let resolvedEmail = emailOrUsername.trim();

    if (!resolvedEmail) {
      setErrorMsg('El email o usuario es obligatorio.');
      setLoading(false);
      return;
    }

    if (!resolvedEmail.includes('@')) {
      console.log(`Buscando email para el usuario: ${resolvedEmail}`);
      const { data: emailResult, error } = await supabase
        .rpc('get_email_by_username', { p_username: resolvedEmail });

      if (error) {
        console.error('Error querying username RPC:', error);
        setErrorMsg('Error al buscar el usuario.');
        setLoading(false);
        return;
      }
      if (!emailResult) {
        setErrorMsg('El usuario especificado no existe.');
        setLoading(false);
        return;
      }
      resolvedEmail = emailResult;
      console.log(`Email resuelto: ${resolvedEmail}`);
    }

    const result = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });
    console.log('Resultado completo login:', result);
    const { error } = result;

    if (error) {
      console.log('ERROR COMPLETO:', JSON.stringify(error));
      setErrorMsg(error.message);
    } else if (result.data?.session) {
      router.replace('/(tabs)');
    }
    setLoading(false);
  }

  // ── Recuperación de contraseña ───────────────────────────────────────
  function openRecoveryModal() {
    console.log('Forgot password pressed');
    const pre = emailOrUsername.trim();
    setRecoveryEmail(pre.includes('@') ? pre : '');
    setRecoveryError(null);
    setRecoveryMsg(null);
    setShowRecoveryModal(true);
  }

  function closeRecoveryModal() {
    setShowRecoveryModal(false);
    setRecoveryEmail('');
    setRecoveryError(null);
    setRecoveryMsg(null);
  }

  async function sendRecoveryEmail() {
    const email = recoveryEmail.trim();
    if (!email || !email.includes('@')) {
      setRecoveryError('Introduce un correo electrónico válido (debe contener @).');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoveryMsg(null);

    try {
      // En web usamos la URL de localhost; en nativo el deep link del scheme
      const redirectTo = Platform.OS === 'web'
        ? `${window.location.origin}/reset-password`
        : 'tikitaka://reset-password';

      console.log('Enviando correo de recuperación con redirectTo:', redirectTo);

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error) {
        console.error('Error enviando correo de recuperación:', error);
        setRecoveryError(error.message);
      } else {
        setRecoveryMsg(`Correo enviado a ${email}. Revisa tu bandeja de entrada y haz clic en el enlace.`);
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setRecoveryLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Modal recuperación de contraseña */}
      <Modal
        visible={showRecoveryModal}
        transparent
        animationType="fade"
        onRequestClose={closeRecoveryModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeRecoveryModal}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Recuperar contraseña</Text>
            <Text style={styles.modalDesc}>
              Introduce tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </Text>

            <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor="#b9ccb2"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />

            {recoveryError && <Text style={styles.recoveryError}>{recoveryError}</Text>}
            {recoveryMsg   && <Text style={styles.recoverySuccess}>{recoveryMsg}</Text>}

            {!recoveryMsg ? (
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  { opacity: (pressed || recoveryLoading) ? 0.7 : 1 },
                ]}
                onPress={sendRecoveryEmail}
                disabled={recoveryLoading}
              >
                {recoveryLoading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.modalButtonText}>ENVIAR ENLACE</Text>
                }
              </Pressable>
            ) : (
              <Pressable
                style={[styles.modalButton, { backgroundColor: '#3b4b37' }]}
                onPress={closeRecoveryModal}
              >
                <Text style={[styles.modalButtonText, { color: '#00FF41' }]}>CERRAR</Text>
              </Pressable>
            )}

            <TouchableOpacity style={styles.modalCancel} onPress={closeRecoveryModal}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pantalla de Login */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>TIKI-TAKA</Text>
          <Text style={styles.subtitle}>Inicia sesión para jugar</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL O USUARIO</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com o usuario"
              placeholderTextColor="#b9ccb2"
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              autoCapitalize="none"
              keyboardType="default"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>CONTRASEÑA</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.input}
                placeholder="********"
                placeholderTextColor="#b9ccb2"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(v => !v)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={22}
                  color="#00FF41"
                />
              </TouchableOpacity>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { opacity: (pressed || loading) ? 0.7 : 1 },
            ]}
            onPress={signInWithEmail}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
            }
          </Pressable>

          {/* ¿Olvidaste tu contraseña? — Pressable con onClick fallback para web */}
          <Pressable
            id="btn-forgot-password"
            style={({ pressed }) => [
              styles.forgotPasswordButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={openRecoveryModal}
            {...(Platform.OS === 'web' ? { onClick: openRecoveryModal } : {})}
          >
            <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <TouchableOpacity
            onPress={() => router.push('/register')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              ¿No tienes cuenta? <Text style={styles.linkText}>Regístrate</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131313',
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
  },
  subtitle: {
    fontSize: 16,
    color: '#b9ccb2',
    textAlign: 'center',
    marginBottom: 40,
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
  input: {
    backgroundColor: '#201f1f',
    color: '#e5e2e1',
    paddingLeft: 16,
    paddingRight: 48,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3b4b37',
    width: '100%',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  button: {
    backgroundColor: '#00FF41',
    paddingVertical: 14,
    borderRadius: 4,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  forgotPasswordButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,   // área táctil más grande
  },
  forgotPasswordText: {
    color: '#00FF41',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#b9ccb2',
    fontSize: 14,
  },
  linkText: {
    color: '#00FF41',
    fontWeight: '700',
  },
  errorText: {
    color: '#ff4d4d',
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
  },
  // ── Modal styles ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: '#b9ccb2',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#00FF41',
    paddingVertical: 13,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 12,
  },
  modalButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },
  modalCancel: {
    marginTop: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#b9ccb2',
    fontSize: 14,
  },
  recoveryError: {
    color: '#ff4d4d',
    fontSize: 13,
    marginTop: 8,
  },
  recoverySuccess: {
    color: '#00FF41',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
});
