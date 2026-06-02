import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';

interface GroupItem {
  id: string;
  name: string;
}

export default function InviteUserScreen() {
  const [email, setEmail] = useState('');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [sending, setSending] = useState(false);

  const router = useRouter();

  const fetchAdminGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data, error } = await supabase
        .from('group_members')
        .select('group_id, role, groups(id, name)')
        .eq('user_id', user.id)
        .eq('role', 'admin');

      if (error) throw error;

      if (data) {
        const formatted = data
          .map((item: any) => item.groups)
          .filter((g: any) => g !== null) as GroupItem[];
        
        setGroups(formatted);
        if (formatted.length > 0) {
          setSelectedGroupId(formatted[0].id);
        }
      }
    } catch (e: any) {
      console.error('Error fetching admin groups:', e);
      Alert.alert('Error', 'No se pudieron cargar tus ligas administradas.');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminGroups();
  }, [fetchAdminGroups]);

  const handleSendInvite = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Error', 'Por favor ingresa un correo electrónico válido.');
      return;
    }

    if (!selectedGroupId) {
      Alert.alert('Error', 'Debes seleccionar un grupo de destino.');
      return;
    }

    setSending(true);
    try {
      // Invocar la Edge Function mediante la utilidad de Supabase
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: cleanEmail,
          group_id: selectedGroupId,
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      Alert.alert(
        '¡Invitación Enviada! ✉️',
        `Se ha enviado un correo electrónico de registro a ${cleanEmail} para unirse a la liga.`,
        [{ text: 'ENTENDIDO', onPress: () => router.back() }]
      );
    } catch (err: any) {
      console.error('Send invite error:', err);
      Alert.alert('Error al enviar invitación', err.message || 'Ocurrió un error inesperado al invitar al usuario.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Header de navegación superior */}
        <View style={styles.navHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>INVITAR USUARIO</Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Explicación de la característica */}
        <View style={styles.descCard}>
          <Ionicons name="mail-open-outline" size={32} color="#00FF41" style={styles.descIcon} />
          <Text style={styles.descText}>
            Envía una invitación oficial por correo electrónico. Al hacer clic en el enlace, el usuario se registrará e ingresará de inmediato a tu liga privada.
          </Text>
        </View>

        {/* Input de Correo */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CORREO ELECTRÓNICO DEL INVITADO</Text>
          <TextInput
            style={styles.input}
            placeholder="ejemplo@correo.com"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
        </View>

        {/* Selector de Grupo */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SELECCIONAR LIGA DESTINO</Text>
          {loadingGroups ? (
            <ActivityIndicator color="#00FF41" style={{ marginTop: 12 }} />
          ) : groups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="alert-circle-outline" size={24} color="#666" />
              <Text style={styles.emptyText}>Debes ser creador/admin de al menos una liga para invitar a otros.</Text>
            </View>
          ) : (
            <View style={styles.groupsContainer}>
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.groupItem, isActive && styles.groupItemActive]}
                    onPress={() => setSelectedGroupId(group.id)}
                  >
                    <View style={styles.groupItemLeft}>
                      <Ionicons 
                        name={isActive ? "radio-button-on" : "radio-button-off"} 
                        size={18} 
                        color={isActive ? "#00FF41" : "#666"} 
                      />
                      <Text style={[styles.groupItemName, isActive && styles.groupItemNameActive]}>
                        {group.name}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color="#00FF41" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Acciones principales */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.submitBtn, (groups.length === 0 || sending) && styles.disabledBtn]}
            onPress={handleSendInvite}
            disabled={groups.length === 0 || sending}
          >
            {sending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#000" />
                <Text style={styles.submitBtnText}>ENVIAR INVITACIÓN</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313' },
  content: { paddingBottom: 60 },
  
  // Header
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#201f1f',
  },
  backBtn: { padding: 4 },
  navTitle: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },

  // Explanation Card
  descCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  descIcon: {},
  descText: { color: '#b9ccb2', fontSize: 13, flex: 1, lineHeight: 18 },

  // Sections
  section: { marginHorizontal: 20, marginTop: 28 },
  sectionLabel: { color: '#00FF41', fontSize: 10, fontWeight: '800', marginBottom: 12, letterSpacing: 1 },
  
  // Email input
  input: {
    backgroundColor: '#201f1f',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 4,
    fontSize: 16,
  },

  // Groups select
  groupsContainer: { gap: 8 },
  groupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: '#3b4b37',
    padding: 16,
    borderRadius: 4,
  },
  groupItemActive: {
    borderColor: '#00FF41',
    backgroundColor: '#1a2e1c',
  },
  groupItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupItemName: { color: '#666', fontSize: 15, fontWeight: '700' },
  groupItemNameActive: { color: '#fff' },

  // Empty groups
  emptyCard: { backgroundColor: '#201f1f', borderWidth: 1, borderColor: '#2a2a2a', padding: 20, borderRadius: 8, alignItems: 'center', gap: 12 },
  emptyText: { color: '#666', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Submit button
  actionRow: { marginHorizontal: 20, marginTop: 36 },
  submitBtn: {
    backgroundColor: '#00FF41',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 6,
    gap: 8,
  },
  disabledBtn: { backgroundColor: '#3b4b37' },
  submitBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
