// lib/clinical-analysis.mts
// Análisis clínico automatizado de métricas de juegos terapéuticos
// Todas las métricas vuelven procesadas e interpretadas al dashboard y HCE

interface GameMetricRow {
  id: number;
  patient_id: number;
  patient_dni: string;
  game_slug: string;
  metric_type: string;
  metric_value: number | null;
  metric_data: any;
  session_date: string;
  created_at: string;
}

interface MoodRow {
  patient_id: number;
  color_hex: string;
  color_id: string;
  context_type: string;
  source_activity: string;
  created_at: string;
}

interface AnalyzedMetrics {
  // Per-game summaries
  games: Record<string, GameAnalysis>;
  // Global cognitive profile
  cognitiveProfile: CognitiveProfile;
  // Mood trajectory
  moodTrajectory: MoodAnalysis;
  // Event analysis (interruptions, resets = clinical markers)
  sessionBehavior: SessionBehaviorAnalysis;
  // Temporal patterns
  temporalPatterns: TemporalAnalysis;
  // Clinical alerts
  alerts: ClinicalAlert[];
  // Raw counts
  totals: {
    totalSessions: number;
    totalMetrics: number;
    totalEvents: number;
    totalMoodEntries: number;
    uniqueGames: number;
    dateRange: { first: string; last: string } | null;
  };
}

interface GameAnalysis {
  gameSlug: string;
  gameName: string;
  totalSessions: number;
  scores: { avg: number; min: number; max: number; baseline: number; latest: number; trend: string };
  biometrics: {
    avgReactionTime: number | null;
    avgTremor: number | null;
    avgDPrime: number | null;
    commissionErrors: number;
    omissionErrors: number;
    hesitations: number;
  };
  cognitiveMarkers: {
    memoryWorkingRatio: number | null;
    planningRatio: number | null;
    impulsivityIndex: number | null;
    attentionSustained: number | null;
  };
  interpretation: string;
  trend: string; // 'mejorando' | 'estable' | 'declinando' | 'insuficiente'
}

interface CognitiveProfile {
  overallScore: number;
  domains: {
    atencion: { score: number; interpretation: string };
    memoria: { score: number; interpretation: string };
    funcionEjecutiva: { score: number; interpretation: string };
    velocidadProcesamiento: { score: number; interpretation: string };
    controlImpulsos: { score: number; interpretation: string };
  };
  globalInterpretation: string;
}

interface MoodAnalysis {
  entries: number;
  dominantColor: string | null;
  colorDistribution: Record<string, number>;
  trend: string;
  interpretation: string;
}

interface SessionBehaviorAnalysis {
  totalResets: number;
  totalInterruptions: number;
  totalTimeouts: number;
  totalErrors: number;
  avgSessionDuration: number | null;
  completionRate: number | null;
  interpretation: string;
}

interface TemporalAnalysis {
  preferredDays: string[];
  preferredHours: number[];
  sessionsPerWeek: number;
  regularity: string; // 'regular' | 'irregular' | 'esporádico'
}

interface ClinicalAlert {
  type: 'critical' | 'warning' | 'info';
  domain: string;
  message: string;
  metric: string;
  value: number | string;
}

// Game name mapping
const GAME_NAMES: Record<string, string> = {
  'super-market': 'Desafío Milanesas (Supermercado)',
  'lawn-mower': 'Cortadora de Césped',
  'medication-memory': 'Memoria de Medicación',
  'pill-organizer': 'Pastillero',
  'daily-routine': 'Rutina Diaria',
  'fridge-logic': 'Lógica de Heladera',
  'neuro-chef-v2': 'NeuroChef',
  'neuro-chef': 'NeuroChef',
};

// Color name mapping (Lüscher)
const COLOR_NAMES: Record<string, string> = {
  'red': 'Rojo', 'orange': 'Naranja', 'yellow': 'Amarillo', 'green': 'Verde',
  'turquoise': 'Turquesa', 'sky_blue': 'Celeste', 'dark_blue': 'Azul oscuro',
  'violet': 'Violeta', 'pink': 'Rosa', 'brown': 'Marrón', 'grey': 'Gris', 'black': 'Negro'
};

