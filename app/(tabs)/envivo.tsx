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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/lib/supabase';

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

const LOCK_MINUTES = 15;

const getMatchState = (match: any) => {
  const now = new Date();
  const kickoff = new Date(match.kickoff_utc);
  const minutesUntilKickoff = (kickoff.getTime() - now.getTime()) / 60000;
  const isFinished = ['FT', 'AET', 'PEN', 'finished'].includes(match.status);
  const isLive = !isFinished && minutesUntilKickoff <= 0;
  const isExpanded = isFinished || isLive || minutesUntilKickoff <= LOCK_MINUTES;

  return { isFinished, isLive, isExpanded, minutesUntilKickoff };
};

const formatRemainingTime = (minutes: number) => {
  if (minutes <= 0) return '00:00';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}`;
};

const formatKickoffTime = (kickoffUtc: string) => {
  const d = new Date(kickoffUtc);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function EnVivoScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string } | null>(null);
  
  // Data States
  const [todayMatches, setTodayMatches] = useState<any[]>([]);
  const [allPredictions, setAllPredictions] = useState<any[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [hasError, setHasError] = useState(false);

  // Time ticker state (causes runtime state to update dynamically)
  const [now, setNow] = useState(new Date());

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

  // Tick time every 10 seconds (reduces re-render overhead but stays accurate)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

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

      // 2. Consultar todos los partidos de hoy
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

      // 3. Cargar miembros y predicciones en bloque si hay partidos hoy
      if (groupId && matchesList.length > 0) {
        const matchIds = matchesList.map(m => m.id);
        const [membersRes, predsRes] = await Promise.all([
          supabase
            .from('group_members')
            .select('user_id, users(username)')
            .eq('group_id', groupId),
          supabase
            .from('predictions')
            .select('match_id, user_id, home_score_pred, away_score_pred, points_earned')
            .in('match_id', matchIds)
        ]);

        if (membersRes.error) throw membersRes.error;
        if (predsRes.error) throw predsRes.error;

        setGroupMembers(membersRes.data || []);
        setAllPredictions(predsRes.data || []);
      } else {
        setGroupMembers([]);
        setAllPredictions([]);
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

  const getUsername = (uid: string) => {
    const mem = groupMembers.find(x => x.user_id === uid);
    const name = mem?.users?.username || 'Usuario';
    return uid === userId ? `${name} (tú)` : name;
  };

  const renderMatchCard = (match: any) => {
    const { isFinished, isLive, isExpanded, minutesUntilKickoff } = getMatchState(match);
    const homeFlag = getFlagUrl(match.home_team?.code);
    const awayFlag = getFlagUrl(match.away_team?.code);
    
    // User's own prediction
    const myPred = allPredictions.find(p => p.match_id === match.id && p.user_id === userId);
    
    // Other members
    const otherMembers = groupMembers.filter(m => m.user_id !== userId);
    
    // Match predictions list
    const matchPreds = allPredictions.filter(p => p.match_id === match.id);

    // Collapsed Mode
    if (!isExpanded) {
      return (
        <View key={match.id} style={styles.collapsedCard}>
          <Text style={styles.collapsedTime}>{formatKickoffTime(match.kickoff_utc)}</Text>
          <View style={styles.collapsedTeamsRow}>
            {homeFlag && <Image source={{ uri: homeFlag }} style={styles.miniFlag} resizeMode="contain" />}
            <Text style={styles.collapsedTeamCode}>{match.home_team?.code}</Text>
            <Text style={styles.collapsedVs}>vs</Text>
            <Text style={styles.collapsedTeamCode}>{match.away_team?.code}</Text>
            {awayFlag && <Image source={{ uri: awayFlag }} style={styles.miniFlag} resizeMode="contain" />}
          </View>
          <Text style={styles.collapsedCountdown}>⏳ {formatRemainingTime(minutesUntilKickoff)}</Text>
        </View>
      );
    }

    // Expanded Mode: Live
    if (isLive) {
      return (
        <View key={match.id} style={[styles.liveCard, styles.expandedCard]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveBadgeText}>EN VIVO</Text>
            </View>
            <Text style={styles.roundText}>
              {match.round === 'group' ? `GRUPO ${match.group_name || ''}` : match.round.toUpperCase()}
            </Text>
          </View>

          {/* Scoreboard */}
          <View style={styles.scoreboardRow}>
            <View style={styles.teamColumn}>
              {homeFlag ? (
                <Image source={{ uri: homeFlag }} style={styles.flag} resizeMode="contain" />
              ) : (
                <Text style={styles.flagPlaceholder}>🏳️</Text>
              )}
              <Text style={styles.teamCodeBig}>{match.home_team?.code}</Text>
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
              <Text style={styles.teamCodeBig}>{match.away_team?.code}</Text>
            </View>
          </View>

          {/* Tu Prediccion */}
          <View style={styles.cardDivider} />
          <View style={styles.predictionRow}>
            <Text style={styles.sectionTitle}>TU PREDICCIÓN:</Text>
            <Text style={styles.predValText}>
              {myPred ? `${myPred.home_score_pred} - ${myPred.away_score_pred}` : '—'}
            </Text>
          </View>

          {/* Picks del grupo */}
          <View style={styles.cardDivider} />
          <View style={styles.picksSection}>
            <Text style={styles.sectionTitle}>PICKS DEL GRUPO</Text>
            {otherMembers.length === 0 ? (
              <Text style={styles.emptyTextSub}>No hay otros miembros en este grupo.</Text>
            ) : (
              otherMembers.map(member => {
                const mPred = matchPreds.find(p => p.user_id === member.user_id);
                const username = member.users?.username || 'Jugador';
                return (
                  <View key={member.user_id} style={styles.pickItem}>
                    <Text style={styles.pickUser}>{username}</Text>
                    <Text style={styles.pickArrow}>→</Text>
                    <Text style={[styles.pickValue, !mPred && styles.noPredValue]}>
                      {mPred ? `${mPred.home_score_pred} - ${mPred.away_score_pred}` : '—'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      );
    }

    // Expanded Mode: Por comenzar
    if (!isLive && !isFinished) {
      return (
        <View key={match.id} style={[styles.upcomingCard, styles.expandedCard]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.upcomingBadge}>
              <Text style={styles.upcomingBadgeText}>⏳ POR COMENZAR</Text>
            </View>
            <Text style={styles.roundText}>
              {match.round === 'group' ? `GRUPO ${match.group_name || ''}` : match.round.toUpperCase()}
            </Text>
          </View>

          {/* Teams Header */}
          <View style={styles.teamsHeaderRow}>
            {homeFlag && <Image source={{ uri: homeFlag }} style={styles.miniFlag} resizeMode="contain" />}
            <Text style={styles.upcomingTeamsText}>{match.home_team?.code} vs {match.away_team?.code}</Text>
            {awayFlag && <Image source={{ uri: awayFlag }} style={styles.miniFlag} resizeMode="contain" />}
          </View>

          {/* Tu Prediccion */}
          <View style={styles.cardDivider} />
          <View style={styles.predictionRow}>
            <Text style={styles.sectionTitle}>TU PREDICCIÓN:</Text>
            <Text style={styles.predValText}>
              {myPred ? `${myPred.home_score_pred} - ${myPred.away_score_pred}  🔒` : '—  🔒'}
            </Text>
          </View>

          {/* Picks del grupo */}
          <View style={styles.cardDivider} />
          <View style={styles.picksSection}>
            <Text style={styles.sectionTitle}>PICKS DEL GRUPO</Text>
            {otherMembers.length === 0 ? (
              <Text style={styles.emptyTextSub}>No hay otros miembros en este grupo.</Text>
            ) : (
              otherMembers.map(member => {
                const mPred = matchPreds.find(p => p.user_id === member.user_id);
                const username = member.users?.username || 'Jugador';
                return (
                  <View key={member.user_id} style={styles.pickItem}>
                    <Text style={styles.pickUser}>{username}</Text>
                    <Text style={styles.pickArrow}>→</Text>
                    <Text style={[styles.pickValue, !mPred && styles.noPredValue]}>
                      {mPred ? `${mPred.home_score_pred} - ${mPred.away_score_pred}` : '—'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      );
    }

    // Expanded Mode: Finalizado
    if (isFinished) {
      // Categorize predictions
      const exactos = matchPreds.filter(p => p.points_earned === 3);
      const ganadores = matchPreds.filter(p => p.points_earned === 1);
      const perdidos = matchPreds.filter(p => p.points_earned === 0);

      const renderUserList = (list: any[]) => {
        if (list.length === 0) return '—';
        return list.map(p => getUsername(p.user_id)).join(', ');
      };

      return (
        <View key={match.id} style={[styles.finishedCard, styles.expandedCard]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.finishedBadge}>
              <Text style={styles.finishedBadgeText}>✅ FINALIZADO</Text>
            </View>
            <Text style={styles.roundText}>
              {match.round === 'group' ? `GRUPO ${match.group_name || ''}` : match.round.toUpperCase()}
            </Text>
          </View>

          {/* Score Header */}
          <View style={styles.finishedTeamsRow}>
            {homeFlag && <Image source={{ uri: homeFlag }} style={styles.miniFlag} resizeMode="contain" />}
            <Text style={styles.finishedTeamCode}>{match.home_team?.code}</Text>
            <Text style={styles.finishedScoreText}>{match.home_score ?? 0} - {match.away_score ?? 0}</Text>
            <Text style={styles.finishedTeamCode}>{match.away_team?.code}</Text>
            {awayFlag && <Image source={{ uri: awayFlag }} style={styles.miniFlag} resizeMode="contain" />}
          </View>
          
          {(match.home_penalties !== null || match.away_penalties !== null) && (
            <Text style={styles.finishedPenaltiesText}>
              ({match.home_penalties ?? 0} - {match.away_penalties ?? 0} pen.)
            </Text>
          )}

          {/* Stats Results */}
          <View style={styles.cardDivider} />
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
    }

    return null;
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF41" />}
      >
        {todayMatches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={60} color="#b9ccb2" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitleText}>No hay partidos hoy</Text>
            <Text style={styles.emptySubText}>Vuelve mañana para ver los partidos y predicciones en vivo.</Text>
          </View>
        ) : (
          todayMatches.map(renderMatchCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#131313',
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 60,
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

  // Collapsed Mode Card
  collapsedCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  collapsedTime: {
    color: '#b9ccb2',
    fontSize: 13,
    fontWeight: '700',
    width: 70,
  },
  collapsedTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
  },
  collapsedTeamCode: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  collapsedVs: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  collapsedCountdown: {
    color: '#ffb4ab',
    fontSize: 13,
    fontWeight: '700',
    width: 80,
    textAlign: 'right',
  },

  // Expanded Mode Card
  expandedCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  roundText: {
    color: '#666',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#3b4b37',
    marginVertical: 14,
  },

  // Live Card specific
  liveCard: {
    borderColor: '#00FF41',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF41',
  },
  liveBadgeText: {
    color: '#00FF41',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  scoreboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  teamColumn: {
    alignItems: 'center',
    flex: 1.2,
  },
  flag: {
    width: 50,
    height: 34,
    borderRadius: 3,
    marginBottom: 6,
  },
  flagPlaceholder: {
    fontSize: 28,
    marginBottom: 6,
  },
  teamCodeBig: {
    color: '#fff',
    fontSize: 16,
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
    fontSize: 36,
    fontWeight: '900',
  },
  dash: {
    color: '#666',
    fontSize: 20,
    fontWeight: '300',
  },
  penaltiesText: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Upcoming Card specific
  upcomingCard: {},
  upcomingBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  upcomingBadgeText: {
    color: '#FFB800',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 10,
  },
  upcomingTeamsText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Finished Card specific
  finishedCard: {},
  finishedBadge: {
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  finishedBadgeText: {
    color: '#00FF41',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  finishedTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
  },
  finishedTeamCode: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  finishedScoreText: {
    color: '#00FF41',
    fontSize: 22,
    fontWeight: '900',
    marginHorizontal: 8,
  },
  finishedPenaltiesText: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
  },

  // Shared Subsections inside expanded cards
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  predValText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  picksSection: {
    paddingHorizontal: 4,
  },
  emptyTextSub: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
  },
  pickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  pickUser: {
    color: '#b9ccb2',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  pickArrow: {
    color: '#666',
    marginHorizontal: 8,
  },
  pickValue: {
    color: '#00FF41',
    fontSize: 13,
    fontWeight: '700',
    width: 60,
    textAlign: 'right',
  },
  noPredValue: {
    color: '#666',
  },

  // Finished stats rows
  finishedStatsContainer: {
    gap: 8,
    paddingHorizontal: 4,
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

  // General empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubText: {
    color: '#b9ccb2',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 20,
  },
  miniFlag: {
    width: 20,
    height: 14,
    borderRadius: 2,
  },
});
