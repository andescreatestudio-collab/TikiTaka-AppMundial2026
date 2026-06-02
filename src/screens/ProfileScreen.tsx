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
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

interface GroupInfo {
  id: string;
  name: string;
}

interface Stats {
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  totalPoints: number;
}

interface GroupStanding {
  rank: number;
  total: number;
  points: number;
}

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({
    totalPredictions: 0,
    correctPredictions: 0,
    accuracy: 0,
    totalPoints: 0,
  });
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [standing, setStanding] = useState<GroupStanding | null>(null);
  
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingGroup, setLoadingGroup] = useState(true);

  // Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');

  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingStats(true);
      setLoadingGroup(true);

      // 1. Obtener usuario de Auth
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error(authError?.message || 'Usuario no autenticado');
      }
      setUser(authUser);
      setEditFullName(authUser.user_metadata?.full_name || '');

      // 2. Obtener datos públicos (users)
      const { data: publicProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
      
      if (profileError) {
        console.warn('Public profile fetch warning:', profileError.message);
      }
      setProfile(publicProfile);
      setEditUsername(publicProfile?.username || authUser.user_metadata?.username || '');

      // 3. Obtener predicciones del usuario para estadísticas globales
      const { data: preds, error: predsError } = await supabase
        .from('predictions')
        .select('points_earned')
        .eq('user_id', authUser.id);
      
      if (predsError) {
        console.error('Error fetching predictions for stats:', predsError);
      } else {
        const total = preds?.length || 0;
        const correct = preds?.filter((p: any) => p.points_earned && p.points_earned > 0).length || 0;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        const points = preds?.reduce((sum: number, p: any) => sum + (p.points_earned || 0), 0) || 0;

        setStats({
          totalPredictions: total,
          correctPredictions: correct,
          accuracy,
          totalPoints: points,
        });
      }
      setLoadingStats(false);

      // 4. Obtener grupo activo y standing
      const activeGroupId = await AsyncStorage.getItem('@active_group_id');
      if (activeGroupId) {
        const { data: group, error: groupError } = await supabase
          .from('groups')
          .select('id, name')
          .eq('id', activeGroupId)
          .single();
        
        if (groupError) {
          console.warn('Error fetching active group details:', groupError);
          setLoadingGroup(false);
        } else {
          setActiveGroup(group);

          // Obtener ranking del usuario en el leaderboard del grupo
          const { data: lbList, error: lbError } = await supabase
            .from('leaderboard')
            .select('user_id, total_points')
            .eq('group_id', activeGroupId)
            .order('total_points', { ascending: false });
          
          if (lbError) {
            console.error('Error fetching leaderboard for rank:', lbError);
          } else if (lbList) {
            const userIndex = lbList.findIndex((item: any) => item.user_id === authUser.id);
            const userRank = userIndex !== -1 ? userIndex + 1 : 0;
            const groupPoints = userIndex !== -1 ? lbList[userIndex].total_points : 0;

            setStanding({
              rank: userRank,
              total: lbList.length,
              points: groupPoints,
            });
          }
          setLoadingGroup(false);
        }
      } else {
        setLoadingGroup(false);
      }

    } catch (err: any) {
      console.error('ProfileScreen fetchData error:', err);
      Alert.alert('Error', err.message || 'Error al cargar los datos del perfil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getInitials = () => {
    const nameToUse = editFullName || profile?.username || user?.email || 'U';
    const parts = nameToUse.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameToUse.substring(0, 2).toUpperCase();
  };

  const getRegistrationDateLabel = () => {
    const rawDate = profile?.created_at || user?.created_at;
    if (!rawDate) return 'Miembro';
    const date = new Date(rawDate);
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    return `Miembro desde ${months[date.getMonth()]} de ${date.getFullYear()}`;
  };

  const handleUpdateProfile = async () => {
    const cleanFullName = editFullName.trim();
    const cleanUsername = editUsername.trim().toLowerCase();

    if (!cleanUsername) {
      Alert.alert('Error', 'El nombre de usuario es obligatorio.');
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_\-]+$/;
    if (!usernameRegex.test(cleanUsername)) {
      Alert.alert('Error', 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos.');
      return;
    }

    setSaving(true);
    try {
      // 1. Verificar si el username está disponible
      if (cleanUsername !== (profile?.username || '')) {
        const { data: existing, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('username', cleanUsername)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existing && existing.id !== user.id) {
          Alert.alert('Error', 'El nombre de usuario ya está en uso. Por favor elige otro.');
          setSaving(false);
          return;
        }
      }

      // 2. Actualizar la tabla pública 'users'
      const { error: publicUpdateError } = await supabase
        .from('users')
        .upsert({ 
          id: user.id, 
          username: cleanUsername,
          email: user.email 
        }, { onConflict: 'id' });

      if (publicUpdateError) throw publicUpdateError;

      // 3. Actualizar la metadata del usuario en Auth
      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: cleanFullName,
          username: cleanUsername,
        }
      });

      if (authUpdateError) throw authUpdateError;

      Alert.alert('Éxito', 'Perfil actualizado correctamente.');
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      console.error('Update profile error:', err);
      Alert.alert('Error', err.message || 'No se pudo actualizar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    console.log('[Profile] handleSignOut triggered');
    const performSignOut = async () => {
      try {
        console.log('[Profile] Executing supabase.auth.signOut...');
        await supabase.auth.signOut();
        console.log('[Profile] Sign out successful, navigating to /login');
        router.replace('/login' as any);
      } catch (error) {
        console.error('[Profile] Error signing out:', error);
        Alert.alert('Error', 'No se pudo cerrar la sesión correctamente.');
      }
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
      if (ok) {
        await performSignOut();
      }
    } else {
      Alert.alert(
        'Confirmar Salida',
        '¿Estás seguro de que deseas cerrar sesión?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Cerrar Sesión', 
            style: 'destructive',
            onPress: performSignOut
          }
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

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
          <Text style={styles.navTitle}>MI PERFIL</Text>
          <View style={{ width: 26 }} /> {/* Balance visual */}
        </View>

        {/* 1. Header de Perfil */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
          <Text style={styles.displayName}>
            {user?.user_metadata?.full_name || profile?.username || 'Usuario'}
          </Text>
          <Text style={styles.username}>@{profile?.username || 'usuario'}</Text>
          <Text style={styles.membershipDate}>{getRegistrationDateLabel()}</Text>
        </View>

        {/* 2. Grid de Estadísticas */}
        <Text style={styles.sectionTitle}>ESTADÍSTICAS GLOBALES</Text>
        {loadingStats ? (
          <ActivityIndicator color="#00FF41" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <View style={styles.statsCard}>
                <Ionicons name="football-outline" size={20} color="#00FF41" style={styles.cardIcon} />
                <Text style={styles.statsValue}>{stats.totalPredictions}</Text>
                <Text style={styles.statsLabel}>Predicciones</Text>
              </View>
              <View style={styles.statsCard}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#00FF41" style={styles.cardIcon} />
                <Text style={styles.statsValue}>{stats.correctPredictions}</Text>
                <Text style={styles.statsLabel}>Aciertos</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsCard}>
                <Ionicons name="analytics-outline" size={20} color="#00FF41" style={styles.cardIcon} />
                <Text style={styles.statsValue}>{stats.accuracy}%</Text>
                <Text style={styles.statsLabel}>% Acierto</Text>
              </View>
              <View style={styles.statsCard}>
                <Ionicons name="trophy-outline" size={20} color="#00FF41" style={styles.cardIcon} />
                <Text style={styles.statsValue}>{stats.totalPoints}</Text>
                <Text style={styles.statsLabel}>Puntos Totales</Text>
              </View>
            </View>
          </View>
        )}

        {/* 3. Card del Grupo Activo */}
        <Text style={styles.sectionTitle}>GRUPO ACTIVO</Text>
        {loadingGroup ? (
          <ActivityIndicator color="#00FF41" style={{ marginVertical: 20 }} />
        ) : activeGroup ? (
          <View style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Ionicons name="people" size={20} color="#00FF41" />
              <Text style={styles.groupName}>{activeGroup.name}</Text>
            </View>
            <View style={styles.groupStatsRow}>
              <View style={styles.groupStat}>
                <Text style={styles.groupStatLabel}>POSICIÓN</Text>
                <Text style={styles.groupStatValue}>
                  {standing?.rank ? `#${standing.rank}` : '-'} <Text style={styles.groupStatValueSub}>de {standing?.total || 1}</Text>
                </Text>
              </View>
              <View style={styles.groupStat}>
                <Text style={styles.groupStatLabel}>PUNTOS</Text>
                <Text style={styles.groupStatValue}>{standing?.points ?? 0} pts</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyGroupCard}>
            <Ionicons name="alert-circle-outline" size={24} color="#666" />
            <Text style={styles.emptyGroupText}>No estás en ningún grupo activo.</Text>
            <TouchableOpacity 
              style={styles.emptyGroupBtn}
              onPress={() => {
                router.back();
                router.push('/groups/selection');
              }}
            >
              <Text style={styles.emptyGroupBtnText}>UNIRSE O CREAR GRUPO</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Acciones principales */}
        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={styles.editBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="create-outline" size={20} color="#000" />
            <Text style={styles.editBtnText}>EDITAR PERFIL</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.logoutBtn}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color="#ff4b4b" />
            <Text style={styles.logoutBtnText}>CERRAR SESIÓN</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Edit Profile Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalBox} onPress={() => {}}>
              <Text style={styles.modalTitle}>EDITAR PERFIL</Text>
              <Text style={styles.modalDesc}>Actualiza tus datos para mostrar en las tablas del grupo.</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tu Nombre"
                  placeholderTextColor="#666"
                  value={editFullName}
                  onChangeText={setEditFullName}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>USERNAME (@)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="usuario10"
                  placeholderTextColor="#666"
                  value={editUsername}
                  onChangeText={setEditUsername}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity 
                style={[styles.saveBtn, saving && styles.disabledBtn]}
                onPress={handleUpdateProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>GUARDAR CAMBIOS</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>CANCELAR</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313' },
  content: { paddingBottom: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Navigation Header
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

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#201f1f',
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#131313',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00FF41',
    marginBottom: 16,
    shadowColor: '#00FF41',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  avatarText: { color: '#00FF41', fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  displayName: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  username: { color: '#00FF41', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  membershipDate: { color: '#b9ccb2', fontSize: 13 },

  // Section Headers
  sectionTitle: {
    color: '#b9ccb2',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginTop: 28,
    marginBottom: 12,
  },

  // Stats Grid (2x2)
  statsGrid: { marginHorizontal: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statsCard: {
    flex: 1,
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    padding: 16,
    position: 'relative',
  },
  cardIcon: { position: 'absolute', top: 12, right: 12 },
  statsValue: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 8 },
  statsLabel: { color: '#b9ccb2', fontSize: 12, marginTop: 4 },

  // Group Card
  groupCard: {
    marginHorizontal: 20,
    backgroundColor: '#201f1f',
    borderWidth: 1,
    borderColor: '#3b4b37',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#00FF41',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  groupName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  groupStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  groupStat: {},
  groupStatLabel: { color: '#666', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  groupStatValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  groupStatValueSub: { fontSize: 12, color: '#b9ccb2', fontWeight: '400' },

  // Empty Group
  emptyGroupCard: {
    marginHorizontal: 20,
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGroupText: { color: '#666', fontSize: 14, marginTop: 8, marginBottom: 16, textAlign: 'center' },
  emptyGroupBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#00FF41', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 4 },
  emptyGroupBtnText: { color: '#00FF41', fontSize: 11, fontWeight: '800' },

  // Action Buttons
  actionContainer: { marginHorizontal: 20, marginTop: 32, gap: 12 },
  editBtn: {
    backgroundColor: '#00FF41',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 6,
    gap: 8,
  },
  editBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
  logoutBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ff4b4b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 6,
    gap: 8,
  },
  logoutBtnText: { color: '#ff4b4b', fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  modalTitle: { color: '#00FF41', fontSize: 20, fontWeight: '900', marginBottom: 8, letterSpacing: 1 },
  modalDesc: { color: '#b9ccb2', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  inputContainer: { marginBottom: 16 },
  inputLabel: { color: '#00FF41', fontSize: 10, fontWeight: '800', marginBottom: 8, letterSpacing: 1 },
  input: {
    backgroundColor: '#131313',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#00FF41',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 12,
  },
  disabledBtn: { backgroundColor: '#3b4b37' },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  cancelBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: '#ff4b4b', fontSize: 14, fontWeight: '700' },
});
