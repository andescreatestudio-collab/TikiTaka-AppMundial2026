import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

interface LeaderboardRow {
  user_id: string;
  total_points: number;
  exactos: number;
  ganadores: number;
  perdidos: number;
  username: string;
}

export default function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const router = useRouter();

  const fetchActiveGroup = useCallback(async () => {
    try {
      const persisted = await AsyncStorage.getItem('@active_group_id');
      return persisted;
    } catch (e) {
      console.error('Error reading active group ID from AsyncStorage:', e);
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const groupId = await fetchActiveGroup();
      if (!groupId) {
        setActiveGroupId(null);
        setGroupName(null);
        setLeaderboard([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setActiveGroupId(groupId);

      // 1. Obtener detalles del grupo
      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .single();
      
      if (groupErr) {
        console.warn('Error fetching group details:', groupErr);
      } else {
        setGroupName(group.name);
      }

      // 2. Obtener todos los miembros del grupo
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('user_id, users(username)')
        .eq('group_id', groupId);

      if (membersError) throw membersError;

      // 3. Obtener los puntajes reales de leaderboard
      const { data: lbData, error: lbError } = await supabase
        .from('leaderboard')
        .select('user_id, total_points')
        .eq('group_id', groupId);
      
      if (lbError) throw lbError;

      const lbMap = new Map<string, any>();
      if (lbData) {
        lbData.forEach(row => {
          lbMap.set(row.user_id, row);
        });
      }

      // 4. Obtener todas las predicciones del grupo procesadas para calcular estadísticas
      const { data: predsData, error: predsError } = await supabase
        .from('predictions')
        .select('user_id, points_earned')
        .eq('group_id', groupId)
        .not('points_earned', 'is', null);

      if (predsError) throw predsError;

      const statsMap = new Map<string, { exactos: number; ganadores: number; perdidos: number }>();
      (members || []).forEach((m: any) => {
        statsMap.set(m.user_id, { exactos: 0, ganadores: 0, perdidos: 0 });
      });

      if (predsData) {
        predsData.forEach((p: any) => {
          const userStats = statsMap.get(p.user_id) || { exactos: 0, ganadores: 0, perdidos: 0 };
          if (p.points_earned === 3) {
            userStats.exactos++;
          } else if (p.points_earned === 1) {
            userStats.ganadores++;
          } else if (p.points_earned === 0) {
            userStats.perdidos++;
          }
          statsMap.set(p.user_id, userStats);
        });
      }

      // 5. Mezclar los datos de miembros con los de leaderboard y estadísticas
      const rows = (members || []).map((m: any) => {
        const scoreInfo = lbMap.get(m.user_id);
        const userStats = statsMap.get(m.user_id) || { exactos: 0, ganadores: 0, perdidos: 0 };
        const username = m.users?.username || 'Usuario';
        return {
          user_id: m.user_id,
          total_points: scoreInfo?.total_points ?? 0,
          exactos: userStats.exactos,
          ganadores: userStats.ganadores,
          perdidos: userStats.perdidos,
          username,
        };
      });

      // 6. Ordenar por puntaje descendente
      rows.sort((a, b) => b.total_points - a.total_points);

      setLeaderboard(rows);
    } catch (error) {
      console.error('Error fetching leaderboard screen:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchActiveGroup]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const renderItem = ({ item, index }: { item: LeaderboardRow; index: number }) => {
    const isMe = item.user_id === userId;
    const isTopThree = index < 3;
    const rankColor = isTopThree ? '#00FF41' : '#b9ccb2';
    const rankDisplay = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

    return (
      <View style={[styles.card, isMe && styles.myCard]}>
        {/* Fila 1: Posicion + Username + Puntos */}
        <View style={styles.rowTop}>
          <View style={styles.userSection}>
            <Text style={[styles.rankText, { color: rankColor }]}>{rankDisplay}</Text>
            <Text style={[styles.usernameText, isMe && styles.myUsernameText]} numberOfLines={1}>
              {item.username}{isMe ? ' (tú)' : ''}
            </Text>
          </View>
          <Text style={[styles.pointsText, isMe && styles.myPointsText]}>{item.total_points} PTS</Text>
        </View>

        {/* Separador */}
        <View style={styles.cardDivider} />

        {/* Fila 2: Stats (3 columnas separadas por lineas verticales) */}
        <View style={styles.rowBottom}>
          <View style={styles.statColumn}>
            <Text style={styles.statTextGreen}>🎯 Exactos: {item.exactos}</Text>
          </View>
          <View style={styles.statVerticalDivider} />
          <View style={styles.statColumn}>
            <Text style={styles.statTextBlue}>✅ Ganados: {item.ganadores}</Text>
          </View>
          <View style={styles.statVerticalDivider} />
          <View style={styles.statColumn}>
            <Text style={styles.statTextRed}>❌ Perdidos: {item.perdidos}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>POSICIONES</Text>
        {groupName && (
          <View style={styles.groupBadge}>
            <Ionicons name="people" size={14} color="#00FF41" />
            <Text style={styles.groupName}>{groupName}</Text>
          </View>
        )}
      </View>

      {activeGroupId ? (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF41" />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={[styles.headerText, { width: 30 }]}>#</Text>
              <Text style={[styles.headerText, { marginLeft: 12 }, styles.flexLabel]}>USUARIO</Text>
              <Text style={[styles.headerText, { textAlign: 'right', marginRight: 8 }]}>PUNTOS</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#666" />
              <Text style={styles.emptyText}>No hay miembros en este grupo aún.</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#666" />
          <Text style={styles.emptyTitle}>Sin Grupo Activo</Text>
          <Text style={styles.emptyDesc}>
            Para ver la tabla de posiciones debes crear o unirte a un grupo privado.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/groups/selection')}
          >
            <Text style={styles.emptyBtnText}>UNIRSE O CREAR GRUPO</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles: any = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313', paddingTop: Platform.OS === 'ios' ? 60 : 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#201f1f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#00FF41', fontSize: 24, fontWeight: '900', letterSpacing: 1.5 },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2e1c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3b4b37',
    gap: 6,
  },
  groupName: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // List content
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  listHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3b4b37',
    marginBottom: 8,
  },
  headerText: { color: '#666', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  flexLabel: { flex: 1 },

  // Card
  card: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  myCard: {
    backgroundColor: '#1a2e1c',
    borderColor: '#00FF41',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  rankText: {
    fontSize: 16,
    fontWeight: '900',
    marginRight: 10,
    textAlign: 'center',
    minWidth: 24,
  },
  usernameText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  myUsernameText: {
    fontWeight: '800',
  },
  pointsText: {
    color: '#00FF41',
    fontSize: 18,
    fontWeight: '900',
  },
  myPointsText: {
    color: '#00FF41',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#3b4b37',
    marginVertical: 4,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statVerticalDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#3b4b37',
  },
  statTextGreen: {
    color: '#00FF41',
    fontSize: 11,
    fontWeight: '600',
  },
  statTextBlue: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  statTextRed: {
    color: '#ff4b4b',
    fontSize: 11,
    fontWeight: '600',
  },

  // Empty state in list
  emptyState: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666', fontSize: 14, marginTop: 12 },

  // Empty active group state
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: -40,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 16 },
  emptyDesc: { color: '#b9ccb2', textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
  emptyBtn: { backgroundColor: '#00FF41', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 4 },
  emptyBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
});
