import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';

const DEADLINE = new Date('2026-06-11T19:00:00Z');

export default function PuntuacionScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [userId, setUserId] = useState(null);
  const [picks, setPicks] = useState({
    champion_team_id: null,
    finalist_team_id: null,
    semi1_team_id: null,
    semi2_team_id: null,
    semi3_team_id: null,
    semi4_team_id: null,
  });
  const [isLocked, setIsLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectingKey, setSelectingKey] = useState(null);

  useEffect(() => {
    fetchData();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  const updateCountdown = useCallback(() => {
    const now = new Date();
    const diff = DEADLINE.getTime() - now.getTime();
    
    if (diff <= 0) {
      setTimeLeft('CERRADO');
      setIsLocked(true);
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const pad = (num) => num.toString().padStart(2, '0');
      setTimeLeft(`${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`);
      setIsLocked(false);
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 1. Obtener equipos
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, code, flag_emoji')
        .order('name');
      setTeams(teamsData || []);

      // 2. Obtener grupo activo
      const { data: groups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .limit(1);

      if (groups && groups.length > 0) {
        const groupId = groups[0].group_id;
        setActiveGroup(groupId);

        // 3. Obtener picks existentes
        const { data: picksData } = await supabase
          .from('pre_tournament_picks')
          .select('*')
          .eq('user_id', user.id)
          .eq('group_id', groupId)
          .maybeSingle();

        if (picksData) {
          setPicks({
            champion_team_id: picksData.champion_team_id,
            finalist_team_id: picksData.finalist_team_id,
            semi1_team_id: picksData.semi1_team_id,
            semi2_team_id: picksData.semi2_team_id,
            semi3_team_id: picksData.semi3_team_id,
            semi4_team_id: picksData.semi4_team_id,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePicks = async () => {
    if (isLocked) {
      Alert.alert('Error', 'El tiempo para guardar picks ha terminado.');
      return;
    }
    if (!activeGroup) {
      Alert.alert('Error', 'Debes unirte a un grupo primero.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pre_tournament_picks')
        .upsert({
          user_id: userId,
          group_id: activeGroup,
          ...picks,
          is_locked: false,
        }, { onConflict: 'user_id, group_id' });

      if (error) throw error;
      Alert.alert('Éxito', 'Tus Early Picks han sido guardados.');
    } catch (error) {
      Alert.alert('Error', 'No se pudieron guardar los picks.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const openSelector = (key) => {
    if (isLocked) return;
    setSelectingKey(key);
    setModalVisible(true);
  };

  const selectTeam = (teamId) => {
    setPicks(prev => ({ ...prev, [selectingKey]: teamId }));
    setModalVisible(false);
  };

  const getTeamLabel = (id) => {
    const team = teams.find(t => t.id === id);
    return team ? `${team.flag_emoji} ${team.name}` : 'Seleccionar equipo...';
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>PUNTUACIÓN</Text>

      {/* 1. SISTEMA DE PUNTOS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SISTEMA DE PUNTOS</Text>
        <View style={styles.card}>
          <View style={styles.ruleRow}>
            <View style={[styles.pointBadge, { backgroundColor: '#00FF41' }]}>
              <Text style={styles.pointText}>+3</Text>
            </View>
            <View style={styles.ruleInfo}>
              <Text style={styles.ruleTitle}>Resultado Exacto</Text>
              <Text style={styles.ruleDesc}>Adivinas el marcador exacto (ej: 2-1)</Text>
            </View>
          </View>
          <View style={styles.ruleRow}>
            <View style={[styles.pointBadge, { backgroundColor: '#1a2e1c', borderColor: '#00FF41', borderWidth: 1 }]}>
              <Text style={[styles.pointText, { color: '#00FF41' }]}>+1</Text>
            </View>
            <View style={styles.ruleInfo}>
              <Text style={styles.ruleTitle}>Ganador / Empate</Text>
              <Text style={styles.ruleDesc}>Aciertas quién gana o si hay empate</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>BONOS EXTRA</Text>
        <View style={styles.card}>
          <Text style={styles.bonusItem}>• Posición exacta en grupo: <Text style={styles.bonusPoint}>+1 pt</Text></Text>
          <Text style={styles.bonusItem}>• Semifinalista pre-torneo: <Text style={styles.bonusPoint}>+2 pts c/u</Text></Text>
          <Text style={styles.bonusItem}>• Finalista pre-torneo: <Text style={styles.bonusPoint}>+5 pts</Text></Text>
          <Text style={styles.bonusItem}>• Campeón pre-torneo: <Text style={styles.bonusPoint}>+10 pts</Text></Text>
        </View>
      </View>

      {/* 2. EARLY PICKS */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>EARLY PICKS</Text>
          <View style={[styles.timerBadge, isLocked && { backgroundColor: '#ff4b4b' }]}>
            <Ionicons name="time-outline" size={14} color="#000" />
            <Text style={styles.timerText}>{timeLeft}</Text>
          </View>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.earlyDesc}>Elige a tus favoritos antes del inicio del torneo para ganar puntos extra.</Text>
          
          <Text style={styles.label}>CAMPEÓN</Text>
          <TouchableOpacity style={styles.selector} onPress={() => openSelector('champion_team_id')}>
            <Text style={styles.selectorText}>{getTeamLabel(picks.champion_team_id)}</Text>
            <Ionicons name="chevron-down" size={20} color="#00FF41" />
          </TouchableOpacity>

          <Text style={styles.label}>FINALISTA</Text>
          <TouchableOpacity style={styles.selector} onPress={() => openSelector('finalist_team_id')}>
            <Text style={styles.selectorText}>{getTeamLabel(picks.finalist_team_id)}</Text>
            <Ionicons name="chevron-down" size={20} color="#00FF41" />
          </TouchableOpacity>

          <Text style={styles.label}>SEMIFINALISTAS</Text>
          {['semi1_team_id', 'semi2_team_id', 'semi3_team_id', 'semi4_team_id'].map((key, i) => (
            <TouchableOpacity key={key} style={styles.selector} onPress={() => openSelector(key)}>
              <Text style={styles.selectorText}>{getTeamLabel(picks[key])}</Text>
              <Ionicons name="chevron-down" size={20} color="#00FF41" />
            </TouchableOpacity>
          ))}

          <TouchableOpacity 
            style={[styles.saveBtn, (isLocked || saving) && styles.disabledBtn]} 
            onPress={handleSavePicks}
            disabled={isLocked || saving}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>GUARDAR PICKS</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Selector Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECCIONAR EQUIPO</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={teams}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.teamItem} onPress={() => selectTeam(item.id)}>
                  <Text style={styles.teamItemFlag}>{item.flag_emoji}</Text>
                  <Text style={styles.teamItemName}>{item.name}</Text>
                  <Text style={styles.teamItemCode}>{item.code}</Text>
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
  container: { flex: 1, backgroundColor: '#131313' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  title: { color: '#00FF41', fontSize: 28, fontWeight: '900', marginBottom: 30, textAlign: 'center' },
  section: { marginBottom: 30 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#00FF41', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  card: { backgroundColor: '#201f1f', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#3b4b37' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  pointBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  pointText: { color: '#000', fontWeight: '900', fontSize: 16 },
  ruleInfo: { flex: 1 },
  ruleTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ruleDesc: { color: '#b9ccb2', fontSize: 12 },
  bonusItem: { color: '#fff', fontSize: 14, marginBottom: 8 },
  bonusPoint: { color: '#00FF41', fontWeight: '800' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00FF41', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  timerText: { color: '#000', fontSize: 12, fontWeight: '800', marginLeft: 4 },
  earlyDesc: { color: '#b9ccb2', fontSize: 13, marginBottom: 20 },
  label: { color: '#00FF41', fontSize: 10, fontWeight: '800', marginTop: 15, marginBottom: 8, letterSpacing: 1 },
  selector: { backgroundColor: '#131313', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#3b4b37', marginBottom: 5 },
  selectorText: { color: '#fff', fontSize: 14 },
  saveBtn: { backgroundColor: '#00FF41', padding: 18, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#3b4b37' },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#201f1f', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#00FF41', fontSize: 18, fontWeight: '900' },
  teamItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#3b4b37' },
  teamItemFlag: { fontSize: 24, marginRight: 15 },
  teamItemName: { color: '#fff', fontSize: 16, flex: 1 },
  teamItemCode: { color: '#666', fontSize: 14, fontWeight: '700' },
});
