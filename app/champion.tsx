/**
 * champion.tsx — TikiTaka WC2026
 * Pantalla de campeón. Se muestra automáticamente cuando los 104 partidos están finished.
 * Paleta: negro (#131313), verde (#00FF41), dorado (#FFD700).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, Image,
  TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../src/lib/supabase';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Mapa de código de equipo → ISO-2 para flagcdn ─────────────────────────────
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
  NZL: 'nz', HAI: 'ht', PAN: 'pa', CUW: 'cw',
};

const getFlagUrl = (code: string | undefined) => {
  if (!code) return null;
  const iso2 = TEAM_TO_ISO2[code];
  return iso2 ? `https://flagcdn.com/w160/${iso2}.png` : null;
};

// ── Partícula de confeti ───────────────────────────────────────────────────────
const COLORS = ['#FFD700', '#00FF41', '#ffffff', '#ff4b4b', '#4bf5ff', '#ff9e00'];

function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const rot  = useRef(new Animated.Value(0)).current;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size  = 6 + Math.random() * 8;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1, duration: 2400 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(rot, {
            toValue: 1, duration: 2400 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          Animated.timing(rot, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, SH + 40] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 30 * (Math.random() > 0.5 ? 1 : -1), 0] });
  const opacity    = anim.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const rotate     = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * (Math.random() > 0.5 ? 2 : -3)}deg`] });

  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          left: x, width: size, height: size,
          backgroundColor: color,
          borderRadius: Math.random() > 0.5 ? size / 2 : 2,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

function Confetti() {
  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * SW,
    delay: Math.random() * 2000,
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map(p => <ConfettiParticle key={p.id} x={p.x} delay={p.delay} />)}
    </View>
  );
}

// ── Componente Medalla ─────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function PodiumEntry({ rank, username, points, isMe }: {
  rank: number; username: string; points: number; isMe: boolean;
}) {
  return (
    <View style={[
      styles.podiumEntry,
      { borderColor: MEDAL_COLORS[rank - 1] || '#3b4b37' },
      isMe && styles.podiumEntryMe,
    ]}>
      <Text style={styles.podiumMedal}>{MEDALS[rank - 1] || `#${rank}`}</Text>
      <Text style={styles.podiumUser} numberOfLines={1}>
        {username}{isMe ? ' (tú)' : ''}
      </Text>
      <Text style={[styles.podiumPoints, { color: MEDAL_COLORS[rank - 1] || '#00FF41' }]}>
        {points} pts
      </Text>
    </View>
  );
}

// ── Pantalla principal ─────────────────────────────────────────────────────────
type LeaderboardEntry = { user_id: string; total_points: number; users: { username: string } };
type ChampionData = {
  team: { name: string; code: string };
  homeScore: number;
  awayScore: number;
  runnerUp: { name: string; code: string };
  homePenalties?: number | null;
  awayPenalties?: number | null;
};

export default function ChampionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();

  const [champion, setChampion]     = useState<ChampionData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userId, setUserId]         = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  // Animaciones de entrada
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  const scale   = useRef(new Animated.Value(0.7)).current;
  const glow    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      // Secuencia de entrada épica
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(fadeIn,  { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.spring(slideUp, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
          Animated.spring(scale,   { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }),
        ]),
      ]).start();

      // Pulso dorado continuo en la copa
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [loading]);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      // 1. Partido final (match_number = 104 o round = 'final')
      const { data: finals } = await supabase
        .from('matches')
        .select(`
          home_score, away_score, home_penalties, away_penalties,
          home_team:teams!home_team_id(name, code),
          away_team:teams!away_team_id(name, code)
        `)
        .eq('round', 'final')
        .not('home_score', 'is', null)
        .limit(1)
        .single();

      if (finals) {
        const hs = finals.home_score ?? 0;
        const as_ = finals.away_score ?? 0;
        const hp = finals.home_penalties as number | null;
        const ap = finals.away_penalties as number | null;

        // Determinar ganador considerando penales
        const homeWins = hp !== null && ap !== null
          ? hp > ap
          : hs > as_;

        const winner  = homeWins ? finals.home_team : finals.away_team;
        const loser   = homeWins ? finals.away_team : finals.home_team;

        setChampion({
          team:       winner   as { name: string; code: string },
          runnerUp:   loser    as { name: string; code: string },
          homeScore:  hs,
          awayScore:  as_,
          homePenalties: hp,
          awayPenalties: ap,
        });
      }

      // 2. Leaderboard del grupo activo
      const groupId = params.groupId;
      if (groupId) {
        const { data: lbData } = await supabase
          .from('leaderboard')
          .select('user_id, total_points, users(username)')
          .eq('group_id', groupId)
          .order('total_points', { ascending: false })
          .limit(10);

        if (lbData && lbData.length > 0) {
          setLeaderboard(lbData as LeaderboardEntry[]);
        }
      } else {
        // Sin groupId, buscar primer grupo del usuario
        const { data: gm } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user?.id ?? '')
          .limit(1)
          .single();

        if (gm?.group_id) {
          const { data: lbData } = await supabase
            .from('leaderboard')
            .select('user_id, total_points, users(username)')
            .eq('group_id', gm.group_id)
            .order('total_points', { ascending: false })
            .limit(10);

          if (lbData) setLeaderboard(lbData as LeaderboardEntry[]);
        }
      }
    } catch (e) {
      console.error('[ChampionScreen] Error cargando datos:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Animated.Text style={styles.loadingTrophy}>🏆</Animated.Text>
      </View>
    );
  }

  const flagUrl    = champion ? getFlagUrl(champion.team.code) : null;
  const ruFlagUrl  = champion ? getFlagUrl(champion.runnerUp?.code) : null;
  const top3       = leaderboard.slice(0, 3);
  const winner1    = leaderboard[0];

  // Marcador de la final
  const homeTeam = champion?.team;   // el ganador siempre es "local" en nuestra presentación
  const scoreStr = champion
    ? `${champion.homeScore} — ${champion.awayScore}`
    : '';
  const penaltiesStr = (champion?.homePenalties !== null && champion?.awayPenalties !== null)
    ? `(${champion?.homePenalties} - ${champion?.awayPenalties} pen.)`
    : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Confetti />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

          {/* ── Título CAMPEÓN ── */}
          <View style={styles.titleRow}>
            <View style={styles.titleLine} />
            <Text style={styles.titleLabel}>CAMPEÓN DEL MUNDO</Text>
            <View style={styles.titleLine} />
          </View>
          <Text style={styles.titleSub}>FIFA WORLD CUP 2026™</Text>

          {/* ── Copa + Bandera ── */}
          <Animated.View style={[styles.trophyWrap, { transform: [{ scale: glow }] }]}>
            <Text style={styles.trophy}>🏆</Text>
          </Animated.View>

          {champion && (
            <Animated.View style={[styles.champCard, { transform: [{ scale }] }]}>
              {flagUrl && (
                <Image
                  source={{ uri: flagUrl }}
                  style={styles.champFlag}
                  resizeMode="cover"
                />
              )}
              <Text style={styles.champName}>{champion.team.name?.toUpperCase()}</Text>
              <Text style={styles.champCode}>{champion.team.code}</Text>
            </Animated.View>
          )}

          {/* ── Marcador Final ── */}
          {champion && (
            <View style={styles.finalCard}>
              <Text style={styles.finalLabel}>⚽ FINAL · GRAN FINAL</Text>
              <View style={styles.finalScoreRow}>
                <View style={styles.finalTeamCol}>
                  {flagUrl && (
                    <Image source={{ uri: flagUrl }} style={styles.finalFlag} resizeMode="contain" />
                  )}
                  <Text style={styles.finalTeamCode}>{champion.team.code}</Text>
                </View>
                <View style={styles.finalScoreBox}>
                  <Text style={styles.finalScore}>{champion.homeScore}</Text>
                  <Text style={styles.finalDash}>–</Text>
                  <Text style={styles.finalScore}>{champion.awayScore}</Text>
                </View>
                <View style={styles.finalTeamCol}>
                  {ruFlagUrl && (
                    <Image source={{ uri: ruFlagUrl }} style={styles.finalFlag} resizeMode="contain" />
                  )}
                  <Text style={styles.finalTeamCode}>{champion.runnerUp?.code}</Text>
                </View>
              </View>
              {penaltiesStr !== '' && (
                <Text style={styles.finalPenalties}>{penaltiesStr}</Text>
              )}
            </View>
          )}

          {/* ── Ganador de la Quiniela ── */}
          {winner1 && (
            <View style={styles.quinielaCard}>
              <Text style={styles.quinielaLabel}>🥇 GANADOR DE LA QUINIELA</Text>
              <Text style={styles.quinielaName}>
                {winner1.users?.username || 'Jugador'}
              </Text>
              <Text style={styles.quinielaPoints}>{winner1.total_points} puntos</Text>
            </View>
          )}

          {/* ── Podio Top 3 ── */}
          {top3.length > 0 && (
            <View style={styles.podiumSection}>
              <Text style={styles.podiumTitle}>PODIO DE LA QUINIELA</Text>
              <View style={styles.podiumList}>
                {top3.map((entry, idx) => (
                  <PodiumEntry
                    key={entry.user_id}
                    rank={idx + 1}
                    username={entry.users?.username || 'Jugador'}
                    points={entry.total_points}
                    isMe={entry.user_id === userId}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Botón al Dashboard ── */}
          <TouchableOpacity
            style={styles.dashBtn}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Text style={styles.dashBtnText}>VER TABLA COMPLETA →</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>TikiTaka · WC2026</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered:  { justifyContent: 'center', alignItems: 'center' },
  loadingTrophy: { fontSize: 80 },

  scroll: { paddingBottom: 60 },
  content: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 60 },

  confetti: { position: 'absolute', top: 0 },

  // Título
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titleLine: { flex: 1, height: 1, backgroundColor: '#FFD700' },
  titleLabel: {
    color: '#FFD700', fontSize: 13, fontWeight: '900',
    letterSpacing: 3, textAlign: 'center',
  },
  titleSub: {
    color: '#666', fontSize: 11, letterSpacing: 2,
    marginBottom: 24, fontWeight: '600',
  },

  // Copa
  trophyWrap: { marginBottom: 12 },
  trophy: { fontSize: 100, textAlign: 'center' },

  // Campeón
  champCard: {
    alignItems: 'center',
    marginBottom: 28,
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
    width: SW - 40,
    shadowColor: '#FFD700',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  champFlag: {
    width: 160, height: 104, borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1, borderColor: '#FFD700',
  },
  champName: {
    color: '#FFD700', fontSize: 28, fontWeight: '900',
    letterSpacing: 3, textAlign: 'center', marginBottom: 4,
  },
  champCode: {
    color: '#666', fontSize: 14, fontWeight: '700', letterSpacing: 4,
  },

  // Final
  finalCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 20,
    width: SW - 40,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3b4b37',
    alignItems: 'center',
  },
  finalLabel: {
    color: '#00FF41', fontSize: 11, fontWeight: '900',
    letterSpacing: 2, marginBottom: 16,
  },
  finalScoreRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%',
  },
  finalTeamCol: { alignItems: 'center', flex: 1 },
  finalFlag: { width: 52, height: 36, borderRadius: 4, marginBottom: 8 },
  finalTeamCode: { color: '#fff', fontSize: 14, fontWeight: '800' },
  finalScoreBox: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 12,
  },
  finalScore: {
    color: '#fff', fontSize: 40, fontWeight: '900', minWidth: 30, textAlign: 'center',
  },
  finalDash: { color: '#666', fontSize: 28, fontWeight: '300' },
  finalPenalties: {
    color: '#666', fontSize: 12, marginTop: 10,
    fontStyle: 'italic',
  },

  // Ganador Quiniela
  quinielaCard: {
    backgroundColor: '#1a2e0a',
    borderRadius: 12, padding: 20,
    width: SW - 40, marginBottom: 24,
    borderWidth: 2, borderColor: '#00FF41',
    alignItems: 'center',
    shadowColor: '#00FF41',
    shadowOpacity: 0.25, shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  quinielaLabel: {
    color: '#00FF41', fontSize: 11, fontWeight: '900',
    letterSpacing: 2, marginBottom: 12,
  },
  quinielaName: {
    color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center',
  },
  quinielaPoints: {
    color: '#FFD700', fontSize: 18, fontWeight: '700', marginTop: 6,
  },

  // Podio
  podiumSection: { width: SW - 40, marginBottom: 28 },
  podiumTitle: {
    color: '#b9ccb2', fontSize: 12, fontWeight: '900',
    letterSpacing: 2, marginBottom: 14, textAlign: 'center',
  },
  podiumList: { gap: 8 },
  podiumEntry: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161616', borderRadius: 10,
    padding: 14, borderWidth: 1.5, gap: 12,
  },
  podiumEntryMe: { backgroundColor: '#1a2e0a' },
  podiumMedal: { fontSize: 28, width: 36, textAlign: 'center' },
  podiumUser: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  podiumPoints: { fontSize: 16, fontWeight: '900' },

  // Botón Dashboard
  dashBtn: {
    backgroundColor: '#00FF41',
    paddingVertical: 16, paddingHorizontal: 36,
    borderRadius: 8, marginBottom: 20,
    width: SW - 40, alignItems: 'center',
  },
  dashBtnText: {
    color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1.5,
  },

  // Footer
  footer: { color: '#333', fontSize: 11, letterSpacing: 1, fontWeight: '600' },
});