export function analyzeAllMetrics(
  gameMetrics: GameMetricRow[],
  moodEntries: MoodRow[],
  moodCheckins: any[]
): AnalyzedMetrics {

  const alerts: ClinicalAlert[] = [];

  // ── PER-GAME ANALYSIS ──
  const byGame: Record<string, GameMetricRow[]> = {};
  const events: GameMetricRow[] = [];

  for (const m of gameMetrics) {
    if (m.metric_type.startsWith('event_')) {
      events.push(m);
    } else {
      if (!byGame[m.game_slug]) byGame[m.game_slug] = [];
      byGame[m.game_slug].push(m);
    }
  }

  const games: Record<string, GameAnalysis> = {};
  for (const [slug, metrics] of Object.entries(byGame)) {
    games[slug] = analyzeGame(slug, metrics, alerts);
  }

  // ── COGNITIVE PROFILE ──
  const cognitiveProfile = buildCognitiveProfile(games, gameMetrics, alerts);

  // ── MOOD ──
  const moodTrajectory = analyzeMood(moodEntries, moodCheckins, alerts);

  // ── SESSION BEHAVIOR ──
  const sessionBehavior = analyzeSessionBehavior(events, gameMetrics, alerts);

  // ── TEMPORAL ──
  const temporalPatterns = analyzeTemporalPatterns(gameMetrics);

  // ── TOTALS ──
  const dates = gameMetrics.filter(m => m.created_at).map(m => m.created_at).sort();
  const totals = {
    totalSessions: Object.values(games).reduce((s, g) => s + g.totalSessions, 0),
    totalMetrics: gameMetrics.length,
    totalEvents: events.length,
    totalMoodEntries: moodEntries.length + moodCheckins.length,
    uniqueGames: Object.keys(games).length,
    dateRange: dates.length > 0 ? { first: dates[0], last: dates[dates.length - 1] } : null,
  };

  return { games, cognitiveProfile, moodTrajectory, sessionBehavior, temporalPatterns, alerts, totals };
}

