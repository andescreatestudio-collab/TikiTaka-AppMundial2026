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
} from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  async function signInWithEmail() {
    console.log('BOTON PRESIONADO');
    setLoading(true);
    setErrorMsg(null);
    console.log('Intentando login...');
    const result = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    console.log('Resultado completo login:', result);
    const { error } = result;

    if (error) {
      console.log('ERROR COMPLETO:', JSON.stringify(error));
      setErrorMsg(error.message);
      Alert.alert('Error', error.message);
    } else if (result.data?.session) {
      router.replace('/(tabs)');
    }
    setLoading(false);
  }

  async function resetPassword(emailToReset: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset);
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Éxito',
          'Te enviamos un correo para recuperar tu contraseña'
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Ocurrió un error al enviar el correo.');
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    if (!email) {
      if (Platform.OS === 'ios') {
        Alert.prompt(
          'Recuperar contraseña',
          'Introduce tu correo electrónico para enviarte un enlace de recuperación:',
          [
            {
              text: 'Cancelar',
              style: 'cancel',
            },
            {
              text: 'Enviar',
              onPress: (emailInput) => {
                if (emailInput && emailInput.trim()) {
                  resetPassword(emailInput.trim());
                } else {
                  Alert.alert('Error', 'El correo electrónico es obligatorio.');
                }
              },
            },
          ],
          'plain-text'
        );
      } else {
        Alert.alert(
          'Recuperar contraseña',
          'Por favor, escribe tu correo en el campo de EMAIL arriba y luego presiona de nuevo "¿Olvidaste tu contraseña?".'
        );
      }
    } else {
      Alert.alert(
        'Recuperar contraseña',
        `¿Deseas enviar un correo de recuperación a ${email}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Enviar', onPress: () => resetPassword(email) }
        ]
      );
    }
  }


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>TIKI-TAKA</Text>
        <Text style={styles.subtitle}>Inicia sesión para jugar</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor="#b9ccb2"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
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
              onPress={() => setShowPassword(!showPassword)}
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
            { opacity: (pressed || loading) ? 0.7 : 1 }
          ]}
          onPress={signInWithEmail}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
          )}
        </Pressable>

        <TouchableOpacity
          onPress={handleForgotPassword}
          style={styles.forgotPasswordButton}
        >
          <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        {errorMsg && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}

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
});
