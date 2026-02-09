// State
let sessionToken = null;
let adminRole = null;
let adminEmail = null;
let permissions = {};
let patients = [];

// API
async function api(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}

// Auth - using healthcare professionals session
async function login(email, password) {
  // Use the professionals API for authentication
  const result = await api('/api/professionals', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', email, password })
  });

  if (result.success && result.sessionToken) {
    sessionToken = result.sessionToken;
    localStorage.setItem('hdd_admin_session', sessionToken);

    // Check admin role
    const roleResult = await api(`/api/hdd/admin?action=my_role&sessionToken=${sessionToken}`);

    if (roleResult.role) {
      adminRole = roleResult.role;
      adminEmail = roleResult.email;
      permissions = roleResult.permissions;
      showApp();
      loadDashboard();
      return { success: true };
    } else {
      localStorage.removeItem('hdd_admin_session');
      return { success: false, error: 'No tiene permisos para acceder al panel de HDD' };
    }
  }

  return result;
}

async function verifySession() {
  const stored = localStorage.getItem('hdd_admin_session');
  if (!stored) return false;

  try {
    const roleResult = await api(`/api/hdd/admin?action=my_role&sessionToken=${stored}`);

    if (roleResult.role) {
      sessionToken = stored;
      adminRole = roleResult.role;
      adminEmail = roleResult.email;
      permissions = roleResult.permissions;
      return true;
    }
  } catch (e) {
    console.error('Session verify error:', e);
  }

  localStorage.removeItem('hdd_admin_session');
  return false;
}

function logout() {
  sessionToken = null;
  adminRole = null;
  adminEmail = null;
  localStorage.removeItem('hdd_admin_session');
  showLogin();
}

// UI
function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  // Update user info
  document.getElementById('user-email').textContent = adminEmail;
  document.getElementById('user-role').textContent = adminRole === 'super_admin' ? 'Super Admin' : 'Admin';
}

// Dashboard
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadPatients(),
    loadActivities()
  ]);
}

async function loadStats() {
  const result = await api(`/api/hdd/admin?action=stats&sessionToken=${sessionToken}`);

  if (result.stats) {
    document.getElementById('stat-active').textContent = result.stats.activePatients;
    document.getElementById('stat-logged').textContent = result.stats.patientsLoggedIn;
    document.getElementById('stat-posts').textContent = result.stats.totalPosts;
    document.getElementById('stat-discharged').textContent = result.stats.dischargedPatients;

    // Reports tab
    document.getElementById('report-total').textContent =
      result.stats.activePatients + result.stats.dischargedPatients;
  }
}

async function loadPatients() {
  const status = document.getElementById('status-filter').value;
  const result = await api(`/api/hdd/admin?action=list&status=${status}&sessionToken=${sessionToken}`);

  if (result.patients) {
    patients = result.patients;
    renderPatients();

    // Update report stats
    const withPassword = patients.filter(p => p.hasPassword).length;
    document.getElementById('report-password').textContent = withPassword;

    const lastLogin = patients
      .filter(p => p.lastLogin)
      .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin))[0];
    document.getElementById('report-last-login').textContent = lastLogin
      ? formatDate(lastLogin.lastLogin)
      : 'Ninguno';
  }
}