function analyzeGame(slug: string, metrics: GameMetricRow[], alerts: ClinicalAlert[]): GameAnalysis {
  const name = GAME_NAMES[slug] || slug;

  // Session scores (from session_summary, session_complete, level_*)
  const sessionMetrics = metrics.filter(m =>
    ['session_summary', 'session_complete'].includes(m.metric_type) || m.metric_type.startsWith('level_')
  );
  const values = sessionMetrics.map(m => m.metric_value).filter((v): v is number => v !== null && !isNaN(v));
  const sorted = [...sessionMetrics].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const baseline = values.length > 0 ? values[0] : 0;
  const latest = values.length > 0 ? values[values.length - 1] : 0;

  // Trend calculation (last 3 vs first 3)
  let trend = 'insuficiente';
  if (values.length >= 3) {
    const firstThird = values.slice(0, Math.ceil(values.length / 3));
    const lastThird = values.slice(-Math.ceil(values.length / 3));
    const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
    const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
    const diff = lastAvg - firstAvg;
    trend = diff > 5 ? 'mejorando' : diff < -5 ? 'declinando' : 'estable';
  }

  // Biometrics (from session_biomet and biometric_level_*)
  const bioMetrics = metrics.filter(m =>
    m.metric_type === 'session_biomet' || m.metric_type.startsWith('biometric_')
  );
  const bioData = bioMetrics.map(m => m.metric_data).filter(Boolean);

  const avgRT = bioData.length > 0 ? bioData.reduce((s, d) => s + (d.reaction_time_ms || d.mean_rt_ms || 0), 0) / bioData.length : null;
  const avgTremor = bioData.length > 0 ? bioData.reduce((s, d) => s + (d.tremor_avg || d.tremor_reposo || 0), 0) / bioData.length : null;
  const avgDPrime = bioData.length > 0 ? bioData.reduce((s, d) => s + (d.d_prime || 0), 0) / bioData.length : null;

  // Cognitive markers from metric_data
  const allData = metrics.map(m => m.metric_data).filter(Boolean);
  const commErrors = allData.reduce((s, d) => s + (d.commission_errors || d.errores_comision || d.false_alarms || 0), 0);
  const omErrors = allData.reduce((s, d) => s + (d.omission_errors || d.errores_omision || d.misses || 0), 0);
  const hesitations = allData.reduce((s, d) => s + (d.hesitation_count || d.hesitations || 0), 0);

  const memRatio = allData.find(d => d.memoria_trabajo_ratio !== undefined)?.memoria_trabajo_ratio ?? null;
  const planRatio = allData.find(d => d.planificacion_ratio !== undefined)?.planificacion_ratio ?? null;
  const impulsivity = allData.find(d => d.impulsividad_compra !== undefined)?.impulsividad_compra ?? null;

  // Interpretation
  let interpretation = `${name}: ${values.length} sesiones registradas.`;
  if (trend === 'mejorando') interpretation += ` Tendencia positiva (baseline ${baseline.toFixed(0)} → último ${latest.toFixed(0)}).`;
  else if (trend === 'declinando') {
    interpretation += ` Tendencia descendente — evaluar posibles causas (medicación, estado anímico, fatiga).`;
    alerts.push({ type: 'warning', domain: slug, message: `Tendencia descendente en ${name}`, metric: 'score_trend', value: trend });
  }
  if (commErrors > 10) {
    interpretation += ` Errores de comisión elevados (${commErrors}) — posible impulsividad.`;
    alerts.push({ type: 'warning', domain: 'control_impulsos', message: `Errores de comisión elevados en ${name}`, metric: 'commission_errors', value: commErrors });
  }

  return {
    gameSlug: slug, gameName: name, totalSessions: values.length,
    scores: { avg: +avg.toFixed(1), min: values.length > 0 ? Math.min(...values) : 0, max: values.length > 0 ? Math.max(...values) : 0, baseline: +baseline.toFixed(1), latest: +latest.toFixed(1), trend },
    biometrics: { avgReactionTime: avgRT ? +avgRT.toFixed(0) : null, avgTremor: avgTremor ? +avgTremor.toFixed(3) : null, avgDPrime: avgDPrime ? +avgDPrime.toFixed(2) : null, commissionErrors: commErrors, omissionErrors: omErrors, hesitations },
    cognitiveMarkers: { memoryWorkingRatio: memRatio, planningRatio: planRatio, impulsivityIndex: impulsivity, attentionSustained: null },
    interpretation, trend,
  };
}

