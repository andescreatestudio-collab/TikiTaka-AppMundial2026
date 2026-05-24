import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';

const FILTERS = ['TODOS', 'HOY', 'MIS PREDICCIONES', 'FASE DE GRUPOS', 'ELIMINATORIAS'];

const TEAM_TO_ISO2 = {
  ARG: 'ar', MEX: 'mx', USA: 'us', CAN: 'ca', BRA: 'br',
  ESP: 'es', FRA: 'fr', GER: 'de', POR: 'pt', URU: 'uy',
  COL: 'co', NED: 'nl', BEL: 'be', CRO: 'hr', JPN: 'jp',
  KOR: 'kr', MAR: 'ma', SEN: 'sn', SUI: 'ch', ECU: 'ec',
  PAR: 'py', QAT: 'qa', KSA: 'sa', IRN: 'ir', AUS: 'au',
  TUN: 'tn', GHA: 'gh', EGY: 'eg', ALG: 'dz', CIV: 'ci',
  CPV: 'cv', COD: 'cd', RSA: 'za', BIH: 'ba', CZE: 'cz',
  AUT: 'at', SCO: 'gb-sct', ENG: 'gb-eng', SWE: 'se',
  NOR: 'no', TUR: 'tr', IRQ: 'iq', UZB: 'uz', JOR: 'jo',
  NZL: 'nz', HAI: 'ht', PAN: 'pa', CUW: 'cw'
};

const formatMatchDate = (kickoffUtc) => {
  const d = new Date(kickoffUtc);
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  const now = new Date();
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
    return `${dayName} ${dayNum} · ${timeStr}`;
  } else {
    return `${dayName} ${dayNum} ${monthName} · ${timeStr}`;
  }
};

const BlinkingLiveBadge = () => {
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.liveBadge, { opacity: fadeAnim }]}>
      <Ionicons name="play" size={10} color="#000" />
      <Text style={styles.liveText}>EN VIVO</Text>
    </Animated.View>
  );
};