function renderPatients() {
  const search = document.getElementById('patient-search').value.toLowerCase();
  const filtered = patients.filter(p =>
    p.fullName.toLowerCase().includes(search) ||
    p.dni.includes(search)
  );

  const tbody = document.getElementById('patients-table');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No se encontraron pacientes</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const statusClass = p.status === 'active' ? 'status-active' : 'status-discharged';
    const statusText = p.status === 'active' ? 'Activo' : 'Alta';
    const sessionStatus = p.hasPassword
      ? (p.hasLoggedIn ? '<span style="color: var(--success);">Activa</span>' : '<span style="color: var(--warning);">Pendiente</span>')
      : '<span style="color: var(--text-muted);">Sin config.</span>';

    return `
      <tr>
        <td><strong>${escapeHtml(p.fullName)}</strong></td>
        <td>${p.dni}</td>
        <td>${formatDate(p.admissionDate)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${sessionStatus}</td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="showPatientDetail(${p.id})">Ver</button>
            <button class="btn btn-secondary btn-sm" onclick="showEditPatient(${p.id})">Editar</button>
            ${permissions.canDischargePatients && p.status === 'active' ?
              `<button class="btn btn-warning btn-sm" onclick="dischargePatient(${p.id})">Alta</button>` : ''}
            ${permissions.canReadmitPatients && p.status === 'discharged' ?
              `<button class="btn btn-success btn-sm" onclick="readmitPatient(${p.id})">Readmitir</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterPatients() {
  loadPatients();
}

async function loadActivities() {
  const result = await api(`/api/hdd/admin?action=activities&sessionToken=${sessionToken}`);
  const container = document.getElementById('activities-list');

  if (result.activities && result.activities.length > 0) {
    container.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Actividad</th>
              <th>Dia</th>
              <th>Horario</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${result.activities.map(a => `
              <tr>
                <td><strong>${escapeHtml(a.name)}</strong></td>
                <td>${a.dayName}</td>
                <td>${a.startTime} - ${a.endTime}</td>
                <td>
                  <span class="status-badge ${a.isActive ? 'status-active' : 'status-discharged'}">
                    ${a.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><p>No hay actividades configuradas</p></div>';
  }
}

// Patient actions
function showAddPatientModal() {
  document.getElementById('new-admission').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-patient-modal').classList.remove('hidden');
}

async function addPatient() {
  const dni = document.getElementById('new-dni').value.trim();
  const fullName = document.getElementById('new-name').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const phone = document.getElementById('new-phone').value.trim();
  const admissionDate = document.getElementById('new-admission').value;
  const notes = document.getElementById('new-notes').value.trim();

  const errorEl = document.getElementById('add-patient-error');
  errorEl.classList.add('hidden');

  if (!dni || !fullName || !admissionDate) {
    errorEl.textContent = 'Complete los campos obligatorios';
    errorEl.classList.remove('hidden');
    return;
  }

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'add_patient',
      sessionToken,
      dni,
      fullName,
      email: email || null,
      phone: phone || null,
      admissionDate,
      notes: notes || null
    })
  });

  if (result.success) {
    hideModal('add-patient-modal');
    document.getElementById('add-patient-form').reset();
    loadPatients();
    loadStats();
    alert('Paciente agregado exitosamente');
  } else {
    errorEl.textContent = result.error || 'Error al agregar paciente';
    errorEl.classList.remove('hidden');
  }
}

async function showPatientDetail(patientId) {
  const result = await api(`/api/hdd/admin?action=detail&patientId=${patientId}&sessionToken=${sessionToken}`);

  if (result.patient) {
    const p = result.patient;
    const content = document.getElementById('patient-detail-content');

    content.innerHTML = `
      <div class="patient-detail">
        <div class="detail-item">
          <div class="detail-label">Nombre Completo</div>
          <div class="detail-value">${escapeHtml(p.fullName)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">DNI</div>
          <div class="detail-value">${p.dni}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Email</div>
          <div class="detail-value">${p.email || '-'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Telefono</div>
          <div class="detail-value">${p.phone || '-'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Fecha de Ingreso</div>
          <div class="detail-value">${formatDate(p.admissionDate)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Estado</div>
          <div class="detail-value">
            <span class="status-badge ${p.status === 'active' ? 'status-active' : 'status-discharged'}">
              ${p.status === 'active' ? 'Activo' : 'Alta'}
            </span>
          </div>
        </div>
        ${p.dischargeDate ? `
          <div class="detail-item">
            <div class="detail-label">Fecha de Alta</div>
            <div class="detail-value">${formatDate(p.dischargeDate)}</div>
          </div>
        ` : ''}
        <div class="detail-item">
          <div class="detail-label">Contrasena</div>
          <div class="detail-value">${p.hasPassword ? 'Configurada' : 'Sin configurar'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Ultimo Login</div>
          <div class="detail-value">${p.lastLogin ? formatDate(p.lastLogin) : 'Nunca'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Publicaciones</div>
          <div class="detail-value">${p.postsCount}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Registrado</div>
          <div class="detail-value">${formatDate(p.createdAt)}</div>
        </div>
      </div>
      ${p.notes ? `
        <div style="margin-top: 1rem;">
          <div class="detail-label">Notas</div>
          <p style="margin-top: 0.5rem;">${escapeHtml(p.notes)}</p>
        </div>
      ` : ''}
    `;

    // Actions
    const actions = document.getElementById('patient-detail-actions');
    let actionsHtml = `<button class="btn btn-secondary" onclick="hideModal('patient-detail-modal')">Cerrar</button>`;

    if (permissions.canResetPasswords && p.hasPassword) {
      actionsHtml = `<button class="btn btn-warning" onclick="resetPassword(${p.id})">Resetear Contrasena</button>` + actionsHtml;
    }

    actions.innerHTML = actionsHtml;

    document.getElementById('patient-detail-modal').classList.remove('hidden');
  }
}

function showEditPatient(patientId) {
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return;

  document.getElementById('edit-patient-id').value = patient.id;
  document.getElementById('edit-name').value = patient.fullName;
  document.getElementById('edit-email').value = patient.email || '';
  document.getElementById('edit-phone').value = patient.phone || '';
  document.getElementById('edit-notes').value = patient.notes || '';

  document.getElementById('edit-patient-modal').classList.remove('hidden');
}

async function savePatient() {
  const patientId = document.getElementById('edit-patient-id').value;
  const fullName = document.getElementById('edit-name').value.trim();
  const email = document.getElementById('edit-email').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  const notes = document.getElementById('edit-notes').value.trim();

  const errorEl = document.getElementById('edit-patient-error');
  errorEl.classList.add('hidden');

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'update_patient',
      sessionToken,
      patientId: parseInt(patientId),
      fullName,
      email: email || null,
      phone: phone || null,
      notes: notes || null
    })
  });

  if (result.success) {
    hideModal('edit-patient-modal');
    loadPatients();
    alert('Paciente actualizado');
  } else {
    errorEl.textContent = result.error || 'Error al actualizar';
    errorEl.classList.remove('hidden');
  }
}

async function dischargePatient(patientId) {
  if (!confirm('Esta seguro de dar de alta a este paciente? Esta accion finalizara su tratamiento en el Hospital de Dia.')) return;

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'discharge_patient',
      sessionToken,
      patientId
    })
  });

  if (result.success) {
    loadPatients();
    loadStats();
    alert('Paciente dado de alta exitosamente');
  } else {
    alert(result.error || 'Error al dar de alta');
  }
}

async function readmitPatient(patientId) {
  if (!confirm('Desea readmitir a este paciente al Hospital de Dia?')) return;

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'readmit_patient',
      sessionToken,
      patientId
    })
  });

  if (result.success) {
    loadPatients();
    loadStats();
    alert('Paciente readmitido exitosamente');
  } else {
    alert(result.error || 'Error al readmitir');
  }
}

async function resetPassword(patientId) {
  if (!confirm('Esto permitira al paciente configurar una nueva contrasena en su proximo inicio de sesion. Continuar?')) return;

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_password',
      sessionToken,
      patientId
    })
  });

  if (result.success) {
    hideModal('patient-detail-modal');
    loadPatients();
    alert(result.message);
  } else {
    alert(result.error || 'Error al resetear contrasena');
  }
}

// Tabs
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  document.querySelectorAll('[id^="tab-"]').forEach(c => c.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  // Load metrics patient selector when switching to metrics tab
  if (tabId === 'metrics') {
    populateMetricsPatientSelect();
  }
}

// =====================================
// GAMES FUNCTIONS
// =====================================
async function showGameStats(gameSlug) {
  const section = document.getElementById('game-stats-section');
  const title = document.getElementById('game-stats-title');
  const content = document.getElementById('game-stats-content');

  title.textContent = `Estadisticas: ${gameSlug === 'lawn-mower' ? 'Cortadora de Cesped' : 'Memoria de Medicacion'}`;
  content.innerHTML = '<div class="empty-state">Cargando estadisticas...</div>';
  section.classList.remove('hidden');

  try {
    const result = await api(`/api/hdd/admin?action=game_stats&game=${gameSlug}&sessionToken=${sessionToken}`);

    if (result.stats) {
      content.innerHTML = `
        <div class="stats-grid" style="margin-bottom: 1.5rem;">
          <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-value">${result.stats.totalPlayers || 0}</div>
            <div class="stat-label">Pacientes que han jugado</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🎮</div>
            <div class="stat-value">${result.stats.totalSessions || 0}</div>
            <div class="stat-label">Total de sesiones</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⭐</div>
            <div class="stat-value">${result.stats.avgScore || 0}</div>
            <div class="stat-label">Puntuacion promedio</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🏆</div>
            <div class="stat-value">${result.stats.maxScore || 0}</div>
            <div class="stat-label">Mejor puntuacion</div>
          </div>
        </div>

        ${result.topPlayers && result.topPlayers.length > 0 ? `
          <h4 style="margin-bottom: 0.75rem;">Mejores Puntuaciones</h4>
          <table style="width: 100%;">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Mejor Score</th>
                <th>Nivel Max</th>
                <th>Sesiones</th>
              </tr>
            </thead>
            <tbody>
              ${result.topPlayers.map(p => `
                <tr>
                  <td>${escapeHtml(p.fullName)}</td>
                  <td>${p.bestScore}</td>
                  <td>${p.maxLevel}</td>
                  <td>${p.totalSessions}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="text-muted">No hay datos de jugadores aun.</p>'}
      `;
    } else {
      content.innerHTML = `
        <div class="alert alert-info">
          <p>No hay estadisticas disponibles para este juego aun.</p>
          <p>Las estadisticas se generaran cuando los pacientes comiencen a jugar.</p>
        </div>
      `;
    }
  } catch (e) {
    content.innerHTML = `
      <div class="alert alert-warning">
        No se pudieron cargar las estadisticas. Las metricas de juegos se iran poblando a medida que los pacientes utilicen el portal.
      </div>
    `;
  }
}

function hideGameStats() {
  document.getElementById('game-stats-section').classList.add('hidden');
}

// =====================================
// METRICS FUNCTIONS - Clinical Dashboard
// =====================================
async function populateMetricsPatientSelect() {
  const select = document.getElementById('metrics-patient-select');
  if (select.options.length > 1) return; // Already populated

  // Use patients array if available, or fetch fresh
  let patientList = patients;
  if (!patientList || patientList.length === 0) {
    const result = await api(`/api/hdd/admin?action=list&status=all&sessionToken=${sessionToken}`);
    patientList = result.patients || [];
  }

  patientList.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = `${p.fullName} (DNI: ${p.dni})`;
    select.appendChild(option);
  });
}

async function loadPatientMetrics() {
  const patientId = document.getElementById('metrics-patient-select').value;
  const contentDiv = document.getElementById('patient-metrics-content');
  const exportBtn = document.getElementById('export-report-btn');
  const dateRange = document.getElementById('metrics-date-range').value;

  if (!patientId) {
    contentDiv.classList.add('hidden');
    if (exportBtn) exportBtn.style.display = 'none';
    return;
  }

  contentDiv.classList.remove('hidden');
  if (exportBtn) exportBtn.style.display = '';

  try {
    const result = await api(`/api/hdd/admin?action=patient_metrics&patientId=${patientId}&dateRange=${dateRange}&sessionToken=${sessionToken}`);

    if (result.metrics) {
      // Summary cards
      document.getElementById('metric-logins').textContent = result.metrics.loginCount || 0;
      document.getElementById('metric-games').textContent = result.metrics.gameSessions || 0;
      document.getElementById('metric-posts').textContent = result.metrics.postsCount || 0;
      document.getElementById('metric-time').textContent = formatDuration(result.metrics.totalGameTime || 0);
      document.getElementById('metric-avg-mood').textContent = result.metrics.avgMood != null ? result.metrics.avgMood.toFixed(1) : '-';
      document.getElementById('metric-color-count').textContent = result.metrics.colorCount || 0;

      // Render charts
      renderMoodChart(result.moodHistory || []);
      renderColorHistory(result.colorHistory || []);
      renderGameCharts(result.gameSessionDetails || []);
      renderBiomarkers(result.gameMetrics || [], result.gameSessionDetails || []);
      renderGamesProgress(result.gamesProgress || []);
      renderRecentActivity(result.recentActivity || []);
      renderMonthlySummary(result.monthlySummary || []);
    } else {
      setDefaultMetrics();
    }
  } catch (e) {
    console.error('Error loading metrics:', e);
    setDefaultMetrics();
  }
}

function setDefaultMetrics() {
  document.getElementById('metric-logins').textContent = '-';
  document.getElementById('metric-games').textContent = '-';
  document.getElementById('metric-posts').textContent = '-';
  document.getElementById('metric-time').textContent = '-';
  document.getElementById('metric-avg-mood').textContent = '-';
  document.getElementById('metric-color-count').textContent = '-';

  // Clear charts
  clearCanvas('moodChart');
  clearCanvas('scoreChart');
  clearCanvas('timeChart');

  document.getElementById('color-timeline').innerHTML = '<div class="empty-state"><p>Sin datos de color</p></div>';
  document.getElementById('color-distribution').innerHTML = '';
  document.getElementById('biomarkers-grid').innerHTML = '<div class="empty-state"><p>Sin biomarcadores disponibles</p></div>';

  document.getElementById('games-progress-list').innerHTML = '<div class="alert alert-info">Las metricas se mostraran cuando el paciente utilice el portal.</div>';
  document.getElementById('recent-activity-list').innerHTML = '<div class="alert alert-info">La actividad se mostrara cuando el paciente interactue con el sistema.</div>';
  document.getElementById('monthly-summary-content').innerHTML = '<div class="alert alert-info">Los resumenes mensuales se generaran automaticamente.</div>';
}

function clearCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---- MOOD CHART (Longitudinal line chart) ----
function renderMoodChart(moodHistory) {
  const canvas = document.getElementById('moodChart');
  if (!canvas || !moodHistory || moodHistory.length === 0) {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de estado de animo', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 25, right: 20, bottom: 40, left: 45 };

  ctx.clearRect(0, 0, w, h);

  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Y axis (mood 1-5)
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  const moodLabels = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien'];
  for (let i = 1; i <= 5; i++) {
    const y = pad.top + chartH - ((i - 1) / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(moodLabels[i - 1], pad.left - 5, y + 4);
  }

  // X axis dates
  const n = moodHistory.length;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';

  // Draw data line
  ctx.beginPath();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  const points = [];
  for (let i = 0; i < n; i++) {
    const x = pad.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const y = pad.top + chartH - ((moodHistory[i].moodValue - 1) / 4) * chartH;
    points.push({ x, y, data: moodHistory[i] });
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw gradient fill under line
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y);
    else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
  ctx.lineTo(points[0].x, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw data points with color if available
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    if (p.data.colorHex) {
      ctx.fillStyle = p.data.colorHex;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#6366f1';
      ctx.fill();
    }

    // Date labels (show every few points to avoid overlap)
    if (n <= 15 || i % Math.ceil(n / 10) === 0 || i === n - 1) {
      const date = new Date(p.data.createdAt);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }), p.x, pad.top + chartH + 15);
    }
  });

  ctx.lineWidth = 1;
}

// ---- COLOR HISTORY ----
function renderColorHistory(colorHistory) {
  const timeline = document.getElementById('color-timeline');
  const distribution = document.getElementById('color-distribution');

  if (!colorHistory || colorHistory.length === 0) {
    timeline.innerHTML = '<div style="color: var(--text-muted); padding: 1rem; text-align: center;">Sin datos de seleccion de color</div>';
    distribution.innerHTML = '';
    return;
  }

  // Timeline: color swatches ordered by date
  timeline.innerHTML = colorHistory.map(c => {
    const date = new Date(c.createdAt);
    const dateStr = date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    return `<div title="${dateStr} - ${c.context || ''} - ${c.colorIntensity || 'vivid'}"
                style="width: 28px; height: 28px; background: ${c.colorHex}; border-radius: 4px; border: 1px solid #e2e8f0; cursor: help;"
                ></div>`;
  }).join('');

  // Color distribution (frequency analysis)
  const colorCounts = {};
  colorHistory.forEach(c => {
    colorCounts[c.colorHex] = (colorCounts[c.colorHex] || 0) + 1;
  });
  const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  const total = colorHistory.length;

  distribution.innerHTML = `
    <h4 style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">Distribucion de colores (frecuencia)</h4>
    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
      ${sortedColors.slice(0, 12).map(([color, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        return `<div style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
          <div style="width: 16px; height: 16px; background: ${color}; border-radius: 3px; border: 1px solid #cbd5e1;"></div>
          <span style="font-size: 0.8rem; color: var(--text);">${pct}%</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ---- GAME PERFORMANCE CHARTS ----
function renderGameCharts(sessions) {
  renderScoreChart(sessions);
  renderTimeChart(sessions);
}

function renderScoreChart(sessions) {
  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!sessions || sessions.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin sesiones de juego', w / 2, h / 2);
    return;
  }

  const pad = { top: 15, right: 15, bottom: 30, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const scores = sessions.map(s => s.score || 0);
  const maxScore = Math.max(...scores, 10);

  // Y axis
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (i / 4) * chartH;
    const val = Math.round((i / 4) * maxScore);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(val.toString(), pad.left - 4, y + 3);
  }

  // Bars
  const barW = Math.max(4, Math.min(20, chartW / sessions.length - 2));
  sessions.forEach((s, i) => {
    const x = pad.left + (i / sessions.length) * chartW + barW / 2;
    const barH = (s.score / maxScore) * chartH;
    const y = pad.top + chartH - barH;

    ctx.fillStyle = s.completed ? '#22c55e' : '#f59e0b';
    ctx.fillRect(x, y, barW, barH);
  });

  // X labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  const step = Math.ceil(sessions.length / 8);
  sessions.forEach((s, i) => {
    if (i % step === 0) {
      const x = pad.left + (i / sessions.length) * chartW + barW / 2;
      const date = new Date(s.startedAt);
      ctx.fillText(date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }), x, h - 5);
    }
  });
}

function renderTimeChart(sessions) {
  const canvas = document.getElementById('timeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!sessions || sessions.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos de tiempo', w / 2, h / 2);
    return;
  }

  const pad = { top: 15, right: 15, bottom: 30, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const durations = sessions.map(s => s.duration || 0);
  const maxDur = Math.max(...durations, 60);

  // Y axis
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (i / 4) * chartH;
    const val = Math.round((i / 4) * maxDur);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(val + 's', pad.left - 4, y + 3);
  }

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;
  sessions.forEach((s, i) => {
    const x = pad.left + (sessions.length === 1 ? chartW / 2 : (i / (sessions.length - 1)) * chartW);
    const y = pad.top + chartH - ((s.duration || 0) / maxDur) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  sessions.forEach((s, i) => {
    const x = pad.left + (sessions.length === 1 ? chartW / 2 : (i / (sessions.length - 1)) * chartW);
    const y = pad.top + chartH - ((s.duration || 0) / maxDur) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0ea5e9';
    ctx.fill();
  });

  ctx.lineWidth = 1;
}

// ---- BIOMARKERS ----
function renderBiomarkers(gameMetrics, sessions) {
  const container = document.getElementById('biomarkers-grid');

  if ((!gameMetrics || gameMetrics.length === 0) && (!sessions || sessions.length === 0)) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem; text-align: center; grid-column: 1 / -1;">Los biomarcadores se generaran cuando el paciente juegue.</div>';
    return;
  }

  // Compute biomarkers from sessions
  const completedSessions = sessions.filter(s => s.completed);
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((s, g) => s + (g.score || 0), 0) / sessions.length) : 0;
  const avgDuration = sessions.length > 0 ? Math.round(sessions.reduce((s, g) => s + (g.duration || 0), 0) / sessions.length) : 0;
  const completionRate = sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0;
  const maxLevel = sessions.length > 0 ? Math.max(...sessions.map(s => s.level || 0)) : 0;

  // Check for improvement trend
  const recentScores = sessions.slice(-5).map(s => s.score || 0);
  const olderScores = sessions.slice(0, 5).map(s => s.score || 0);
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : 0;
  const trend = sessions.length >= 3 ? (recentAvg > olderAvg ? 'mejorando' : recentAvg < olderAvg ? 'declinando' : 'estable') : 'insuficiente';

  // Aggregate game-specific metrics if present
  const metricsByType = {};
  gameMetrics.forEach(m => {
    if (!metricsByType[m.metricType]) metricsByType[m.metricType] = [];
    metricsByType[m.metricType].push(m);
  });

  let html = `
    <div style="background: #f0f9ff; padding: 0.75rem; border-radius: 8px; border: 1px solid #bae6fd;">
      <div style="font-size: 0.8rem; color: #0369a1;">Puntuacion Promedio</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #0c4a6e;">${avgScore}</div>
    </div>
    <div style="background: #f0fdf4; padding: 0.75rem; border-radius: 8px; border: 1px solid #bbf7d0;">
      <div style="font-size: 0.8rem; color: #166534;">Tasa Completado</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #14532d;">${completionRate}%</div>
    </div>
    <div style="background: #fefce8; padding: 0.75rem; border-radius: 8px; border: 1px solid #fde68a;">
      <div style="font-size: 0.8rem; color: #854d0e;">Duracion Prom.</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #713f12;">${formatDuration(avgDuration)}</div>
    </div>
    <div style="background: #fdf2f8; padding: 0.75rem; border-radius: 8px; border: 1px solid #fbcfe8;">
      <div style="font-size: 0.8rem; color: #9d174d;">Nivel Maximo</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #831843;">${maxLevel}</div>
    </div>
    <div style="background: #f5f3ff; padding: 0.75rem; border-radius: 8px; border: 1px solid #ddd6fe;">
      <div style="font-size: 0.8rem; color: #5b21b6;">Tendencia</div>
      <div style="font-size: 1.1rem; font-weight: 700; color: #4c1d95;">${trend === 'mejorando' ? 'Mejorando' : trend === 'declinando' ? 'Declinando' : trend === 'estable' ? 'Estable' : 'Datos insuf.'}</div>
    </div>
    <div style="background: #fff7ed; padding: 0.75rem; border-radius: 8px; border: 1px solid #fed7aa;">
      <div style="font-size: 0.8rem; color: #9a3412;">Total Sesiones</div>
      <div style="font-size: 1.4rem; font-weight: 700; color: #7c2d12;">${sessions.length}</div>
    </div>
  `;

  // Add custom game metrics if available
  Object.entries(metricsByType).forEach(([type, metrics]) => {
    const latest = metrics[0];
    const avg = metrics.reduce((s, m) => s + (parseFloat(m.metricValue) || 0), 0) / metrics.length;
    html += `
      <div style="background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="font-size: 0.8rem; color: #475569;">${escapeHtml(type)}</div>
        <div style="font-size: 1.2rem; font-weight: 700; color: #1e293b;">${avg.toFixed(1)}</div>
        <div style="font-size: 0.7rem; color: #94a3b8;">${metrics.length} registros</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ---- MONTHLY SUMMARY ----
function renderMonthlySummary(summaries) {
  const container = document.getElementById('monthly-summary-content');

  if (!summaries || summaries.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">Los resumenes mensuales se generaran automaticamente con el uso del portal.</div>';
    return;
  }

  container.innerHTML = `
    <table style="width: 100%;">
      <thead>
        <tr>
          <th>Mes</th>
          <th>Logins</th>
          <th>Sesiones Juego</th>
          <th>Tiempo Juego</th>
          <th>Posts</th>
          <th>Animo Prom.</th>
          <th>Tendencia</th>
        </tr>
      </thead>
      <tbody>
        ${summaries.map(s => `
          <tr>
            <td><strong>${s.monthYear}</strong></td>
            <td>${s.totalLogins || 0}</td>
            <td>${s.totalGameSessions || 0}</td>
            <td>${formatDuration(s.totalGameTime || 0)}</td>
            <td>${s.totalPosts || 0}</td>
            <td>${s.avgMood != null ? s.avgMood.toFixed(1) : '-'}</td>
            <td>${s.moodTrend || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---- EXPORT REPORT ----
function exportPatientReport() {
  const patientName = document.getElementById('metrics-patient-select').selectedOptions[0]?.textContent || 'Paciente';
  const date = new Date().toLocaleDateString('es-AR');

  // Collect visible data from the dashboard
  const metrics = {
    logins: document.getElementById('metric-logins').textContent,
    games: document.getElementById('metric-games').textContent,
    posts: document.getElementById('metric-posts').textContent,
    time: document.getElementById('metric-time').textContent,
    avgMood: document.getElementById('metric-avg-mood').textContent,
    colorCount: document.getElementById('metric-color-count').textContent
  };

  let report = `REPORTE CLINICO - ${patientName}\n`;
  report += `Fecha: ${date}\n`;
  report += `========================================\n\n`;
  report += `RESUMEN DE METRICAS:\n`;
  report += `- Total Logins: ${metrics.logins}\n`;
  report += `- Sesiones de Juego: ${metrics.games}\n`;
  report += `- Publicaciones: ${metrics.posts}\n`;
  report += `- Tiempo de Juego: ${metrics.time}\n`;
  report += `- Animo Promedio: ${metrics.avgMood}\n`;
  report += `- Registros de Color: ${metrics.colorCount}\n`;

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reporte_${patientName.replace(/[^a-zA-Z0-9]/g, '_')}_${date.replace(/\//g, '-')}.txt`;
  a.click();
}

function renderGamesProgress(progress) {
  const container = document.getElementById('games-progress-list');

  if (!progress || progress.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No hay progreso de juegos registrado</p></div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Juego</th>
          <th>Nivel Actual</th>
          <th>Mejor Score</th>
          <th>Sesiones</th>
          <th>Ultima Vez</th>
        </tr>
      </thead>
      <tbody>
        ${progress.map(g => `
          <tr>
            <td><strong>${escapeHtml(g.gameName)}</strong></td>
            <td>${g.currentLevel} / ${g.maxLevel}</td>
            <td>${g.bestScore}</td>
            <td>${g.totalSessions}</td>
            <td>${g.lastPlayed ? formatDate(g.lastPlayed) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRecentActivity(activity) {
  const container = document.getElementById('recent-activity-list');

  if (!activity || activity.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No hay actividad reciente</p></div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Actividad</th>
          <th>Detalles</th>
        </tr>
      </thead>
      <tbody>
        ${activity.map(a => `
          <tr>
            <td>${formatDate(a.date)}</td>
            <td>${escapeHtml(a.type)}</td>
            <td>${escapeHtml(a.details)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatDuration(seconds) {
  if (!seconds) return '0 min';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
}

// =====================================
// ROOMS FUNCTIONS (Jitsi Meet)
// =====================================
let customRooms = JSON.parse(localStorage.getItem('hdd_custom_rooms') || '[]');

function renderCustomRooms() {
  const container = document.getElementById('custom-rooms-list');

  if (customRooms.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📹</div>
        <p>No hay salas personalizadas creadas</p>
      </div>
    `;
    return;
  }

  container.innerHTML = customRooms.map((room, idx) => `
    <div class="room-card">
      <div class="room-header">
        <span class="room-icon">${room.icon}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteRoom(${idx})" title="Eliminar">×</button>
      </div>
      <h3>${escapeHtml(room.name)}</h3>
      <p>${escapeHtml(room.description || 'Sin descripcion')}</p>
      <div class="room-actions">
        <button class="btn btn-primary" onclick="joinRoom('${room.slug}')">Iniciar Sala</button>
        <button class="btn btn-secondary" onclick="copyRoomLink('${room.slug}')">Copiar Link</button>
      </div>
    </div>
  `).join('');
}

function showCreateRoomModal() {
  document.getElementById('create-room-form').reset();
  document.getElementById('create-room-modal').classList.remove('hidden');
}

function createRoom() {
  const name = document.getElementById('room-name').value.trim();
  const description = document.getElementById('room-desc').value.trim();
  const icon = document.getElementById('room-icon').value;

  if (!name) {
    alert('Ingrese un nombre para la sala');
    return;
  }

  // Create slug from name
  const slug = 'hdd-' + name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  customRooms.push({ name, description, icon, slug, createdAt: new Date().toISOString() });
  localStorage.setItem('hdd_custom_rooms', JSON.stringify(customRooms));

  hideModal('create-room-modal');
  renderCustomRooms();
  alert('Sala creada exitosamente');
}

function deleteRoom(index) {
  if (!confirm('Eliminar esta sala?')) return;
  customRooms.splice(index, 1);
  localStorage.setItem('hdd_custom_rooms', JSON.stringify(customRooms));
  renderCustomRooms();
}

function joinRoom(roomSlug) {
  const jitsiUrl = `https://meet.jit.si/${roomSlug}`;
  document.getElementById('jitsi-iframe').src = jitsiUrl;
  document.getElementById('jitsi-container').classList.remove('hidden');
}

function closeJitsi() {
  document.getElementById('jitsi-iframe').src = '';
  document.getElementById('jitsi-container').classList.add('hidden');
}

function copyRoomLink(roomSlug) {
  const link = `https://meet.jit.si/${roomSlug}`;
  navigator.clipboard.writeText(link).then(() => {
    alert('Link copiado al portapapeles: ' + link);
  }).catch(() => {
    prompt('Copie este link:', link);
  });
}

// =====================================
// RESOURCES FUNCTIONS
// =====================================
let customResources = JSON.parse(localStorage.getItem('hdd_resources') || '[]');

function showAddResourceModal() {
  document.getElementById('add-resource-form').reset();
  document.getElementById('add-resource-modal').classList.remove('hidden');
}

function addResource() {
  const title = document.getElementById('resource-title').value.trim();
  const type = document.getElementById('resource-type').value;
  const url = document.getElementById('resource-url').value.trim();
  const description = document.getElementById('resource-description').value.trim();

  if (!title || !url) {
    alert('Complete los campos obligatorios');
    return;
  }

  customResources.push({ title, type, url, description, createdAt: new Date().toISOString() });
  localStorage.setItem('hdd_resources', JSON.stringify(customResources));

  hideModal('add-resource-modal');
  renderResources();
  alert('Recurso agregado');
}

function renderResources() {
  const container = document.getElementById('resources-list');
  const existingCards = container.innerHTML;

  // Add custom resources to the grid
  if (customResources.length > 0) {
    const customHtml = customResources.map((r, idx) => `
      <div class="resource-card" data-category="${r.type}">
        <div class="resource-icon">${getResourceIcon(r.type)}</div>
        <div class="resource-content">
          <h4>${escapeHtml(r.title)}</h4>
          <p>${escapeHtml(r.description) || 'Sin descripcion'}</p>
          <div class="resource-meta">
            <span class="resource-type">${r.type}</span>
          </div>
        </div>
        <div class="resource-actions">
          <button class="btn btn-primary btn-sm" onclick="openResource('${r.type}', '${escapeHtml(r.url)}')">Ver</button>
          <button class="btn btn-danger btn-sm" onclick="deleteResource(${idx})">×</button>
        </div>
      </div>
    `).join('');

    // Append to existing
    container.innerHTML = existingCards + customHtml;
  }
}

function deleteResource(index) {
  if (!confirm('Eliminar este recurso?')) return;
  customResources.splice(index, 1);
  localStorage.setItem('hdd_resources', JSON.stringify(customResources));
  location.reload(); // Simpler than re-rendering
}

function getResourceIcon(type) {
  const icons = { video: '🎥', document: '📄', course: '🎓', link: '🔗' };
  return icons[type] || '📎';
}

function filterResources(category) {
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  document.querySelectorAll('.resource-card').forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function openResource(type, url) {
  if (type === 'video' && url.includes('youtube.com')) {
    // Embed YouTube video
    document.getElementById('video-iframe').src = url;
    document.getElementById('video-modal').classList.remove('hidden');
  } else {
    // Open in new tab
    window.open(url, '_blank');
  }
}

function closeVideoModal() {
  document.getElementById('video-iframe').src = '';
  document.getElementById('video-modal').classList.add('hidden');
}

// Modals
function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function closeModal(event, modalId) {
  if (event.target.classList.contains('modal-overlay')) {
    hideModal(modalId);
  }
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// =====================================
// FORM SWITCHING FUNCTIONS
// =====================================
function showLoginForm() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('setup-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('login-links').classList.remove('hidden');
  document.getElementById('setup-links').classList.add('hidden');
  document.getElementById('forgot-links').classList.add('hidden');
  document.getElementById('reset-links').classList.add('hidden');
  // Clear errors
  document.querySelectorAll('.form-error, .alert-success').forEach(el => el.classList.add('hidden'));
}

function showSetupForm() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('setup-form').classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('login-links').classList.add('hidden');
  document.getElementById('setup-links').classList.remove('hidden');
  document.getElementById('forgot-links').classList.add('hidden');
  document.getElementById('reset-links').classList.add('hidden');
}

function showForgotForm() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('setup-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.remove('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('login-links').classList.add('hidden');
  document.getElementById('setup-links').classList.add('hidden');
  document.getElementById('forgot-links').classList.remove('hidden');
  document.getElementById('reset-links').classList.add('hidden');
}

function showResetForm(email = '') {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('setup-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.remove('hidden');
  document.getElementById('login-links').classList.add('hidden');
  document.getElementById('setup-links').classList.add('hidden');
  document.getElementById('forgot-links').classList.add('hidden');
  document.getElementById('reset-links').classList.remove('hidden');
  if (email) {
    document.getElementById('reset-email').value = email;
  }
}

// =====================================
// FORM HANDLERS
// =====================================

// Login form
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  const result = await login(email, password);

  if (!result.success) {
    // Check if error suggests no password set
    if (result.error && result.error.includes('Credenciales')) {
      errorEl.innerHTML = result.error + '<br><small>Si es su primera vez, use "Primera vez? Configurar contrasena"</small>';
    } else {
      errorEl.textContent = result.error || 'Error al iniciar sesion';
    }
    errorEl.classList.remove('hidden');
  }
});

// Setup password form (for pre-seeded professionals)
document.getElementById('setup-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('setup-email').value.trim();
  const fullName = document.getElementById('setup-name').value.trim();
  const password = document.getElementById('setup-password').value;
  const passwordConfirm = document.getElementById('setup-password-confirm').value;

  const errorEl = document.getElementById('setup-error');
  errorEl.classList.add('hidden');

  // Validate passwords match
  if (password !== passwordConfirm) {
    errorEl.textContent = 'Las contrasenas no coinciden';
    errorEl.classList.remove('hidden');
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = 'La contrasena debe tener al menos 6 caracteres';
    errorEl.classList.remove('hidden');
    return;
  }

  // Use register action which handles pre-seeded professionals
  const result = await api('/api/professionals', {
    method: 'POST',
    body: JSON.stringify({
      action: 'register',
      email,
      fullName,
      password
    })
  });

  if (result.success && result.sessionToken) {
    sessionToken = result.sessionToken;
    localStorage.setItem('hdd_admin_session', sessionToken);

    // Check admin role
    const roleResult = await api(`/api/hdd/admin?action=my_role&sessionToken=${sessionToken}`);

    if (roleResult.role) {
      adminRole = roleResult.role;
      adminEmail = roleResult.email;
      permissions = roleResult.permissions;
      showApp();
      loadDashboard();
    } else {
      errorEl.textContent = 'Cuenta configurada pero no tiene permisos de administrador del HDD';
      errorEl.classList.remove('hidden');
      localStorage.removeItem('hdd_admin_session');
    }
  } else if (result.requiresVerification) {
    errorEl.innerHTML = 'Se ha enviado un codigo de verificacion a su email. <a href="#" onclick="showResetForm(\'' + email + '\'); return false;">Ingresar codigo</a>';
    errorEl.classList.remove('hidden');
  } else {
    errorEl.textContent = result.error || 'Error al configurar cuenta';
    errorEl.classList.remove('hidden');
  }
});

// Forgot password form
document.getElementById('forgot-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();

  const errorEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const result = await api('/api/professionals', {
    method: 'POST',
    body: JSON.stringify({
      action: 'request_password_reset',
      email
    })
  });

  if (result.success) {
    successEl.textContent = 'Si el email esta registrado, recibira un codigo de recuperacion. Revise su bandeja de entrada.';
    successEl.classList.remove('hidden');
    // Pre-fill reset form email
    document.getElementById('reset-email').value = email;
  } else {
    errorEl.textContent = result.error || 'Error al solicitar recuperacion';
    errorEl.classList.remove('hidden');
  }
});

// Reset password form
document.getElementById('reset-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const code = document.getElementById('reset-code').value.trim();
  const newPassword = document.getElementById('reset-password').value;

  const errorEl = document.getElementById('reset-error');
  errorEl.classList.add('hidden');

  if (newPassword.length < 6) {
    errorEl.textContent = 'La contrasena debe tener al menos 6 caracteres';
    errorEl.classList.remove('hidden');
    return;
  }

  const result = await api('/api/professionals', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_password',
      email,
      code,
      newPassword
    })
  });

  if (result.success && result.sessionToken) {
    sessionToken = result.sessionToken;
    localStorage.setItem('hdd_admin_session', sessionToken);

    // Check admin role
    const roleResult = await api(`/api/hdd/admin?action=my_role&sessionToken=${sessionToken}`);

    if (roleResult.role) {
      adminRole = roleResult.role;
      adminEmail = roleResult.email;
      permissions = roleResult.permissions;
      showApp();
      loadDashboard();
    } else {
      alert('Contrasena restablecida exitosamente, pero no tiene permisos de administrador del HDD.');
      showLoginForm();
    }
  } else {
    errorEl.textContent = result.error || 'Error al restablecer contrasena';
    errorEl.classList.remove('hidden');
  }
});

// Init
async function init() {
  const valid = await verifySession();
  if (valid) {
    showApp();
    loadDashboard();
    renderCustomRooms();
    renderResources();
  } else {
    showLogin();
  }
}

init();
