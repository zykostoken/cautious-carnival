// telemetry.js
export class Telemetry {
  constructor({ supabase, sessionId, patientId, batchInterval = 30000 }) {
    this.supabase = supabase;
    this.sessionId = sessionId;
    this.patientId = patientId;
    this.buffer = [];
    this.batchInterval = batchInterval;
    this.timer = null;
    this.started = false;
  }

  startSession() {
    if (this.started) return;
    this.started = true;
    this.sessionStart = Date.now();
    this._startTimer();
    this._createSessionRow();
  }

  endSession() {
    this.started = false;
    this._stopTimer();
  }

  pushEvent(event) {
    const e = Object.assign({ time_ms: Date.now() }, event);
    this.buffer.push(e);
    // si buffer muy grande, forzar envío
    if (this.buffer.length > 800) this.flush();
  }

  _startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.batchInterval);
  }

  _stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  async flush() {
    if (!this.buffer.length) return;
    const eventsToSend = this.buffer.splice(0, this.buffer.length);
    const payload = {
      session_id: this.sessionId,
      patient_id: this.patientId,
      game_level: 'la_mesa_puesta_v1',
      telemetry: eventsToSend
    };

    try {
      const { data, error } = await this.supabase
        .from('game_telemetry')
        .insert([{ session_id: payload.session_id, patient_id: payload.patient_id, game_level: payload.game_level, telemetry: payload.telemetry }]);

      if (error) {
        console.error('Supabase insert error', error);
        // reinsertar para reintento
        this.buffer = eventsToSend.concat(this.buffer);
      } else {
        console.log('Telemetry uploaded, rows:', data?.length ?? 0);
      }
    } catch (err) {
      console.error('Telemetry upload exception', err);
      this.buffer = eventsToSend.concat(this.buffer);
    }
  }

  async _createSessionRow() {
    try {
      const { data, error } = await this.supabase
        .from('clinical_sessions')
        .insert([{ session_id: this.sessionId, patient_id: this.patientId, started_at: new Date().toISOString() }]);
      if (error) console.error('Session create error', error);
    } catch (err) {
      console.error('Session create exception', err);
    }
  }
}