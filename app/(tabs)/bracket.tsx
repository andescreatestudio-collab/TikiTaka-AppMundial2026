import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, FlatList,
} from 'react-native';
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
  NZL: 'nz', HAI: 'ht', PAN: 'pa', CUW: 'cw',
};

const ROUND_LABELS: Record<string, string> = {
  R32: 'OCTAVOS (R32)',
  R16: 'DIECISEISAVOS (R16)',
  QF: 'CUARTOS DE FINAL',
  SF: 'SEMIFINAL',
  '3rd': 'TERCER LUGAR',
  final: 'GRAN FINAL',
};

const KNOCKOUT_ORDER = ['R32', 'R16', 'QF', 'SF', '3rd', 'final'];

const getFlagUrl = (code: string | undefined) => {
  if (!code) return null;
  const iso2 = TEAM_TO_ISO2[code];
  return iso2 ? `https://flagcdn.com/w80/${iso2}.png` : null;
};

type Team = { id: string; name: string; code: string; flag_emoji: string };
type Match = {
  id: string;
  match_number: number;
  round: string;
  group_name: string | null;
  kickoff_utc: string;
  home_score: number | null;
  away_score: number | null;
  home_team: Team | null;
  away_team: Team | null;
};
type TeamStat = {
  team: Team;
  pj: number; g: number; e: number; p: number;
  gf: number; gc: number; dg: number; pts: number;
};

// ─── Calcular Tabla de posiciones de un grupo ────────────────────────────────
function calcGroupTable(groupName: string, matches: Match[], groupTeams: Team[]): TeamStat[] {
  const stats: Record<string, TeamStat> = {};

  // Inicializar exactamente los 4 equipos del grupo
  groupTeams.forEach(team => {
    stats[team.id] = {
      team,
      pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0
    };
  });

  matches.forEach(m => {
    // Filtro estricto: solo partidos con round = 'group' Y group_name del grupo correspondiente
    if (m.round !== 'group' || m.group_name !== groupName) return;

    if (!m.home_team || !m.away_team) return;

    // Solo procesar si ambos equipos pertenecen a este grupo
    const h = stats[m.home_team.id];
    const a = stats[m.away_team.id];
    if (!h || !a) return;

    if (m.home_score === null || m.away_score === null) return;

    const hs = m.home_score, as_ = m.away_score;

    h.pj++; a.pj++;
    h.gf += hs; h.gc += as_; h.dg = h.gf - h.gc;
    a.gf += as_; a.gc += hs; a.dg = a.gf - a.gc;

    if (hs > as_) { h.g++; h.pts += 3; a.p++; }
    else if (hs < as_) { a.g++; a.pts += 3; h.p++; }
    else { h.e++; h.pts++; a.e++; a.pts++; }
  });

  return Object.values(stats).sort((a, b) =>
    b.pts - a.pts || b.dg - a.dg || b.gf - a.gf
  );
}

// ─── Componente: Fila de equipo en la tabla de grupo ─────────────────────────
function GroupRow({ stat, position }: { stat: TeamStat; position: number }) {
  const flagUrl = getFlagUrl(stat.team.code);
  const isQualified = position <= 2;
  return (
    <View style={[styles.groupRow, isQualified && styles.groupRowQualified]}>
      <Text style={styles.groupPos}>{position}</Text>
      {flagUrl ? (
        <Image source={{ uri: flagUrl }} style={styles.rowFlag} resizeMode="contain" />
      ) : (
        <Text style={{ fontSize: 16, marginRight: 6 }}>🏳️</Text>
      )}
      <Text style={styles.groupTeamCode} numberOfLines={1}>{stat.team.code}</Text>
      <Text style={styles.groupStat}>{stat.pj}</Text>
      <Text style={styles.groupStat}>{stat.g}</Text>
      <Text style={styles.groupStat}>{stat.e}</Text>
      <Text style={styles.groupStat}>{stat.p}</Text>
      <Text style={[styles.groupStat, { color: stat.dg > 0 ? '#00FF41' : stat.dg < 0 ? '#ff4b4b' : '#b9ccb2' }]}>
        {stat.dg > 0 ? `+${stat.dg}` : stat.dg}
      </Text>
      <Text style={[styles.groupStat, styles.groupPts]}>{stat.pts}</Text>
    </View>
  );
}

