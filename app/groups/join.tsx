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

export default function JoinGroupScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleJoinGroup() {
    if (!code.trim()) {
      Alert.alert('Error', 'Ingresa el código de invitación');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // 0. Asegurar que el usuario existe en la tabla pública
      const { error: userUpsertError } = await supabase
        .from('users')
        .upsert({ 
          id: user.id, 
          email: user.email, 
          username: user.user_metadata?.username || (user.email ? user.email.split('@')[0] : 'usuario') 
        }, { onConflict: 'id' });

      if (userUpsertError) console.warn('User upsert warning:', userUpsertError.message);

      // 1. Buscar el grupo por código usando RPC con SECURITY DEFINER
      // (necesario porque la política RLS de groups_select_member bloquea
      //  la búsqueda cuando el usuario aún no es miembro del grupo)
      const { data: groupResults, error: groupError } = await supabase
        .rpc('find_group_by_invite_code', { p_invite_code: code.trim() });

      console.log('RPC find_group_by_invite_code response:', { groupResults, groupError });

      // Admitimos si data viene como array [ {id, name, invite_code} ] o como objeto directo {id, name, invite_code}
      const group = Array.isArray(groupResults) ? (groupResults[0] ?? null) : (groupResults ?? null);
      
      if (groupError || !group) {
        if (groupError) console.error('RPC Error:', groupError.message);
        throw new Error('Código de invitación inválido');
      }

      // 2. Verificar si ya es miembro
      // .maybeSingle() devuelve null (sin error) cuando no existe la fila,
      // evitando el error 406 que lanza .single() cuando hay 0 resultados.
      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingMember) {
        Alert.alert('Info', 'Ya eres miembro de este grupo');
        router.replace('/(tabs)');
        return;
      }

      // 3. Unirse al grupo
      const { error: joinError } = await supabase
        .from('group_members')
        .insert([{ group_id: group.id, user_id: user.id, role: 'participant' }]);

      if (joinError) throw joinError;

      Alert.alert('¡Éxito!', `Te has unido al grupo: ${group.name}`);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', (error as any).message);
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
        <Text style={styles.title}>UNIRSE A GRUPO</Text>
        <Text style={styles.subtitle}>Ingresa el código de 6 caracteres</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>CÓDIGO DE INVITACIÓN</Text>
          <TextInput
            style={styles.input}
            placeholder="ABC123"
            placeholderTextColor="#b9ccb2"
            value={code}
            onChangeText={(val) => setCode(val.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleJoinGroup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>UNIRSE AL GRUPO</Text>
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
    fontSize: 24,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 4,
  },
  button: { backgroundColor: '#00FF41', padding: 16, borderRadius: 4, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
  backButton: { marginTop: 24, alignItems: 'center' },
  backText: { color: '#ff4b4b' },
});