export default function PartidosScreen() {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({}); // { matchId: { home, away, isSaved } }
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeFilter, setActiveFilter] = useState('TODOS');
  const [userId, setUserId] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000); // Actualizar cada segundo para el countdown
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true); // silent refresh cada 30 segundos
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 1. Obtener grupo activo del usuario (por defecto el primero)
      const { data: groups } = await supabase
        .from('group_members')
        .select('group_id, groups(name)')
        .eq('user_id', user.id)
        .limit(1);

      let groupId = null;
      if (groups && groups.length > 0) {
        groupId = groups[0].group_id;
        setActiveGroup({ id: groupId, name: groups[0].groups?.name });
      }

      // 2. Obtener Partidos
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id, match_number, round, group_name, kickoff_utc, status, home_score, away_score, home_penalties, away_penalties,
          home_team:teams!home_team_id(id, name, code, flag_emoji),
          away_team:teams!away_team_id(id, name, code, flag_emoji)
        `)
        .order('kickoff_utc', { ascending: true });

      if (matchesError) throw matchesError;

      // 3. Obtener Predicciones si hay grupo activo
      let predsMap = {};
      if (groupId) {
        const { data: predsData, error: predsError } = await supabase
          .from('predictions')
          .select('match_id, home_score_pred, away_score_pred')
          .eq('user_id', user.id)
          .eq('group_id', groupId);

        if (!predsError && predsData) {
          predsData.forEach(p => {
            predsMap[p.match_id] = {
              home: p.home_score_pred.toString(),
              away: p.away_score_pred.toString(),
              isSaved: true
            };
          });
        }
      }

      setMatches(matchesData || []);
      setPredictions(predsMap);
    } catch (error) {
      console.error('Error fetching matches:', error);
      Alert.alert('Error', 'No se pudieron cargar los partidos');
    } finally {
      setLoading(false);
    }
  };

  const handlePredictionChange = (matchId, team, value) => {
    // Solo permitir números
    const numericValue = value.replace(/[^0-9]/g, '');
    setPredictions(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team]: numericValue,
        isSaved: false // marcado como pendiente de guardar
      }
    }));
  };

  const savePrediction = async (matchId) => {
    if (!activeGroup) {
      Alert.alert('Error', 'Debes unirte a un grupo primero para hacer predicciones.');
      return;
    }

    const pred = predictions[matchId];
    if (!pred || pred.home === '' || pred.away === '' || pred.home === undefined || pred.away === undefined) {
      Alert.alert('Aviso', 'Ingresa ambos resultados antes de enviar.');
      return;
    }

    try {
      const { error } = await supabase
        .from('predictions')
        .upsert({
          user_id: userId,
          group_id: activeGroup.id,
          match_id: matchId,
          home_score_pred: parseInt(pred.home, 10),
          away_score_pred: parseInt(pred.away, 10),
          is_locked: false
        }, { onConflict: 'user_id, match_id, group_id' });

      if (error) throw error;

      setPredictions(prev => ({
        ...prev,
        [matchId]: { ...prev[matchId], isSaved: true }
      }));
    } catch (error) {
      console.error('Save pred error:', error);
      Alert.alert('Error', 'No se pudo guardar la predicción.');
    }
  };

  const isLocked = (kickoffUtc) => {
    const kickoffTime = new Date(kickoffUtc).getTime();
    // Bloquear 15 minutos (900,000 ms) antes del partido
    return (kickoffTime - 900000) <= now.getTime();
  };

  const getLockCountdown = (kickoffUtc) => {
    const kickoffTime = new Date(kickoffUtc).getTime();
    const lockTime = kickoffTime - 900000;
    const diff = lockTime - now.getTime();
    
    if (diff > 0 && diff <= 300000) { // 5 minutos o menos
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      return `⏱️ Cierra en ${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return null;
  };

  const renderStatusBadge = (match) => {
    const kickoffTime = new Date(match.kickoff_utc).getTime();
    const nowTime = now.getTime();

    if (match.status === 'finished') {
      return (
        <View style={styles.ftBadge}>
          <Ionicons name="checkmark-circle" size={12} color="#00FF41" />
          <Text style={styles.ftText}>FT</Text>
        </View>
      );
    }

    // Live: between kickoff and kickoff + 110 minutes
    if (nowTime >= kickoffTime && nowTime <= kickoffTime + 110 * 60 * 1000) {
      return <BlinkingLiveBadge />;
    }

    // Locked: between kickoff - 15 minutes and kickoff
    if (nowTime >= kickoffTime - 15 * 60 * 1000 && nowTime < kickoffTime) {
      return (
        <View style={styles.lockedBadge}>
          <Ionicons name="lock-closed" size={12} color="#ff4b4b" />
          <Text style={styles.lockedText}>BLOQUEADO</Text>
        </View>
      );
    }

    // Countdown: standard countdown if within the 5-minute window before locking
    const countdown = getLockCountdown(match.kickoff_utc);
    if (countdown) {
      return (
        <View style={styles.countdownBadge}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      );
    }

    return null;
  };

  const filterMatches = (matchesList) => {
    const today = new Date().toDateString();
    return matchesList.filter(m => {
      if (activeFilter === 'TODOS') return true;
      if (activeFilter === 'HOY') return new Date(m.kickoff_utc).toDateString() === today;
      if (activeFilter === 'FASE DE GRUPOS') return m.round === 'group';
      if (activeFilter === 'ELIMINATORIAS') return m.round !== 'group';
      if (activeFilter === 'MIS PREDICCIONES') return predictions[m.id]?.isSaved;
      return true;
    });
  };

  const getFlagUrl = (code) => {
    const iso2 = TEAM_TO_ISO2[code];
    if (!iso2) return null;
    return `https://flagcdn.com/w80/${iso2}.png`;
  };

  const groupedMatches = filterMatches(matches).reduce((acc, match) => {
    const dateStr = new Date(match.kickoff_utc).toLocaleDateString('es-ES', { 
      weekday: 'long', day: 'numeric', month: 'long' 
    }).toUpperCase();
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(match);
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

  if (!activeGroup) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="warning-outline" size={60} color="#ff4b4b" />
        <Text style={styles.errorText}>Necesitas unirte a un grupo para predecir.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      {/* Filtros */}
      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
          {FILTERS.map(filter => (
            <TouchableOpacity 
              key={filter} 
              style={[styles.filterBadge, activeFilter === filter && styles.filterBadgeActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {Object.keys(groupedMatches).length === 0 ? (
          <Text style={styles.emptyText}>No hay partidos para este filtro.</Text>
        ) : (
          Object.entries(groupedMatches).map(([date, dateMatches]) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>{date}</Text>
              
              {dateMatches.map(match => {
                const locked = isLocked(match.kickoff_utc);
                const pred = predictions[match.id] || { home: '', away: '', isSaved: false };
                const formattedDateStr = formatMatchDate(match.kickoff_utc);
                
                return (
                  <View key={match.id} style={styles.matchCard}>
                    <View style={styles.matchHeader}>
                      <Text style={styles.matchMeta}>{match.round === 'group' ? `Grupo ${match.group_name}` : match.round} • {formattedDateStr}</Text>
                      {renderStatusBadge(match)}
                    </View>

                    {match.status === 'finished' && (
                      <View style={styles.finalScoreRow}>
                        <Text style={styles.finalScoreText}>
                          {match.home_team?.code} {match.home_score} {match.home_penalties !== null ? `(${match.home_penalties}) ` : ''}vs {match.away_penalties !== null ? `(${match.away_penalties}) ` : ''}{match.away_score} {match.away_team?.code}
                        </Text>
                      </View>
                    )}

                    <View style={styles.teamsRow}>
                      <View style={styles.team}>
                        {getFlagUrl(match.home_team?.code) ? (
                          <Image 
                            source={{ uri: getFlagUrl(match.home_team?.code) }} 
                            style={styles.flagImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.flag}>🏳️</Text>
                        )}
                        <Text style={styles.teamCode}>{match.home_team?.code || 'TBD'}</Text>
                      </View>

                      <View style={styles.scoreContainer}>
                        <TextInput
                          style={[styles.scoreInput, locked && styles.scoreInputLocked]}
                          keyboardType="number-pad"
                          maxLength={2}
                          value={pred.home}
                          onChangeText={(v) => handlePredictionChange(match.id, 'home', v)}
                          editable={!locked}
                          placeholder="-"
                          placeholderTextColor="#666"
                        />
                        <Text style={styles.vs}>vs</Text>
                        <TextInput
                          style={[styles.scoreInput, locked && styles.scoreInputLocked]}
                          keyboardType="number-pad"
                          maxLength={2}
                          value={pred.away}
                          onChangeText={(v) => handlePredictionChange(match.id, 'away', v)}
                          editable={!locked}
                          placeholder="-"
                          placeholderTextColor="#666"
                        />
                      </View>

                      <View style={styles.team}>
                        {getFlagUrl(match.away_team?.code) ? (
                          <Image 
                            source={{ uri: getFlagUrl(match.away_team?.code) }} 
                            style={styles.flagImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.flag}>🏳️</Text>
                        )}
                        <Text style={styles.teamCode}>{match.away_team?.code || 'TBD'}</Text>
                      </View>
                    </View>

                    {!locked && (!pred.isSaved || (pred.home && pred.away)) && (
                      <TouchableOpacity 
                        style={[styles.submitBtn, pred.isSaved ? styles.submitBtnSaved : null]}
                        onPress={() => savePrediction(match.id)}
                      >
                        <Text style={[styles.submitBtnText, pred.isSaved ? styles.submitBtnTextSaved : null]}>
                          {pred.isSaved ? 'ACTUALIZAR PREDICCIÓN' : 'ENVIAR PREDICCIÓN'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313', paddingTop: 40 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#b9ccb2', marginTop: 16, textAlign: 'center', paddingHorizontal: 20 },
  filtersWrapper: { borderBottomWidth: 1, borderBottomColor: '#201f1f', paddingBottom: 10 },
  filtersContainer: { paddingHorizontal: 16, gap: 8 },
  filterBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#201f1f' },
  filterBadgeActive: { backgroundColor: '#00FF41' },
  filterText: { color: '#b9ccb2', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#000' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  emptyText: { color: '#b9ccb2', textAlign: 'center', marginTop: 40 },
  dateGroup: { marginBottom: 24 },
  dateHeader: { color: '#b9ccb2', fontSize: 14, fontWeight: '800', marginBottom: 12, letterSpacing: 1 },
  matchCard: { backgroundColor: '#201f1f', borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#3b4b37' },
  matchHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  matchMeta: { color: '#b9ccb2', fontSize: 12, fontWeight: '700' },
  finalScoreRow: { backgroundColor: '#131313', paddingVertical: 8, borderRadius: 6, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#00FF41' },
  finalScoreText: { color: '#00FF41', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 75, 75, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.3)',
  },
  lockedText: {
    color: '#ff4b4b',
    fontSize: 10,
    fontWeight: '800',
  },
  ftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.3)',
  },
  ftText: {
    color: '#00FF41',
    fontSize: 10,
    fontWeight: '800',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFB800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  teamsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  team: { alignItems: 'center', flex: 1 },
  flag: { fontSize: 32, marginBottom: 4 },
  flagImage: { width: 40, height: 30, marginBottom: 8, borderRadius: 4 },
  teamCode: { color: '#fff', fontSize: 16, fontWeight: '800' },
  scoreContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreInput: { backgroundColor: '#131313', color: '#00FF41', fontSize: 24, fontWeight: '900', width: 48, height: 48, textAlign: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#3b4b37' },
  scoreInputLocked: { color: '#666', borderColor: '#201f1f' },
  vs: { color: '#666', fontSize: 14, fontWeight: '700' },
  submitBtn: { backgroundColor: '#00FF41', padding: 12, borderRadius: 4, alignItems: 'center' },
  submitBtnSaved: { backgroundColor: '#1a2e1c', borderWidth: 1, borderColor: '#00FF41' },
  submitBtnText: { color: '#000', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  submitBtnTextSaved: { color: '#00FF41' },
  countdownBadge: { backgroundColor: 'rgba(255, 75, 75, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255, 75, 75, 0.3)' },
  countdownText: { color: '#ff4b4b', fontSize: 10, fontWeight: '900' },
});
