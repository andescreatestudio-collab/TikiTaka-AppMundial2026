import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';

export default function CreateGroupScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  async function handleCreateGroup() {
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre del grupo es obligatorio');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // 0. Asegurar que el usuario existe en la tabla pública (por si falló el trigger)
      const { error: userUpsertError } = await supabase
        .from('users')
        .upsert({ 
          id: user.id, 
          email: user.email, 
          username: user.user_metadata?.username || user.email.split('@')[0] 
        }, { onConflict: 'id' });

      if (userUpsertError) console.warn('User upsert warning:', userUpsertError.message);

      const inviteCode = generateInviteCode();

      // 1. Crear el grupo (usando 'created_by' en lugar de 'admin_id')
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert([{ 
          name, 
          invite_code: inviteCode, 
          created_by: user.id 
        }])
        .select()
        .single();

      if (groupError) throw groupError;

      // 2. Agregar al admin como miembro
      const { error: memberError } = await supabase
        .from('group_members')
        .insert([{ 
          group_id: group.id, 
          user_id: user.id, 
          role: 'admin' 
        }]);

      if (memberError) throw memberError;

      // 3. Éxito — mostrar código y volver al dashboard con este grupo activo
      Alert.alert(
        '¡Grupo Creado! 🎉',
        `Código de invitación: ${inviteCode}\n\nCompártelo con tus amigos para que se unan.`,
        [{ text: 'IR AL DASHBOARD', onPress: () => router.replace('/(tabs)') }],
        { cancelable: false }
      );
    } catch (error: any) {
      console.error('Create group error:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>CREAR GRUPO</Text>
        <Text style={styles.subtitle}>Crea una liga privada para tus amigos</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>NOMBRE DEL GRUPO</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Los Galácticos"
            placeholderTextColor="#b9ccb2"
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleCreateGroup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>CREAR GRUPO</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313' },
  inner: { padding: 24, flex: 1, justifyContent: 'center' },
  title: { color: '#00FF41', fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#b9ccb2', textAlign: 'center', marginBottom: 40 },
  inputContainer: { marginBottom: 24 },
  label: { color: '#00FF41', fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 1 },
  input: {
    backgroundColor: '#201f1f',
    color: '#fff',
    padding: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3b4b37',
    fontSize: 16,
  },
  button: { backgroundColor: '#00FF41', padding: 16, borderRadius: 4, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
  backButton: { marginTop: 24, alignItems: 'center' },
  backText: { color: '#ff4b4b' },
});
