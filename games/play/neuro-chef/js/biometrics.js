// ========== BIOMETRICS ENGINE - NEURO-CHEF ==========
// Captura: RT, omisiones, comisiones, F+/F-, tremor, hesitación, resets, action log

const Biometrics = {
    // ---------- STATE ----------
    levelStart: null,
    firstActionTime: null,
    actionLog: [],
    dragSamples: [],        // {x, y, t} durante drag
    tremors: [],            // jitter calculado por drag
    hesitations: [],        // pausas >2s entre acciones
    lastActionTime: null,
    resetCount: 0,
    interactionCount: 0,
    undoCount: 0,           // dblclick/deshacer
    abruptDirectionChanges: 0, // cambios bruscos de trayectoria

    // ---------- INIT ----------
    startLevel() {
        this.levelStart = Date.now();
        this.firstActionTime = null;
        this.actionLog = [];
        this.dragSamples = [];
        this.tremors = [];
        this.hesitations = [];
        this.lastActionTime = null;
        this.interactionCount = 0;
        this.undoCount = 0;
        this.abruptDirectionChanges = 0;
        this._setupGlobalListeners();
    },

    // ---------- ACTION TRACKING ----------
    logAction(type, data = {}) {
        const now = Date.now();
        
        // First action RT
        if (!this.firstActionTime && type !== 'view') {
            this.firstActionTime = now;
        }

        // Hesitation detection (>2s gap between meaningful actions)
        if (this.lastActionTime && (now - this.lastActionTime) > 2000) {
            this.hesitations.push({
                gap_ms: now - this.lastActionTime,
                before_action: type,
                at: now - this.levelStart
            });
        }

        this.lastActionTime = now;
        this.interactionCount++;

        this.actionLog.push({
            type,
            t: now - this.levelStart,
            ...data
        });
    },

    logDragStart(itemId) {
        this.logAction('drag_start', { item: itemId });
        this.dragSamples = [];
    },

    logDragMove(x, y) {
        this.dragSamples.push({ x, y, t: Date.now() });
        // Detect abrupt direction changes (>90° turn)
        const n = this.dragSamples.length;
        if (n >= 3) {
            const p1 = this.dragSamples[n-3], p2 = this.dragSamples[n-2], p3 = this.dragSamples[n-1];
            const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
            const dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
            const mag1 = Math.sqrt(dx1*dx1 + dy1*dy1);
            const mag2 = Math.sqrt(dx2*dx2 + dy2*dy2);
            if (mag1 > 3 && mag2 > 3) { // ignore micro-movements
                const dot = dx1*dx2 + dy1*dy2;
                const cosAngle = dot / (mag1 * mag2);
                if (cosAngle < 0) this.abruptDirectionChanges++; // >90° turn
            }
        }
    },

    logDrop(itemId, target, isCorrect) {
        this.logAction('drop', { item: itemId, target, correct: isCorrect });
        // Calculate tremor from this drag
        if (this.dragSamples.length > 5) {
            const tremor = this._calcTremor(this.dragSamples);
            this.tremors.push(tremor);
        }
        this.dragSamples = [];
    },

    logClick(itemId, target) {
        this.logAction('click', { item: itemId, target });
    },

    logUndo(itemId) {
        this.undoCount++;
        this.logAction('undo', { item: itemId });
    },

    logReset() {
        this.resetCount++;
        this.logAction('reset', {});
    },

    logVerify() {
        this.logAction('verify', {});
    },

    // ---------- TREMOR ANALYSIS ----------
    // Mide jitter: desviación del path recto durante drag
    _calcTremor(samples) {
        if (samples.length < 3) return { jitter: 0, speed_var: 0 };

        // 1. Path jitter: desviación perpendicular de la recta start→end
        const start = samples[0];
        const end = samples[samples.length - 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        let totalDeviation = 0;
        for (let i = 1; i < samples.length - 1; i++) {
            // Perpendicular distance to start→end line
            const px = samples[i].x - start.x;
            const py = samples[i].y - start.y;
            const cross = Math.abs(px * dy - py * dx) / len;
            totalDeviation += cross;
        }
        const jitter = totalDeviation / (samples.length - 2);

        // 2. Speed variance: inconsistencia de velocidad
        const speeds = [];
        for (let i = 1; i < samples.length; i++) {
            const sdx = samples[i].x - samples[i-1].x;
            const sdy = samples[i].y - samples[i-1].y;
            const dt = (samples[i].t - samples[i-1].t) || 1;
            speeds.push(Math.sqrt(sdx*sdx + sdy*sdy) / dt);
        }
        const avgSpeed = speeds.reduce((a,b) => a+b, 0) / speeds.length;
        const speedVar = speeds.reduce((a,s) => a + (s - avgSpeed) ** 2, 0) / speeds.length;

        return {
            jitter: Math.round(jitter * 100) / 100,
            speed_var: Math.round(speedVar * 1000) / 1000,
            samples: samples.length,
            duration_ms: samples[samples.length-1].t - samples[0].t
        };
    },

    // ---------- GLOBAL MOUSE/TOUCH TRACKING ----------
    _setupGlobalListeners() {
        // Track drag movements globally for tremor
        const handler = (e) => {
            if (this.dragSamples.length > 0 || document.querySelector('.dragging')) {
                const x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
                const y = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
                if (x && y) this.logDragMove(x, y);
            }
        };
        document.removeEventListener('mousemove', Biometrics._moveHandler);
        document.removeEventListener('touchmove', Biometrics._moveHandler);
        Biometrics._moveHandler = handler;
        document.addEventListener('mousemove', handler, { passive: true });
        document.addEventListener('touchmove', handler, { passive: true });
    },

    // ---------- LEVEL SUMMARY ----------
    getLevelBiometrics(levelNum, results) {
        const now = Date.now();
        const totalTime = now - (this.levelStart || now);
        const reactionTime = this.firstActionTime 
            ? this.firstActionTime - this.levelStart 
            : totalTime;

        // Tremor average
        const avgTremor = this.tremors.length > 0
            ? this.tremors.reduce((a, t) => a + t.jitter, 0) / this.tremors.length
            : 0;
        const avgSpeedVar = this.tremors.length > 0
            ? this.tremors.reduce((a, t) => a + t.speed_var, 0) / this.tremors.length
            : 0;

        // Signal Detection Theory metrics
        const hits = results.correct || 0;            // correct selections
        const misses = results.omissions || 0;         // missed correct items (false negatives)
        const falseAlarms = results.commissions || 0;  // incorrect selections (false positives)
        const correctRejects = results.correct_rejects || 0;

        // d-prime approximation (sensitivity)
        const hitRate = Math.min(Math.max(hits / ((hits + misses) || 1), 0.01), 0.99);
        const faRate = Math.min(Math.max(falseAlarms / ((falseAlarms + correctRejects) || 1), 0.01), 0.99);
        
        // Z-score approximation
        const zHit = this._probit(hitRate);
        const zFa = this._probit(faRate);
        const dPrime = Math.round((zHit - zFa) * 100) / 100;

        return {
            level: levelNum,
            timestamp: new Date().toISOString(),

            // Timing
            total_time_ms: totalTime,
            reaction_time_ms: reactionTime,
            avg_action_interval_ms: this.interactionCount > 1 
                ? Math.round(totalTime / this.interactionCount) 
                : totalTime,

            // SDT metrics
            hits,
            misses,           // omisiones (false negatives)
            false_alarms: falseAlarms,  // comisiones (false positives)
            correct_rejects: correctRejects,
            d_prime: dPrime,

            // Motor
            tremor_avg: Math.round(avgTremor * 100) / 100,
            tremor_speed_var: Math.round(avgSpeedVar * 1000) / 1000,
            tremor_samples: this.tremors.length,

            // Behavioral
            hesitation_count: this.hesitations.length,
            hesitation_total_ms: this.hesitations.reduce((a, h) => a + h.gap_ms, 0),
            undo_count: this.undoCount,
            reset_count: this.resetCount,
            total_interactions: this.interactionCount,
            abrupt_direction_changes: this.abruptDirectionChanges,

            // Raw data (for deep analysis)
            action_log: this.actionLog,
            tremor_details: this.tremors,
            hesitation_details: this.hesitations
        };
    },

    // Probit (inverse normal CDF approximation)
    _probit(p) {
        // Abramowitz & Stegun approximation
        if (p <= 0) return -3.5;
        if (p >= 1) return 3.5;
        const a = [0, -3.969683028665376e1, 2.209460984245205e2,
            -2.759285104469687e2, 1.383577518672690e2,
            -3.066479806614716e1, 2.506628277459239e0];
        const b = [0, -5.447609879822406e1, 1.615858368580409e2,
            -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
        const c = [0, -7.784894002430293e-3, -3.223964580411365e-1,
            -2.400758277161838e0, -2.549732539343734e0,
            4.374664141464968e0, 2.938163982698783e0];
        const d = [0, 7.784695709041462e-3, 3.224671290700398e-1,
            2.445134137142996e0, 3.754408661907416e0];

        const pLow = 0.02425;
        const pHigh = 1 - pLow;
        let q, r;

        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                   ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        } else if (p <= pHigh) {
            q = p - 0.5;
            r = q * q;
            return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
                   (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
                    ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
        }
    }
};

console.log('[Neuro-Chef] Biometrics engine loaded');
