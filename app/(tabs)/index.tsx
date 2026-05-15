import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, FlatList,
} from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myPoints, setMyPoints] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' | 'participant'
  const [userId, setUserId] = useState(null);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const router = useRouter();

  const fetchData = useCallback(async (currentGroupId = null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 1. Obtener todos los grupos del usuario con su rol
      const { data: groups, error: groupsError } = await supabase
        .from('group_members')
        .select('group_id, role, groups(id, name, invite_code)')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true });

      if (groupsError) throw groupsError;

      const formattedGroups = groups.map(g => ({
        ...g.groups,
        role: g.role,
      }));
      setUserGroups(formattedGroups);

      if (formattedGroups.length === 0) return;

      // 2. Seleccionar el grupo activo (el que se pasó o el primero)
      const activeGroup = currentGroupId
        ? formattedGroups.find(g => g.id === currentGroupId) ?? formattedGroups[0]
        : selectedGroup ?? formattedGroups[0];

      setSelectedGroup(activeGroup);
      setUserRole(activeGroup.role);

      await fetchLeaderboard(activeGroup.id, user.id);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedGroup]);

  const fetchLeaderboard = async (groupId, uid) => {
    // Intentar tabla leaderboard (datos reales)
    const { data: lbData } = await supabase
      .from('leaderboard')
      .select('user_id, total_points, exact_scores, correct_winners, users(username)')
      .eq('group_id', groupId)
      .order('total_points', { ascending: false });

    if (lbData && lbData.length > 0) {
      setLeaderboard(lbData);
      const mine = lbData.find(r => r.user_id === uid);
      setMyPoints(mine?.total_points ?? 0);
    } else {
      // Fallback: mostrar miembros con 0 pts
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, role, users(username)')
        .eq('group_id', groupId);

      const rows = (members || []).map(m => ({
        user_id: m.user_id,
        total_points: 0,
        exact_scores: 0,
        correct_winners: 0,
        users: m.users,
      }));
      setLeaderboard(rows);
      setMyPoints(0);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(selectedGroup?.id);
  };

  const switchGroup = (group) => {
    setGroupPickerVisible(false);
    setSelectedGroup(group);
    setUserRole(group.role);
    fetchLeaderboard(group.id, userId);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = userRole === 'admin';

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF41" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>TIKI-TAKA</Text>
        <TouchableOpacity onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#ff4b4b" />
        </TouchableOpacity>
      </View>

      {userGroups.length === 0 ? (
        /* Estado vacío */
        <View style={styles.emptyState}>
          <Ionicons name="people-circle-outline" size={80} color="#3b4b37" />
          <Text style={styles.emptyTitle}>No tienes grupos</Text>
          <Text style={styles.emptyText}>Crea uno o únete con un código para competir.</Text>
          <TouchableOpacity
            style={styles.addGroupButton}
            onPress={() => router.push('/groups/selection')}
          >
            <Text style={styles.addGroupText}>+ CREAR O UNIRSE A GRUPO</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Selector de Grupo ── */}
          <TouchableOpacity
            style={styles.groupSelector}
            onPress={() => userGroups.length > 1 && setGroupPickerVisible(true)}
          >
            <View style={styles.groupSelectorLeft}>
              <Text style={styles.groupSelectorLabel}>GRUPO ACTIVO</Text>
              <Text style={styles.groupSelectorName}>{selectedGroup?.name}</Text>
            </View>
            <View style={styles.groupSelectorRight}>
              {isAdmin && (
                <View style={styles.adminBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#000" />
                  <Text style={styles.adminBadgeText}>ADMIN</Text>
                </View>
              )}
              {userGroups.length > 1 && (
                <Ionicons name="chevron-down" size={20} color="#00FF41" style={{ marginLeft: 8 }} />
              )}
            </View>
          </TouchableOpacity>

          {/* Código de invitación */}
          <View style={styles.inviteRow}>
            <Text style={styles.inviteLabel}>Código:</Text>
            <Text style={styles.inviteCode}>{selectedGroup?.invite_code}</Text>
          </View>

          {/* Mi posición */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>TU POSICIÓN</Text>
            <Text style={styles.points}>{myPoints ?? 0} pts</Text>
            <Text style={styles.rank}>
              {myPoints === 0 ? 'Haz tus predicciones en la tab Partidos' : `#${leaderboard.findIndex(r => r.user_id === userId) + 1} en el grupo`}
            </Text>
          </View>

          {/* Tabla de posiciones */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>TABLA DE POSICIONES</Text>
              {/* Solo admin puede crear nuevo grupo; todos pueden unirse */}
              <TouchableOpacity onPress={() => router.push('/groups/selection')}>
                <Ionicons name="add-circle" size={26} color="#00FF41" />
              </TouchableOpacity>
            </View>

            <View style={styles.leaderboard}>
              <View style={styles.leaderboardHeader}>
                <Text style={[styles.lbText, { width: 30 }]}>#</Text>
                <Text style={[styles.lbText, styles.lbFlex]}>Usuario</Text>
                <Text style={[styles.lbText, { width: 40, textAlign: 'right' }]}>Pts</Text>
              </View>
              {leaderboard.map((item, index) => (
                <View
                  key={item.user_id}
                  style={[styles.leaderboardRow, item.user_id === userId && styles.myRow]}
                >
                  <Text style={[styles.lbPos, index < 3 && { color: '#00FF41' }]}>{index + 1}</Text>
                  <Text style={[styles.lbUser, styles.lbFlex]} numberOfLines={1}>
                    {item.users?.username || 'Usuario'}
                    {item.user_id === userId ? ' (tú)' : ''}
                  </Text>
                  <Text style={styles.lbPoints}>{item.total_points}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Botón Agregar otro grupo */}
          <View style={styles.actionRow}>
            {/* ADMIN: puede crear y unirse; PARTICIPANT: solo unirse */}
            {isAdmin && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push('/groups/create')}
              >
                <Ionicons name="add-circle-outline" size={18} color="#000" />
                <Text style={styles.actionBtnText}>CREAR GRUPO</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() => router.push('/groups/join')}
            >
              <Ionicons name="enter-outline" size={18} color="#00FF41" />
              <Text style={[styles.actionBtnText, { color: '#00FF41' }]}>UNIRSE A GRUPO</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Sección próximos partidos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRÓXIMOS PARTIDOS</Text>
        <TouchableOpacity
          style={styles.matchPlaceholder}
          onPress={() => router.push('/(tabs)/partidos')}
        >
          <Text style={styles.placeholderText}>Ve a Partidos para hacer predicciones →</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: selector de grupo */}
      <Modal visible={groupPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CAMBIAR GRUPO</Text>
              <TouchableOpacity onPress={() => setGroupPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={userGroups}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.groupItem, item.id === selectedGroup?.id && styles.groupItemActive]}
                  onPress={() => switchGroup(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupItemName}>{item.name}</Text>
                    <Text style={styles.groupItemCode}>Código: {item.invite_code}</Text>
                  </View>
                  <View style={styles.groupItemRight}>
                    {item.role === 'admin' && (
                      <View style={[styles.adminBadge, { marginRight: 8 }]}>
                        <Text style={styles.adminBadgeText}>ADMIN</Text>
                      </View>
                    )}
                    {item.id === selectedGroup?.id && (
                      <Ionicons name="checkmark-circle" size={22} color="#00FF41" />
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313', paddingTop: 60 },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  logo: { color: '#00FF41', fontSize: 24, fontWeight: '900', letterSpacing: 2 },

  // Empty state
  emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyText: { color: '#b9ccb2', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  addGroupButton: { backgroundColor: '#00FF41', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 4 },
  addGroupText: { color: '#000', fontWeight: '700' },

  // Grupo selector
  groupSelector: { marginHorizontal: 20, backgroundColor: '#201f1f', borderRadius: 8, padding: 16, borderWidth: 1, borderColor: '#3b4b37', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  groupSelectorLeft: {},
  groupSelectorLabel: { color: '#666', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  groupSelectorName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  groupSelectorRight: { flexDirection: 'row', alignItems: 'center' },
  adminBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00FF41', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  adminBadgeText: { color: '#000', fontSize: 9, fontWeight: '900' },

  // Invite code
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20, gap: 8 },
  inviteLabel: { color: '#666', fontSize: 12 },
  inviteCode: { color: '#00FF41', fontSize: 12, fontWeight: '700', backgroundColor: '#1a2e1c', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },

  // Mi posición
  card: { backgroundColor: '#201f1f', marginHorizontal: 20, padding: 24, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#00FF41', marginBottom: 24 },
  cardTitle: { color: '#b9ccb2', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  points: { color: '#fff', fontSize: 48, fontWeight: '900' },
  rank: { color: '#00FF41', fontSize: 13, marginTop: 8 },

  // Secciones
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#b9ccb2', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Leaderboard
  leaderboard: { backgroundColor: '#201f1f', borderRadius: 8, overflow: 'hidden' },
  leaderboardHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#3b4b37' },
  leaderboardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  myRow: { backgroundColor: '#1a2e1c' },
  lbText: { color: '#666', fontSize: 11, fontWeight: '700' },
  lbPos: { color: '#b9ccb2', fontWeight: '700', width: 30, fontSize: 14 },
  lbFlex: { flex: 1 },
  lbUser: { color: '#fff', fontWeight: '600', fontSize: 14 },
  lbPoints: { color: '#00FF41', fontWeight: '900', width: 40, textAlign: 'right', fontSize: 14 },

  // Botones de acción
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 30 },
  actionBtn: { flex: 1, backgroundColor: '#00FF41', padding: 14, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#00FF41' },
  actionBtnText: { color: '#000', fontWeight: '800', fontSize: 12 },

  // Partidos placeholder
  matchPlaceholder: { backgroundColor: '#201f1f', padding: 20, borderRadius: 8, alignItems: 'center' },
  placeholderText: { color: '#666' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#201f1f', maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#00FF41', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  groupItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#3b4b37' },
  groupItemActive: { backgroundColor: '#1a2e1c', borderRadius: 6, paddingHorizontal: 8 },
  groupItemName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  groupItemCode: { color: '#666', fontSize: 12, marginTop: 2 },
  groupItemRight: { flexDirection: 'row', alignItems: 'center' },
});