function buildCognitiveProfile(games: Record<string, GameAnalysis>, allMetrics: GameMetricRow[], alerts: ClinicalAlert[]): CognitiveProfile {
  const gameList = Object.values(games);
  if (gameList.length === 0) {
    return {
      overallScore: 0,
      domains: {
        atencion: { score: 0, interpretation: 'Sin datos' },
        memoria: { score: 0, interpretation: 'Sin datos' },
        funcionEjecutiva: { score: 0, interpretation: 'Sin datos' },
        velocidadProcesamiento: { score: 0, interpretation: 'Sin datos' },
        controlImpulsos: { score: 0, interpretation: 'Sin datos' },
      },
      globalInterpretation: 'Datos insuficientes para generar perfil cognitivo. Se requieren al menos 3 sesiones de juego.'
    };
  }

  // Atención: based on omission errors (lower = better) + sustained play time
  const totalOmissions = gameList.reduce((s, g) => s + g.biometrics.omissionErrors, 0);
  const totalSessions = gameList.reduce((s, g) => s + g.totalSessions, 0);
  const atencionScore = totalSessions > 0 ? Math.max(0, Math.min(100, 100 - (totalOmissions / totalSessions) * 20)) : 0;

  // Memoria: from medication-memory and super-market recipe recall
  const memGames = gameList.filter(g => ['medication-memory', 'super-market'].includes(g.gameSlug));
  const memScore = memGames.length > 0 ? memGames.reduce((s, g) => s + g.scores.avg, 0) / memGames.length : gameList.reduce((s, g) => s + g.scores.avg, 0) / gameList.length;

  // Función ejecutiva: from fridge-logic, daily-routine (planning, sequencing)
  const execGames = gameList.filter(g => ['fridge-logic', 'daily-routine', 'neuro-chef-v2'].includes(g.gameSlug));
  const execScore = execGames.length > 0 ? execGames.reduce((s, g) => s + g.scores.avg, 0) / execGames.length : memScore * 0.8;

  // Velocidad de procesamiento: reaction time
  const rts = gameList.map(g => g.biometrics.avgReactionTime).filter((v): v is number => v !== null);
  const avgRT = rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
  const velScore = avgRT ? Math.max(0, Math.min(100, 100 - (avgRT - 500) / 20)) : 50;

  // Control de impulsos: commission errors
  const totalCommissions = gameList.reduce((s, g) => s + g.biometrics.commissionErrors, 0);
  const impScore = totalSessions > 0 ? Math.max(0, Math.min(100, 100 - (totalCommissions / totalSessions) * 15)) : 50;

  const overallScore = (atencionScore + memScore + execScore + velScore + impScore) / 5;

  const interpret = (score: number) => score >= 80 ? 'Rango funcional adecuado' : score >= 60 ? 'Rendimiento moderado — monitorear' : score >= 40 ? 'Rendimiento bajo — intervención sugerida' : 'Déficit significativo — evaluación prioritaria';

  if (overallScore < 40 && totalSessions >= 3) {
    alerts.push({ type: 'critical', domain: 'perfil_cognitivo', message: 'Perfil cognitivo global por debajo del umbral funcional', metric: 'overall_score', value: +overallScore.toFixed(0) });
  }

  return {
    overallScore: +overallScore.toFixed(0),
    domains: {
      atencion: { score: +atencionScore.toFixed(0), interpretation: interpret(atencionScore) },
      memoria: { score: +memScore.toFixed(0), interpretation: interpret(memScore) },
      funcionEjecutiva: { score: +execScore.toFixed(0), interpretation: interpret(execScore) },
      velocidadProcesamiento: { score: +velScore.toFixed(0), interpretation: interpret(velScore) },
      controlImpulsos: { score: +impScore.toFixed(0), interpretation: interpret(impScore) },
    },
    globalInterpretation: `Perfil cognitivo basado en ${totalSessions} sesiones en ${gameList.length} juegos. Score global: ${overallScore.toFixed(0)}/100. ${interpret(overallScore)}.`
  };
}

function analyzeMood(entries: MoodRow[], checkins: any[], alerts: ClinicalAlert[]): MoodAnalysis {
  const allColors = [...entries.map(e => e.color_id || e.color_hex), ...checkins.filter(c => c.color_hex).map(c => c.color_hex)].filter(Boolean);

  if (allColors.length === 0) {
    return { entries: 0, dominantColor: null, colorDistribution: {}, trend: 'sin_datos', interpretation: 'Sin registros de estado anímico.' };
  }

  const dist: Record<string, number> = {};
  for (const c of allColors) { dist[c] = (dist[c] || 0) + 1; }

  const dominant = Object.entries(dist).sort(([, a], [, b]) => b - a)[0];

  // Dark colors (black, grey, dark_blue) predominance = warning
  const darkCount = (dist['black'] || 0) + (dist['grey'] || 0) + (dist['#000000'] || 0) + (dist['#808080'] || 0) + (dist['#00008B'] || 0);
  const darkRatio = darkCount / allColors.length;

  let interpretation = `${allColors.length} registros cromáticos. Color predominante: ${COLOR_NAMES[dominant[0]] || dominant[0]} (${dominant[1]} veces).`;

  if (darkRatio > 0.5) {
    interpretation += ' Predominancia de colores oscuros — evaluar estado anímico.';
    alerts.push({ type: 'warning', domain: 'animo', message: 'Predominancia de colores oscuros en selección proyectiva', metric: 'dark_color_ratio', value: +(darkRatio * 100).toFixed(0) + '%' });
  }

  return {
    entries: allColors.length,
    dominantColor: dominant[0],
    colorDistribution: dist,
    trend: darkRatio > 0.5 ? 'negativo' : darkRatio < 0.2 ? 'positivo' : 'neutro',
    interpretation
  };
}