// ─── Componente: Tarjeta de grupo ─────────────────────────────────────────────
function GroupCard({ groupName, matches, groupTeams }: { groupName: string; matches: Match[]; groupTeams: Team[] }) {
  const table = calcGroupTable(groupName, matches, groupTeams);
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupTitle}>GRUPO {groupName}</Text>
      <View style={styles.groupHeader}>
        <Text style={[styles.groupHeaderTxt, { width: 20 }]}>#</Text>
        <Text style={[styles.groupHeaderTxt, { width: 28 }]}></Text>
        <Text style={[styles.groupHeaderTxt, { flex: 1 }]}>EQ</Text>
        <Text style={styles.groupHeaderTxt}>PJ</Text>
        <Text style={styles.groupHeaderTxt}>G</Text>
        <Text style={styles.groupHeaderTxt}>E</Text>
        <Text style={styles.groupHeaderTxt}>P</Text>
        <Text style={styles.groupHeaderTxt}>DG</Text>
        <Text style={[styles.groupHeaderTxt, styles.groupPts]}>PTS</Text>
      </View>
      {table.map((stat, idx) => (
        <GroupRow key={stat.team.id} stat={stat} position={idx + 1} />
      ))}
    </View>
  );
}

// ─── Componente: Partido de eliminatorias ────────────────────────────────────
function KnockoutMatchCard({ match }: { match: Match }) {
  const homeFlag = getFlagUrl(match.home_team?.code);
  const awayFlag = getFlagUrl(match.away_team?.code);
  const hasScore = match.home_score !== null && match.away_score !== null;
  const timeStr = new Date(match.kickoff_utc).toLocaleString([], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });

  return (
    <View style={styles.koCard}>
      <Text style={styles.koDate}>{timeStr}</Text>
      <View style={styles.koTeamRow}>
        {homeFlag
          ? <Image source={{ uri: homeFlag }} style={styles.koFlag} resizeMode="contain" />
          : <Text style={styles.koFlagPlaceholder}>🏳️</Text>
        }
        <Text style={styles.koTeamCode}>{match.home_team?.code || 'TBD'}</Text>
        <View style={styles.koScore}>
          {hasScore ? (
            <>
              <Text style={[styles.koScoreNum, (match.home_score! > match.away_score!) && styles.koWinner]}>
                {match.home_score}
              </Text>
              <Text style={styles.koDash}>-</Text>
              <Text style={[styles.koScoreNum, (match.away_score! > match.home_score!) && styles.koWinner]}>
                {match.away_score}
              </Text>
            </>
          ) : (
            <Text style={styles.koVs}>vs</Text>
          )}
        </View>
        <Text style={styles.koTeamCode}>{match.away_team?.code || 'TBD'}</Text>
        {awayFlag
          ? <Image source={{ uri: awayFlag }} style={styles.koFlag} resizeMode="contain" />
          : <Text style={styles.koFlagPlaceholder}>🏳️</Text>
        }
      </View>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function BracketScreen() {
  const [view, setView] = useState<'groups' | 'knockout'>('groups');
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    fetchMatches();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMatches(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMatches = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [matchesRes, teamsRes] = await Promise.all([
        supabase
          .from('matches')
          .select(`
            id, match_number, round, group_name, kickoff_utc, home_score, away_score,
            home_team:teams!home_team_id(id, name, code, flag_emoji),
            away_team:teams!away_team_id(id, name, code, flag_emoji)
          `)
          .order('match_number', { ascending: true }),
        supabase
          .from('teams')
          .select('id, name, code, flag_emoji, group_name')
      ]);

      if (matchesRes.error) throw matchesRes.error;
      if (teamsRes.error) throw teamsRes.error;

      setMatches((matchesRes.data as Match[]) || []);
      setTeams((teamsRes.data as Team[]) || []);
    } catch (e) {
      console.error('Error cargando bracket:', e);
    } finally {
      setLoading(false);
    }
  };

  const groupMatches = matches.filter(m => m.round === 'group');
  const koMatches = matches.filter(m => m.round !== 'group');

  const byGroup: Record<string, Match[]> = {};
  groupMatches.forEach(m => {
    const g = m.group_name || '?';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(m);
  });

  const byRound: Record<string, Match[]> = {};
  koMatches.forEach(m => {
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00FF41" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'groups' && styles.toggleBtnActive]}
          onPress={() => setView('groups')}
        >
          <Text style={[styles.toggleTxt, view === 'groups' && styles.toggleTxtActive]}>
            FASE DE GRUPOS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'knockout' && styles.toggleBtnActive]}
          onPress={() => setView('knockout')}
        >
          <Text style={[styles.toggleTxt, view === 'knockout' && styles.toggleTxtActive]}>
            ELIMINATORIAS
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido */}
      {view === 'groups' ? (
        <ScrollView contentContainerStyle={styles.groupsGrid}>
          {['A','B','C','D','E','F','G','H','I','J','K','L'].map(g => {
            const groupMatchesList = byGroup[g] || [];
            const groupTeamsList = teams.filter(t => t.group_name === g);
            return (
              <GroupCard key={g} groupName={g} matches={groupMatchesList} groupTeams={groupTeamsList} />
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.koScroll}>
          {KNOCKOUT_ORDER.map(round => {
            const roundMatches = byRound[round];
            if (!roundMatches || roundMatches.length === 0) return null;
            return (
              <View key={round} style={styles.koSection}>
                <View style={styles.koRoundHeader}>
                  <View style={styles.koRoundLine} />
                  <Text style={styles.koRoundLabel}>{ROUND_LABELS[round] || round}</Text>
                  <View style={styles.koRoundLine} />
                </View>
                {roundMatches.map(m => <KnockoutMatchCard key={m.id} match={m} />)}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313', paddingTop: 40 },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#201f1f',
  },
  toggleBtnActive: { backgroundColor: '#00FF41' },
  toggleTxt: { color: '#b9ccb2', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  toggleTxtActive: { color: '#000' },

  // Grupos
  groupsGrid: { paddingHorizontal: 12, paddingBottom: 80 },
  groupCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  groupTitle: {
    color: '#00FF41',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3b4b37',
    paddingBottom: 4,
    marginBottom: 4,
  },
  groupHeaderTxt: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    width: 26,
    textAlign: 'center',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  groupRowQualified: { borderLeftColor: '#00FF41' },
  groupPos: { color: '#666', fontSize: 11, width: 20, textAlign: 'center' },
  rowFlag: { width: 22, height: 16, borderRadius: 2, marginRight: 6 },
  groupTeamCode: { color: '#fff', fontSize: 11, fontWeight: '700', flex: 1 },
  groupStat: { color: '#b9ccb2', fontSize: 11, width: 26, textAlign: 'center' },
  groupPts: { color: '#00FF41', fontWeight: '900' },

  // Eliminatorias
  koScroll: { paddingHorizontal: 16, paddingBottom: 80 },
  koSection: { marginBottom: 24 },
  koRoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  koRoundLine: { flex: 1, height: 1, backgroundColor: '#3b4b37' },
  koRoundLabel: {
    color: '#00FF41',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginHorizontal: 10,
  },
  koCard: {
    backgroundColor: '#201f1f',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
  },
  koDate: { color: '#666', fontSize: 10, marginBottom: 8, textAlign: 'center' },
  koTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  koFlag: { width: 32, height: 22, borderRadius: 3 },
  koFlagPlaceholder: { fontSize: 22, width: 32, textAlign: 'center' },
  koTeamCode: { color: '#fff', fontSize: 14, fontWeight: '800', flex: 1, textAlign: 'center' },
  koScore: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  koScoreNum: { color: '#b9ccb2', fontSize: 22, fontWeight: '900', minWidth: 20, textAlign: 'center' },
  koWinner: { color: '#00FF41' },
  koDash: { color: '#666', fontSize: 18 },
  koVs: { color: '#666', fontSize: 12, fontWeight: '700', paddingHorizontal: 8 },
});
