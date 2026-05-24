/**
 * app/simulation-panel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel de administración solo para admins.
 * Acceso: tocar el logo TIKI-TAKA 5 veces en el Dashboard.
 *
 * Funcionalidades:
 *  1. Toggle Simulación / Real (app_config)
 *  2. Selector de velocidad + botón Iniciar Simulación
 *  3. Countdown hasta fin del Mundial
 *  4. Reset completo (RPC reset_simulation)
 *  5. Recalcular puntos (RPC recalcular_todos_los_puntos)
 *  6. Estadísticas en tiempo real
 *  7. Top 5 global
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';

// ─── Constantes de color ──────────────────────────────────────────────────────
const GRN  = '#00FF41';
const RED  = '#ff4b4b';
const AMB  = '#ffb347';
const CARD = '#1a1a1a';
const BG   = '#0d0d0d';
const MID  = '#242424';
const DIM  = '#555';
const DIM2 = '#888';

// ─── Opciones de duración ─────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { label: '15 min',  value: 15  },
  { label: '30 min',  value: 30  },
  { label: '1 hora',  value: 60  },
  { label: '2 horas', value: 120 },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
type AppConfig = {
  simulation_mode: boolean;
  data_source: string;
  simulation_duration_minutes: number;
  simulation_end_at: string | null;
};
type Stats = {
  totalMatches: number;
  finishedMatches: number;
  scheduledMatches: number;
  totalPredictions: number;
  totalUsers: number;
};
type LeaderRow = { username: string; total_points: number; group_name: string };

// ─── Helper: formatear countdown ─────────────────────────────────────────────
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'FINALIZADO';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  return `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SimulationPanel() {
  const router = useRouter();

  // Estado general
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [config, setConfig]           = useState<AppConfig>({
    simulation_mode: true,
    data_source: 'script',
    simulation_duration_minutes: 30,
    simulation_end_at: null,
  });
  const [stats, setStats]             = useState<Stats | null>(null);
  const [top5, setTop5]               = useState<LeaderRow[]>([]);

  // Estado de acciones
  const [busyReset, setBusyReset]     = useState(false);
  const [busyRecalc, setBusyRecalc]   = useState(false);
  const [busySim, setBusySim]         = useState(false);

  // Velocidad seleccionada
  const [selectedDuration, setSelectedDuration] = useState(30);

  // Countdown
  const [countdown, setCountdown] = useState<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [cfgRes, matchRes, predRes, userRes, topRes] = await Promise.all([
        supabase.from('app_config').select('key, value'),
        supabase.from('matches').select('status'),
        supabase.from('predictions').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase
          .from('leaderboard')
          .select('total_points, users(username), groups(name)')
          .order('total_points', { ascending: false })
          .limit(5),
      ]);

      // Config
      if (cfgRes.data) {
        const raw: Record<string, string> = {};
        cfgRes.data.forEach((r: any) => { raw[r.key] = r.value; });
        const endAt = raw['simulation_end_at'] || null;
        const dur   = parseInt(raw['simulation_duration_minutes'] ?? '30', 10);
        setConfig({
          simulation_mode:             raw['simulation_mode'] === 'true',
          data_source:                 raw['data_source'] ?? 'script',
          simulation_duration_minutes: isNaN(dur) ? 30 : dur,
          simulation_end_at:           endAt && endAt.length > 0 ? endAt : null,
        });
        setSelectedDuration(isNaN(dur) ? 30 : dur);
        startCountdown(endAt && endAt.length > 0 ? endAt : null);
      }

      // Stats
      if (matchRes.data) {
        const matches = matchRes.data as { status: string }[];
        setStats({
          totalMatches:     matches.length,
          finishedMatches:  matches.filter(m => m.status === 'finished').length,
          scheduledMatches: matches.filter(m => m.status === 'scheduled').length,
          totalPredictions: predRes.count ?? 0,
          totalUsers:       userRes.count ?? 0,
        });
      }

      // Top 5
      if (topRes.data) {
        setTop5(topRes.data.map((r: any) => ({
          username:     r.users?.username ?? 'Usuario',
          total_points: r.total_points ?? 0,
          group_name:   r.groups?.name  ?? '—',
        })));
      }
    } catch (e) {
      console.error('[SimPanel] Error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  // ─── Countdown ───────────────────────────────────────────────────────────────
  const startCountdown = (endAt: string | null) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!endAt) { setCountdown(0); return; }
    const end = new Date(endAt).getTime();
    const tick = () => setCountdown(Math.max(0, end - Date.now()));
    tick();
    countdownRef.current = setInterval(tick, 1000);
  };

  // ─── Toggle modo ─────────────────────────────────────────────────────────────
  const toggleSimMode = async (val: boolean) => {
    setConfig(prev => ({ ...prev, simulation_mode: val }));
    const { error } = await supabase
      .from('app_config')
      .update({ value: val ? 'true' : 'false', updated_at: new Date().toISOString() })
      .eq('key', 'simulation_mode');
    if (error) {
      Alert.alert('Error', error.message);
      setConfig(prev => ({ ...prev, simulation_mode: !val }));
    }
  };

  // ─── Iniciar Simulación Completa ────────────────────────────────────────────────
  const handleIniciarSim = () => {
    const opt = DURATION_OPTIONS.find(o => o.value === selectedDuration);
    Alert.alert(
      '🚀 Iniciar Simulación Completa',
      `Se realizará un reset total, se generarán predicciones y early picks para todos los usuarios, y se distribuirán los 104 partidos en ${opt?.label}.\n\n¿Confirmar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'INICIAR',
          onPress: async () => {
            setBusySim(true);
            const { data, error } = await supabase.rpc('iniciar_simulacion_completa', {
              duracion_minutos: selectedDuration,
            });
            setBusySim(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              const res = data as any;
              const endDate = new Date(res.ends_at);
              Alert.alert(
                '✅ Simulación Iniciada',
                `${res.matches_updated} kickoffs actualizados.\nFinaliza: ${endDate.toLocaleTimeString()}`
              );
              startCountdown(res.ends_at);
              setConfig(prev => ({
                ...prev,
                simulation_duration_minutes: selectedDuration,
                simulation_end_at: res.ends_at,
              }));
              loadAll();
            }
          },
        },
      ]
    );
  };

  // ─── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = () => {
    Alert.alert(
      '⚠️ Reset Completo',
      'Eliminará TODAS las predicciones, reiniciará el leaderboard a 0 y limpiará todos los scores. ¿Confirmar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'RESET',
          style: 'destructive',
          onPress: async () => {
            setBusyReset(true);
            const { error } = await supabase.rpc('reset_simulation');
            setBusyReset(false);
            if (error) {
              Alert.alert('Error en Reset', error.message);
            } else {
              Alert.alert('✅ Reset Completo', 'Todo limpiado correctamente.');
              loadAll();
            }
          },
        },
      ]
    );
  };

  // ─── Recalcular ───────────────────────────────────────────────────────────────
  const handleRecalc = async () => {
    setBusyRecalc(true);
    const { data, error } = await supabase.rpc('recalcular_todos_los_puntos');
    setBusyRecalc(false);
    if (error) {
      Alert.alert('Error en Recálculo', error.message);
    } else {
      const r = data as any;
      Alert.alert('✅ Recálculo Completo', `${r?.matches_processed ?? '?'} partidos · ${r?.errors ?? 0} errores.`);
      loadAll();
    }
  };

  // ─── Loading screen ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={GRN} />
        <Text style={styles.loadingText}>Cargando panel...</Text>
      </View>
    );
  }

  const pct = stats ? Math.round((stats.finishedMatches / Math.max(stats.totalMatches, 1)) * 100) : 0;
  const simActive = config.simulation_end_at != null && countdown > 0;
  const endDate   = config.simulation_end_at ? new Date(config.simulation_end_at) : null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GRN} />}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={GRN} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>PANEL ADMIN</Text>
          <Text style={styles.headerSub}>TikiTaka · Simulación WC2026</Text>
        </View>
        <View style={styles.adminBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#000" />
          <Text style={styles.adminBadgeText}>ADMIN</Text>
        </View>
      </View>

      {/* ── Banner modo activo ── */}
      <View style={[styles.modeBanner, config.simulation_mode ? styles.modeSim : styles.modeReal]}>
        <Text style={styles.modeIcon}>{config.simulation_mode ? '🧪' : '⚽'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.modeTitle}>
            {config.simulation_mode ? 'MODO SIMULACIÓN' : 'MODO REAL'}
          </Text>
          <Text style={styles.modeSub}>
            {config.simulation_mode
              ? 'Resultados desde Supabase · API externa desactivada'
              : 'Resultados desde WC2026 API en vivo · Mundial real'}
          </Text>
        </View>
      </View>

      {/* ── COUNTDOWN ── */}
      {simActive && (
        <View style={styles.countdownCard}>
          <View style={styles.countdownHeader}>
            <Ionicons name="timer-outline" size={16} color={AMB} />
            <Text style={styles.countdownLabel}>SIMULACIÓN EN CURSO</Text>
          </View>
          <Text style={styles.countdownTime}>{formatCountdown(countdown)}</Text>
          <Text style={styles.countdownSub}>
            Finaliza: {endDate?.toLocaleDateString()} {endDate?.toLocaleTimeString()}
          </Text>
          {/* Barra progreso countdown */}
          {config.simulation_duration_minutes > 0 && (
            (() => {
              const totalMs = config.simulation_duration_minutes * 60000;
              const remaining = countdown;
              const elapsed = Math.max(0, totalMs - remaining);
              const cdPct = Math.min(100, Math.round((elapsed / totalMs) * 100));
              return (
                <View style={styles.cdBarBg}>
                  <View style={[styles.cdBarFill, { width: `${cdPct}%` as any }]} />
                </View>
              );
            })()
          )}
        </View>
      )}

      {/* ── CONFIGURACIÓN ── */}
      <SectionTitle label="CONFIGURACIÓN" icon="settings-outline" />
      <View style={styles.card}>
        <ConfigRow
          label="Modo Simulación"
          sub={config.simulation_mode ? 'Lee resultados de Supabase' : 'Consulta WC2026 API real'}
          value={config.simulation_mode}
          onToggle={toggleSimMode}
        />
        <View style={styles.separator} />
        <InfoRow label="Fuente de datos" value={config.data_source} />
        <InfoRow label="Activar MODO REAL el" value="11 junio 2026" valueColor={GRN} />
      </View>

      {/* ── VELOCIDAD DE SIMULACIÓN ── */}
      <SectionTitle label="VELOCIDAD DE SIMULACIÓN" icon="speedometer-outline" />
      <View style={styles.card}>
        <Text style={styles.speedTitle}>Duración total del Mundial simulado</Text>
        <Text style={styles.speedSub}>
          El job de Railway detectará cada partido a medida que su kickoff_utc pase y calculará puntos en tiempo real.
        </Text>

        {/* Selector de duración */}
        <View style={styles.durationGrid}>
          {DURATION_OPTIONS.map(opt => {
            const active = selectedDuration === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.durationBtn, active && styles.durationBtnActive]}
                onPress={() => setSelectedDuration(opt.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.durationLabel, active && styles.durationLabelActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Desglose de fases */}
        <View style={styles.phaseBreakdown}>
          {[
            { phase: 'Grupos (72)',  pct: 40 },
            { phase: 'R32 (16)',     pct: 15 },
            { phase: 'R16 (8)',      pct: 10 },
            { phase: 'QF (4)',       pct: 10 },
            { phase: 'SF (2)',       pct: 10 },
            { phase: '3er lugar',    pct:  5 },
            { phase: 'Final',        pct: 10 },
          ].map(({ phase, pct: p }) => {
            const mins = Math.round((p / 100) * selectedDuration);
            return (
              <View key={phase} style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>{phase}</Text>
                <View style={styles.phaseMiniBar}>
                  <View style={[styles.phaseMiniBarFill, { width: `${p}%` as any }]} />
                </View>
                <Text style={styles.phaseTime}>~{mins}m</Text>
              </View>
            );
          })}
        </View>

        {/* Botón Iniciar */}
        <TouchableOpacity
          style={[styles.startBtn, busySim && styles.startBtnDisabled]}
          onPress={handleIniciarSim}
          disabled={busySim}
          activeOpacity={0.8}
        >
          {busySim
            ? <ActivityIndicator color="#000" size="small" />
            : <Ionicons name="play-circle" size={20} color="#000" />
          }
          <Text style={styles.startBtnText}>
            {busySim ? 'Iniciando...' : `INICIAR SIMULACIÓN (${DURATION_OPTIONS.find(o=>o.value===selectedDuration)?.label})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── ACCIONES ── */}
      <SectionTitle label="ACCIONES" icon="flash-outline" />
      <View style={styles.actionGrid}>
        <ActionButton
          label="Recalcular Puntos"
          sub="Recorre todos los partidos finished y recalcula"
          icon="calculator-outline"
          color={GRN}
          busy={busyRecalc}
          onPress={handleRecalc}
        />
        <ActionButton
          label="Reset Completo"
          sub="Borra predicciones, limpia scores y leaderboard"
          icon="trash-outline"
          color={RED}
          busy={busyReset}
          onPress={handleReset}
          danger
        />
      </View>

      {/* ── ESTADÍSTICAS ── */}
      <SectionTitle label="ESTADÍSTICAS" icon="bar-chart-outline" />
      {stats && (
        <>
          <View style={styles.card}>
            <Text style={styles.progressLabel}>Progreso del Mundial</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.progressPct}>{stats.finishedMatches}/{stats.totalMatches} partidos · {pct}%</Text>
          </View>

          <View style={styles.statsGrid}>
            <StatCard label="Terminados"  value={stats.finishedMatches}  icon="checkmark-circle-outline" color={GRN}      />
            <StatCard label="Por jugar"   value={stats.scheduledMatches} icon="time-outline"             color={AMB}      />
            <StatCard label="Predicciones" value={stats.totalPredictions} icon="create-outline"          color="#4fc3f7"  />
            <StatCard label="Usuarios"    value={stats.totalUsers}        icon="people-outline"           color="#ce93d8"  />
          </View>
        </>
      )}

      {/* ── TOP 5 ── */}
      <SectionTitle label="TOP 5 GLOBAL" icon="trophy-outline" />
      <View style={styles.card}>
        {top5.length === 0 ? (
          <Text style={styles.emptyText}>Sin datos de leaderboard aún.</Text>
        ) : (
          top5.map((row, i) => (
            <View key={i} style={[styles.top5Row, i < top5.length - 1 && styles.top5Separator]}>
              <Text style={[styles.top5Pos, i < 3 && { color: GRN }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.top5User}>{row.username}</Text>
                <Text style={styles.top5Group}>{row.group_name}</Text>
              </View>
              <Text style={styles.top5Pts}>{row.total_points} pts</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as any} size={14} color={DIM} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function ConfigRow({ label, sub, value, onToggle }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.configRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.configLabel}>{label}</Text>
        <Text style={styles.configSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#333', true: GRN + '80' }}
        thumbColor={value ? GRN : '#888'}
      />
    </View>
  );
}

function InfoRow({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={styles.configInfoRow}>
      <Text style={styles.configLabel}>{label}</Text>
      <Text style={[styles.configValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, sub, icon, color, busy, onPress, danger = false }: {
  label: string; sub: string; icon: string; color: string;
  busy: boolean; onPress: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, danger && styles.actionBtnDanger]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
    >
      {busy
        ? <ActivityIndicator color={danger ? RED : GRN} size="small" style={{ marginBottom: 8 }} />
        : <Ionicons name={icon as any} size={26} color={color} style={{ marginBottom: 8 }} />
      }
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string; value: number; icon: string; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: BG, paddingTop: 56 },
  loadingContainer: { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' },
  loadingText:      { color: GRN, marginTop: 16, fontSize: 14 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20, gap: 12 },
  backBtn:        { padding: 8, backgroundColor: MID, borderRadius: 8 },
  headerTitle:    { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  headerSub:      { color: DIM, fontSize: 11 },
  adminBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: GRN, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, gap: 4 },
  adminBadgeText: { color: '#000', fontSize: 9, fontWeight: '900' },

  // Mode Banner
  modeBanner:  { marginHorizontal: 20, borderRadius: 10, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, borderWidth: 1 },
  modeSim:     { backgroundColor: '#0d1f0d', borderColor: GRN + '50' },
  modeReal:    { backgroundColor: '#1f0d0d', borderColor: RED + '50' },
  modeIcon:    { fontSize: 28 },
  modeTitle:   { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 2 },
  modeSub:     { color: DIM, fontSize: 11 },

  // Countdown
  countdownCard: {
    marginHorizontal: 20, marginBottom: 20, backgroundColor: '#1a1500',
    borderRadius: 10, padding: 16, borderWidth: 1, borderColor: AMB + '60',
  },
  countdownHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  countdownLabel:  { color: AMB, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  countdownTime:   { color: AMB, fontSize: 40, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  countdownSub:    { color: DIM2, fontSize: 11, marginTop: 4, marginBottom: 10 },
  cdBarBg:         { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  cdBarFill:       { height: '100%', backgroundColor: AMB, borderRadius: 2 },

  // Sections
  sectionTitle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10, gap: 6, marginTop: 6 },
  sectionLabel: { color: DIM, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  // Card
  card:      { backgroundColor: CARD, marginHorizontal: 20, borderRadius: 10, padding: 16, marginBottom: 16 },
  separator: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 10 },

  // Config
  configRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  configLabel:   { color: '#ccc', fontSize: 13, fontWeight: '700' },
  configSub:     { color: DIM, fontSize: 11, marginTop: 2 },
  configInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  configValue:   { color: '#ccc', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Speed selector
  speedTitle:   { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  speedSub:     { color: DIM, fontSize: 11, marginBottom: 14, lineHeight: 16 },
  durationGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  durationBtn:  {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#242424', borderWidth: 1, borderColor: '#333',
    alignItems: 'center',
  },
  durationBtnActive:  { backgroundColor: GRN + '18', borderColor: GRN },
  durationLabel:      { color: DIM2, fontSize: 12, fontWeight: '700' },
  durationLabelActive:{ color: GRN },

  // Phase breakdown
  phaseBreakdown: { marginBottom: 16 },
  phaseRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  phaseLabel:     { color: DIM2, fontSize: 11, width: 80 },
  phaseMiniBar:   { flex: 1, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden' },
  phaseMiniBarFill: { height: '100%', backgroundColor: GRN + '80', borderRadius: 2 },
  phaseTime:      { color: DIM2, fontSize: 11, width: 36, textAlign: 'right' },

  // Start button
  startBtn: {
    backgroundColor: GRN, borderRadius: 8, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText:     { color: '#000', fontWeight: '900', fontSize: 13 },

  // Action Buttons
  actionGrid:      { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  actionBtn:       { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  actionBtnDanger: { borderColor: RED + '40' },
  actionLabel:     { fontWeight: '800', fontSize: 13, marginBottom: 4, textAlign: 'center' },
  actionSub:       { color: DIM, fontSize: 10, textAlign: 'center' },

  // Progress
  progressLabel:   { color: '#ccc', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  progressBarBg:   { height: 8, backgroundColor: '#2a2a2a', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: GRN, borderRadius: 4 },
  progressPct:     { color: DIM, fontSize: 11, marginTop: 6, textAlign: 'right' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  statCard: {
    backgroundColor: CARD, borderRadius: 10, padding: 14, width: '47%',
    alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a',
  },
  statValue: { fontSize: 28, fontWeight: '900', marginBottom: 4 },
  statLabel: { color: DIM, fontSize: 10, textAlign: 'center', fontWeight: '600' },

  // Top 5
  top5Row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  top5Separator: { borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  top5Pos:       { color: DIM, fontWeight: '900', fontSize: 18, width: 28 },
  top5User:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  top5Group:     { color: DIM, fontSize: 11 },
  top5Pts:       { color: GRN, fontSize: 16, fontWeight: '900' },
  emptyText:     { color: DIM, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
});