function analyzeSessionBehavior(events: GameMetricRow[], allMetrics: GameMetricRow[], alerts: ClinicalAlert[]): SessionBehaviorAnalysis {
  const resets = events.filter(e => e.metric_type === 'event_game_reset').length;
  const interruptions = events.filter(e => ['event_tab_close', 'event_tab_hidden', 'event_page_hide'].includes(e.metric_type)).length;
  const timeouts = events.filter(e => e.metric_type === 'event_session_timeout').length;
  const crashes = events.filter(e => e.metric_type === 'event_error_crash').length;

  // Avg duration from metric_data.time_played_ms
  const durations = allMetrics
    .map(m => m.metric_data?.time_played_ms || m.metric_data?.duration_ms || m.metric_data?.total_time_ms)
    .filter((v): v is number => v !== null && v !== undefined && v > 0);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000 : null;

  const sessions = allMetrics.filter(m =>
    ['session_summary', 'session_complete'].includes(m.metric_type) || m.metric_type.startsWith('level_')
  ).length;
  const completed = allMetrics.filter(m => m.metric_data?.completed === true).length;
  const completionRate = sessions > 0 ? completed / sessions : null;

  let interpretation = '';
  if (resets > 3) {
    interpretation += `${resets} reinicios — posible frustración o perfeccionismo. `;
    alerts.push({ type: 'info', domain: 'comportamiento', message: 'Reinicios frecuentes', metric: 'resets', value: resets });
  }
  if (timeouts > 2) {
    interpretation += `${timeouts} timeouts por inactividad — evaluar motivación/atención. `;
  }
  if (interruptions > 5) {
    interpretation += `${interruptions} interrupciones — posible dificultad para sostener la actividad. `;
  }
  if (!interpretation) interpretation = 'Patrón de uso dentro de parámetros esperados.';

  return { totalResets: resets, totalInterruptions: interruptions, totalTimeouts: timeouts, totalErrors: crashes, avgSessionDuration: avgDuration, completionRate, interpretation };
}

function analyzeTemporalPatterns(metrics: GameMetricRow[]): TemporalAnalysis {
  const days: Record<string, number> = {};
  const hours: Record<number, number> = {};

  for (const m of metrics) {
    if (!m.created_at) continue;
    const d = new Date(m.created_at);
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()];
    days[dayName] = (days[dayName] || 0) + 1;
    hours[d.getHours()] = (hours[d.getHours()] || 0) + 1;
  }

  const preferredDays = Object.entries(days).sort(([, a], [, b]) => b - a).slice(0, 3).map(([d]) => d);
  const preferredHours = Object.entries(hours).sort(([, a], [, b]) => b - a).slice(0, 3).map(([h]) => parseInt(h));

  // Sessions per week estimate
  const dates = metrics.map(m => m.created_at).filter(Boolean).sort();
  let sessionsPerWeek = 0;
  if (dates.length >= 2) {
    const span = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (7 * 24 * 60 * 60 * 1000);
    sessionsPerWeek = span > 0 ? +(metrics.length / span).toFixed(1) : metrics.length;
  }

  const regularity = sessionsPerWeek >= 3 ? 'regular' : sessionsPerWeek >= 1 ? 'irregular' : 'esporádico';

  return { preferredDays, preferredHours, sessionsPerWeek, regularity };
}
