import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Animated,
  Image,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/lib/supabase';

const { width: SW } = Dimensions.get('window');

const TEAM_TO_ISO2: Record<string, string> = {
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

const getFlagUrl = (code: string | undefined): string | null => {
  if (!code) return null;
  const iso2 = TEAM_TO_ISO2[code];
  return iso2 ? `https://flagcdn.com/w160/${iso2}.png` : null;
};

const getTodayLocalRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

export default function EnVivoScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string } | null>(null);
  
  // Data States
  const [todayMatches, setTodayMatches] = useState<any[]>([]);
  const [nextMatch, setNextMatch] = useState<any | null>(null);
  const [groupPredictions, setGroupPredictions] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [hasError, setHasError] = useState(false);

  // Time/Countdown State
  const [now, setNow] = useState(new Date());
  const [countdownStr, setCountdownStr] = useState('00:00:00');

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for live badge
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  // Tick countdown and time-based filter triggers
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update countdown string when nextMatch or now changes
  useEffect(() => {
    if (nextMatch) {
      const diff = new Date(nextMatch.kickoff_utc).getTime() - now.getTime();
      if (diff <= 0) {
        setCountdownStr('00:00:00');
        // Trigger fetch when countdown finishes to refresh the status
        fetchData(true);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const pad = (num: number) => num.toString().padStart(2, '0');
        setCountdownStr(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      }
    }
  }, [nextMatch, now]);

  // Main Fetch function
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setHasError(false);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 1. Obtener grupo activo
      let groupId = await AsyncStorage.getItem('@active_group_id');
      let groupName = '';

      if (!groupId) {
        // Fallback: primer grupo
        const { data: firstGroup } = await supabase
          .from('group_members')
          .select('group_id, groups(name)')
          .eq('user_id', user.id)
          .limit(1);

        if (firstGroup && firstGroup.length > 0) {
          groupId = firstGroup[0].group_id;
          groupName = (firstGroup[0] as any).groups?.name || 'Quiniela';
        }
      } else {
        const { data: grpDetails } = await supabase
          .from('groups')
          .select('name')
          .eq('id', groupId)
          .single();
        if (grpDetails) {
          groupName = grpDetails.name;
        }
      }

      if (groupId) {
        setActiveGroup({ id: groupId, name: groupName });
      } else {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Consultar partidos de hoy
      const { start, end } = getTodayLocalRange();
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id, kickoff_utc, status, round, group_name,
          home_score, away_score, home_penalties, away_penalties,
          home_team:teams!home_team_id(id, name, code),
          away_team:teams!away_team_id(id, name, code)
        `)
        .gte('kickoff_utc', start)
        .lte('kickoff_utc', end)
        .order('kickoff_utc', { ascending: true });

      if (matchesError) throw matchesError;

      const matchesList = matches || [];
      setTodayMatches(matchesList);

      // 3. Determinar estados de partidos
      const currentNowStr = new Date().toISOString();
      const next = matchesList.find(m => m.kickoff_utc > currentNowStr);
      setNextMatch(next || null);

      // 4. Cargar miembros del grupo y predicciones por match.id individualmente
      if (groupId && matchesList.length > 0) {
        const membersRes = await supabase
          .from('group_members')
          .select('user_id, users(username)')
          .eq('group_id', groupId);

        if (membersRes.error) throw membersRes.error;
        setGroupMembers(membersRes.data || []);

        const predsPromises = matchesList.map(async (m) => {
          const { data, error } = await supabase
            .from('predictions')
            .select('match_id, user_id, home_score_pred, away_score_pred, points_earned, users(username)')
            .eq('match_id', m.id)
            .eq('group_id', groupId);
          
          if (error) {
            console.error(`Error fetching predictions for match ${m.id}:`, error);
            throw error;
          }
          return data || [];
        });

        const allPreds = await Promise.all(predsPromises);
        setGroupPredictions(allPreds.flat());
      } else {
        setGroupMembers([]);
        setGroupPredictions([]);
      }

    } catch (error) {
      console.error('[EnVivoScreen] Error fetching live data:', error);
      setHasError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh cada 60 segundos
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(refreshInterval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

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
        <Ionicons name="people-outline" size={60} color="#b9ccb2" style={{ marginBottom: 16 }} />
        <Text style={styles.noGroupText}>No perteneces a ningún grupo aún.</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={60} color="#ffb4ab" style={{ marginBottom: 16 }} />
        <Text style={styles.errorText}>No se pudo cargar la pantalla en vivo</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
          <Text style={styles.retryBtnText}>REINTENTAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Lógica de Renderizado
  const renderFinishedMatch = (match: any) => {
    const homeFlag = getFlagUrl(match.home_team?.code);
    const awayFlag = getFlagUrl(match.away_team?.code);

    // Filter predictions for this match
    const preds = groupPredictions.filter(p => p.match_id === match.id);
    
    // Categorize
    const exactos = preds.filter(p => p.points_earned === 3);
    const ganadores = preds.filter(p => p.points_earned === 1);
    const perdidos = preds.filter(p => p.points_earned === 0);

    const renderUserList = (list: any[]) => {
      if (list.length === 0) return '—';
      return list.map(p => p.users?.username || 'Usuario').join(', ');
    };

    return (
      <View key={match.id} style={styles.finishedMatchCard}>
        {/* Match Header */}
        <View style={styles.finishedMatchHeader}>
          <View style={styles.finishedTeamsRow}>
            {homeFlag && <Image source={{ uri: homeFlag }} style={styles.miniFlag} resizeMode="contain" />}
            <Text style={styles.finishedTeamCode}>{match.home_team?.code}</Text>
            <Text style={styles.finishedScoreText}>{match.home_score ?? 0} - {match.away_score ?? 0}</Text>
            <Text style={styles.finishedTeamCode}>{match.away_team?.code}</Text>
            {awayFlag && <Image source={{ uri: awayFlag }} style={styles.miniFlag} resizeMode="contain" />}
          </View>
          <View style={styles.miniFinishedBadge}>
            <Text style={styles.miniFinishedBadgeText}>FINALIZADO</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.finishedStatsContainer}>
          <View style={styles.statCategoryRow}>
            <Text style={styles.statEmoji}>🎯</Text>
            <Text style={styles.statNamesGreen}>{renderUserList(exactos)}</Text>
          </View>
          <View style={styles.statCategoryRow}>
            <Text style={styles.statEmoji}>✅</Text>
            <Text style={styles.statNamesBlue}>{renderUserList(ganadores)}</Text>
          </View>
          <View style={styles.statCategoryRow}>
            <Text style={styles.statEmoji}>❌</Text>
            <Text style={styles.statNamesRed}>{renderUserList(perdidos)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    const currentNowStr = now.toISOString();
    
    // Filter today's matches
    const activeMatches = todayMatches.filter(m =>
      m.kickoff_utc <= currentNowStr && !['FT', 'AET', 'PEN', 'finished'].includes(m.status)
    );
    const finishedMatches = todayMatches.filter(m =>
      ['FT', 'AET', 'PEN', 'finished'].includes(m.status)
    );
    
    const hasActive = activeMatches.length > 0;
    const hasFinished = finishedMatches.length > 0;
    const hasUpcoming = todayMatches.some(m => m.kickoff_utc > currentNowStr);

    if (!hasActive && !hasFinished && !hasUpcoming) {
      // Caso 3: Sin partidos hoy
      return (
        <ScrollView
          contentContainerStyle={[styles.scroll, styles.centeredContent]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF41" />}
        >
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={60} color="#b9ccb2" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>No hay partidos hoy</Text>
            <Text style={styles.emptySub}>Vuelve mañana para ver los partidos y predicciones en vivo.</Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF41" />}
      >
        {/* ARRIBA: Partidos activos EN VIVO */}
        {hasActive && (
          <View style={styles.activeSection}>
            {activeMatches.map(match => {
              const homeFlag = getFlagUrl(match.home_team?.code);
              const awayFlag = getFlagUrl(match.away_team?.code);
              const myPred = groupPredictions.find(p => p.match_id === match.id && p.user_id === userId);
              const otherMembers = groupMembers.filter(m => m.user_id !== userId);

              return (
                <View key={match.id} style={[styles.liveCard, { marginBottom: 16 }]}>
                  {/* Header del card */}
                  <View style={styles.cardHeader}>
                    <Text style={styles.roundText}>
                      {match.round === 'group' ? `GRUPO ${match.group_name || ''}` : match.round.toUpperCase()}
                    </Text>
                    <Text style={styles.separatorDot}>•</Text>
                    <Text style={styles.metaText}>EN VIVO</Text>
                  </View>

                  {/* Scoreboard Principal */}
                  <View style={styles.scoreboardRow}>
                    <View style={styles.teamColumn}>
                      {homeFlag ? (
                        <Image source={{ uri: homeFlag }} style={styles.flag} resizeMode="contain" />
                      ) : (
                        <Text style={styles.flagPlaceholder}>🏳️</Text>
                      )}
                      <Text style={styles.teamName}>{match.home_team?.name}</Text>
                      <Text style={styles.teamCode}>{match.home_team?.code}</Text>
                    </View>

                    <View style={styles.scoreColumn}>
                      <View style={styles.scoreNumbers}>
                        <Text style={styles.scoreText}>{match.home_score ?? 0}</Text>
                        <Text style={styles.dash}>-</Text>
                        <Text style={styles.scoreText}>{match.away_score ?? 0}</Text>
                      </View>
                      {(match.home_penalties !== null || match.away_penalties !== null) && (
                        <Text style={styles.penaltiesText}>
                          ({match.home_penalties ?? 0} - {match.away_penalties ?? 0} pen.)
                        </Text>
                      )}
                    </View>

                    <View style={styles.teamColumn}>
                      {awayFlag ? (
                        <Image source={{ uri: awayFlag }} style={styles.flag} resizeMode="contain" />
                      ) : (
                        <Text style={styles.flagPlaceholder}>🏳️</Text>
                      )}
                      <Text style={styles.teamName}>{match.away_team?.name}</Text>
                      <Text style={styles.teamCode}>{match.away_team?.code}</Text>
                    </View>
                  </View>

                  {/* Badge de Estado */}
                  <View style={styles.badgeWrapper}>
                    <View style={styles.liveBadgeContainer}>
                      <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                      <Text style={styles.liveBadgeText}>EN VIVO</Text>
                    </View>
                  </View>

                  {/* TU PREDICCIÓN */}
                  <View style={styles.divider} />
                  <View style={styles.myPredictionSection}>
                    <Text style={styles.sectionTitle}>TU PREDICCIÓN</Text>
                    {myPred ? (
                      <View style={styles.myPredRow}>
                        <Text style={styles.myPredText}>
                          {match.home_team?.name}  {myPred.home_score_pred}  -  {myPred.away_score_pred}  {match.away_team?.name}
                        </Text>
                        {myPred.points_earned !== null && myPred.points_earned > 0 && (
                          <Text style={styles.pointsBadge}>+{myPred.points_earned} PTS</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.noPredText}>Sin predicción</Text>
                    )}
                  </View>

                  {/* PICKS DEL GRUPO */}
                  <View style={styles.divider} />
                  <View style={styles.groupPicksSection}>
                    <Text style={styles.sectionTitle}>PICKS DEL GRUPO</Text>
                    {otherMembers.length === 0 ? (
                      <Text style={styles.emptyPicksText}>No hay otros miembros en este grupo.</Text>
                    ) : (
                      otherMembers.map(member => {
                        const mPred = groupPredictions.find(p => p.match_id === match.id && p.user_id === member.user_id);
                        const username = member.users?.username || 'Jugador';
                        
                        return (
                          <View key={member.user_id} style={styles.memberPickRow}>
                            <Text style={styles.memberName}>{username}</Text>
                            <Ionicons name="arrow-forward-outline" size={14} color="#666" style={{ marginHorizontal: 8 }} />
                            <Text style={[styles.memberScore, !mPred && styles.noMemberPred]}>
                              {mPred ? `${mPred.home_score_pred} - ${mPred.away_score_pred}` : '—'}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* SI NO HAY PARTIDOS ACTIVOS: Mostramos el contador del próximo partido de hoy */}
        {!hasActive && nextMatch && (
          <View style={styles.countdownCard}>
            <Ionicons name="hourglass-outline" size={54} color="#00FF41" style={{ marginBottom: 12 }} />
            <Text style={styles.countdownTitle}>PRÓXIMO PARTIDO HOY</Text>
            
            <View style={styles.nextMatchTeamsRow}>
              <Text style={styles.nextMatchTeamCode}>{nextMatch.home_team?.code}</Text>
              <Text style={styles.nextMatchVs}>vs</Text>
              <Text style={styles.nextMatchTeamCode}>{nextMatch.away_team?.code}</Text>
            </View>

            <Text style={styles.countdownTime}>{countdownStr}</Text>
            <Text style={styles.countdownSub}>
              El partido inicia a las {new Date(nextMatch.kickoff_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Hora Local)
            </Text>
          </View>
        )}

        {/* ABAJO: Lista de partidos finalizados del día */}
        {hasFinished && (
          <View style={styles.finishedSection}>
            <Text style={styles.finishedHeaderTitle}>PARTIDOS DE HOY</Text>
            {finishedMatches.map(renderFinishedMatch)}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EN VIVO</Text>
        {activeGroup && (
          <View style={styles.groupBadge}>
            <Ionicons name="people-outline" size={12} color="#00FF41" />
            <Text style={styles.groupBadgeText}>{activeGroup.name}</Text>
          </View>
        )}
      </View>

      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131313',
    paddingTop: 60,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#201f1f',
  },
  headerTitle: {
    color: '#00FF41',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2e1c',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3b4b37',
    gap: 4,
  },
  groupBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  noGroupText: {
    color: '#b9ccb2',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#ffb4ab',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  retryBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 12,
  },

  // Card Partido Activo
  liveCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  roundText: {
    color: '#b9ccb2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  separatorDot: {
    color: '#666',
    marginHorizontal: 8,
  },
  metaText: {
    color: '#b9ccb2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scoreboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  teamColumn: {
    alignItems: 'center',
    flex: 1.2,
  },
  flag: {
    width: 60,
    height: 40,
    borderRadius: 4,
    marginBottom: 8,
  },
  flagPlaceholder: {
    fontSize: 36,
    marginBottom: 8,
  },
  teamName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  teamCode: {
    color: '#666',
    fontSize: 11,
    fontWeight: '800',
  },
  scoreColumn: {
    alignItems: 'center',
    flex: 1,
  },
  scoreNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
  },
  dash: {
    color: '#666',
    fontSize: 24,
    fontWeight: '300',
  },
  penaltiesText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  badgeWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  liveBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 75, 75, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4b4b',
  },
  liveBadgeText: {
    color: '#ff4b4b',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  finishedBadgeContainer: {
    backgroundColor: '#393939',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  finishedBadgeText: {
    color: '#b9ccb2',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#3b4b37',
    marginVertical: 18,
  },

  // Tu predicción
  myPredictionSection: {
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#00FF41',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  myPredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131313',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  myPredText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  pointsBadge: {
    color: '#000',
    backgroundColor: '#00FF41',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  noPredText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Picks del grupo
  groupPicksSection: {
    paddingHorizontal: 4,
  },
  emptyPicksText: {
    color: '#666',
    fontSize: 13,
  },
  memberPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  memberName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  memberScore: {
    color: '#00FF41',
    fontSize: 14,
    fontWeight: '800',
    width: 60,
    textAlign: 'right',
  },
  noMemberPred: {
    color: '#666',
  },

  // Countdown Card
  countdownCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    padding: 24,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  countdownTitle: {
    color: '#b9ccb2',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  nextMatchTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  nextMatchTeamCode: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  nextMatchVs: {
    color: '#666',
    fontSize: 16,
    fontWeight: '400',
  },
  countdownTime: {
    color: '#00FF41',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 16,
  },
  countdownSub: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySub: {
    color: '#b9ccb2',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 20,
  },
  activeSection: {
    marginBottom: 16,
  },
  finishedSection: {
    marginTop: 24,
  },
  finishedHeaderTitle: {
    color: '#00FF41',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  finishedMatchCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    padding: 16,
    marginBottom: 12,
  },
  finishedMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    paddingBottom: 8,
  },
  finishedTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniFlag: {
    width: 24,
    height: 16,
    borderRadius: 2,
  },
  finishedTeamCode: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  finishedScoreText: {
    color: '#00FF41',
    fontSize: 16,
    fontWeight: '900',
    marginHorizontal: 4,
  },
  miniFinishedBadge: {
    backgroundColor: '#393939',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  miniFinishedBadgeText: {
    color: '#b9ccb2',
    fontSize: 9,
    fontWeight: '800',
  },
  finishedStatsContainer: {
    gap: 6,
  },
  statCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statEmoji: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  statNamesGreen: {
    color: '#00FF41',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  statNamesBlue: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  statNamesRed: {
    color: '#ff4b4b',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
