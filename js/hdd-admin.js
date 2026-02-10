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
              <th></th>
              <th>Actividad</th>
              <th>Dia</th>
              <th>Horario</th>
              <th>Profesional</th>
              <th>Ubicacion</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${result.activities.map(a => `
              <tr>
                <td style="font-size: 1.5rem;">${a.icon || '📋'}</td>
                <td><strong>${escapeHtml(a.name)}</strong>${a.description ? `<br><small style="color:var(--text-muted);">${escapeHtml(a.description)}</small>` : ''}</td>
                <td>${a.dayName}</td>
                <td>${a.startTime} - ${a.endTime}</td>
                <td>${escapeHtml(a.professional || '-')}</td>
                <td>${escapeHtml(a.location || '-')}</td>
                <td>
                  <span class="status-badge ${a.isActive ? 'status-active' : 'status-discharged'}">
                    ${a.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td>
                  <div class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="showEditActivity(${a.id})">Editar</button>
                    <button class="btn btn-${a.isActive ? 'warning' : 'success'} btn-sm" onclick="toggleActivity(${a.id}, ${!a.isActive})">${a.isActive ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteActivity(${a.id})">Eliminar</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><p>No hay actividades configuradas</p><button class="btn btn-primary" style="margin-top:1rem;" onclick="showAddActivityModal()">+ Agregar Primera Actividad</button></div>';
  }
}

// Store loaded activities for editing
let activitiesData = [];

async function loadActivitiesData() {
  const result = await api(`/api/hdd/admin?action=activities&sessionToken=${sessionToken}`);
  activitiesData = result.activities || [];
}

function showAddActivityModal() {
  document.getElementById('activity-modal-title').textContent = 'Agregar Actividad';
  document.getElementById('add-activity-form').reset();
  document.getElementById('activity-edit-id').value = '';
  document.getElementById('add-activity-modal').classList.remove('hidden');
}

async function showEditActivity(activityId) {
  // Refresh data
  await loadActivitiesData();
  const a = activitiesData.find(act => act.id === activityId);
  if (!a) return;

  document.getElementById('activity-modal-title').textContent = 'Editar Actividad';
  document.getElementById('activity-edit-id').value = a.id;
  document.getElementById('activity-name').value = a.name || '';
  document.getElementById('activity-description').value = a.description || '';
  document.getElementById('activity-day').value = a.dayOfWeek != null ? a.dayOfWeek : '';
  document.getElementById('activity-start').value = a.startTime || '';
  document.getElementById('activity-end').value = a.endTime || '';
  document.getElementById('activity-icon').value = a.icon || '🎵';
  document.getElementById('activity-professional').value = a.professional || '';
  document.getElementById('activity-location').value = a.location || '';

  document.getElementById('add-activity-modal').classList.remove('hidden');
}

async function saveActivity() {
  const editId = document.getElementById('activity-edit-id').value;
  const name = document.getElementById('activity-name').value.trim();
  const description = document.getElementById('activity-description').value.trim();
  const dayOfWeek = document.getElementById('activity-day').value;
  const startTime = document.getElementById('activity-start').value;
  const endTime = document.getElementById('activity-end').value;
  const icon = document.getElementById('activity-icon').value;
  const professional = document.getElementById('activity-professional').value.trim();
  const location = document.getElementById('activity-location').value.trim();

  if (!name || dayOfWeek === '' || !startTime || !endTime) {
    alert('Complete los campos obligatorios (nombre, dia, horario)');
    return;
  }

  const payload = {
    action: editId ? 'update_activity' : 'add_activity',
    sessionToken,
    name,
    description: description || null,
    dayOfWeek: parseInt(dayOfWeek),
    startTime,
    endTime,
    icon,
    professional: professional || null,
    location: location || null
  };

  if (editId) payload.activityId = parseInt(editId);

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (result.success) {
    hideModal('add-activity-modal');
    loadActivities();
    alert(editId ? 'Actividad actualizada' : 'Actividad creada exitosamente');
  } else {
    alert(result.error || 'Error al guardar actividad');
  }
}

async function toggleActivity(activityId, isActive) {
  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'update_activity',
      sessionToken,
      activityId,
      isActive
    })
  });

  if (result.success) {
    loadActivities();
  } else {
    alert(result.error || 'Error al actualizar actividad');
  }
}

async function deleteActivity(activityId) {
  if (!confirm('Eliminar esta actividad? Esta accion no se puede deshacer.')) return;

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'delete_activity',
      sessionToken,
      activityId
    })
  });

  if (result.success) {
    loadActivities();
    alert('Actividad eliminada');
  } else {
    alert(result.error || 'Error al eliminar actividad');
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
  // Load resources when switching to resources tab
  if (tabId === 'resources') {
    loadResources();
  }
  // Load activities when switching to activities tab
  if (tabId === 'activities') {
    loadActivities();
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

      // Render clinical interpretations
      renderMoodClinicalInterpretation(result.moodHistory || []);
      renderColorClinicalInterpretation(result.colorHistory || []);
      renderGameClinicalInterpretation(result.gameSessionDetails || []);
      renderClinicalCorrelation(result.metrics, result.moodHistory || [], result.colorHistory || [], result.gameSessionDetails || []);
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

  // Clear clinical interpretations
  const moodInterp = document.getElementById('mood-clinical-interpretation');
  if (moodInterp) moodInterp.innerHTML = '';
  const colorInterp = document.getElementById('color-clinical-interpretation');
  if (colorInterp) colorInterp.innerHTML = '';
  const gameInterp = document.getElementById('game-clinical-interpretation');
  if (gameInterp) gameInterp.innerHTML = '';
  const corrSection = document.getElementById('clinical-correlation-content');
  if (corrSection) corrSection.innerHTML = '<p style="color:var(--text-muted);">Seleccione un paciente con datos para ver la correlacion clinica.</p>';
}

// =====================================
// CLINICAL INTERPRETATION FUNCTIONS
// =====================================

function renderMoodClinicalInterpretation(moodHistory) {
  const container = document.getElementById('mood-clinical-interpretation');
  if (!container) return;

  if (!moodHistory || moodHistory.length === 0) {
    container.innerHTML = '<p><strong>Interpretacion:</strong> Sin datos de animo registrados. El paciente aun no ha realizado check-ins diarios.</p>';
    return;
  }

  const moods = moodHistory.map(m => m.moodValue);
  const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
  const recent = moods.slice(-7);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const older = moods.slice(0, Math.max(1, moods.length - 7));
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  // Variability (standard deviation)
  const variance = moods.reduce((s, m) => s + Math.pow(m - avg, 2), 0) / moods.length;
  const stdDev = Math.sqrt(variance);

  // Count low mood days
  const lowDays = moods.filter(m => m <= 2).length;
  const lowPct = ((lowDays / moods.length) * 100).toFixed(0);

  // Trend detection
  let trendText = '';
  const trendDiff = recentAvg - olderAvg;
  if (moods.length < 3) {
    trendText = 'Datos insuficientes para tendencia.';
  } else if (trendDiff > 0.5) {
    trendText = '<span style="color:#166534;">Tendencia ascendente: el animo del paciente esta mejorando en los ultimos registros.</span>';
  } else if (trendDiff < -0.5) {
    trendText = '<span style="color:#991b1b;">Tendencia descendente: el animo del paciente esta empeorando. Evaluar posibles factores desencadenantes.</span>';
  } else {
    trendText = '<span style="color:#854d0e;">Tendencia estable: el animo se mantiene sin cambios significativos.</span>';
  }

  // Level interpretation
  let levelText = '';
  if (avg >= 4) {
    levelText = 'Nivel de animo general positivo (promedio ' + avg.toFixed(1) + '/5).';
  } else if (avg >= 3) {
    levelText = 'Nivel de animo moderado (promedio ' + avg.toFixed(1) + '/5). El paciente presenta estado emocional neutral.';
  } else if (avg >= 2) {
    levelText = '<span style="color:#9a3412;">Nivel de animo bajo (promedio ' + avg.toFixed(1) + '/5). Se recomienda seguimiento cercano.</span>';
  } else {
    levelText = '<span style="color:#991b1b;">Nivel de animo critico (promedio ' + avg.toFixed(1) + '/5). Se recomienda evaluacion inmediata.</span>';
  }

  // Stability
  let stabilityText = '';
  if (stdDev < 0.5) {
    stabilityText = 'Estabilidad emocional alta (baja variabilidad).';
  } else if (stdDev < 1.2) {
    stabilityText = 'Variabilidad emocional moderada (fluctuaciones normales).';
  } else {
    stabilityText = '<span style="color:#9a3412;">Alta variabilidad emocional (desv. est. ' + stdDev.toFixed(1) + '). Posible indicador de inestabilidad animica.</span>';
  }

  container.innerHTML = `
    <p><strong>Interpretacion clinica</strong> (${moods.length} registros)</p>
    <ul style="margin: 0.5rem 0; padding-left: 1.2rem; list-style: disc;">
      <li>${levelText}</li>
      <li>${trendText}</li>
      <li>${stabilityText}</li>
      <li>Dias con animo bajo (1-2): <strong>${lowDays}</strong> (${lowPct}% del total).${lowDays > 0 && lowPct > 30 ? ' <span style="color:#991b1b;">Atencion: alta proporcion de dias con malestar.</span>' : ''}</li>
    </ul>
  `;
}

function renderColorClinicalInterpretation(colorHistory) {
  const container = document.getElementById('color-clinical-interpretation');
  if (!container) return;

  if (!colorHistory || colorHistory.length === 0) {
    container.innerHTML = '<p><strong>Interpretacion:</strong> Sin datos de seleccion de color. El paciente no ha elegido colores en sus check-ins.</p>';
    return;
  }

  // Analyze color temperature (warm vs cool)
  const warmColors = ['#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00', '#FF6347', '#FF69B4', '#DC143C', '#FF1493', '#8B0000', '#F08080', '#FFA07A', '#FFDAB9', '#FFE4B5', '#FFD1DC', '#FFDAC1', '#FFE5B4'];
  const coolColors = ['#0000FF', '#00CED1', '#00BFFF', '#1E90FF', '#4B0082', '#228B22', '#32CD32', '#00FA9A', '#87CEEB', '#B0C4DE', '#ADD8E6', '#C1D4E0', '#C1C1E0', '#191970', '#006400'];
  const darkColors = ['#8B0000', '#800000', '#4B0082', '#191970', '#006400', '#2F4F4F', '#36454F', '#483C32', '#301934', '#1B1B1B', '#3C1414', '#1C2833'];

  let warm = 0, cool = 0, dark = 0, total = colorHistory.length;
  colorHistory.forEach(c => {
    const hex = (c.colorHex || '').toUpperCase();
    if (warmColors.some(w => w.toUpperCase() === hex)) warm++;
    if (coolColors.some(w => w.toUpperCase() === hex)) cool++;
    if (darkColors.some(w => w.toUpperCase() === hex)) dark++;
  });

  // Intensity distribution
  const intensityCounts = {};
  colorHistory.forEach(c => {
    const i = c.colorIntensity || 'vivid';
    intensityCounts[i] = (intensityCounts[i] || 0) + 1;
  });
  const dominantIntensity = Object.entries(intensityCounts).sort((a, b) => b[1] - a[1])[0];

  const intensityLabels = { vivid: 'Vivos', soft: 'Suaves', pastel: 'Pastel', dark: 'Oscuros', muted: 'Apagados' };

  let interpretation = '';
  if (dominantIntensity) {
    const intLabel = intensityLabels[dominantIntensity[0]] || dominantIntensity[0];
    const intPct = ((dominantIntensity[1] / total) * 100).toFixed(0);
    interpretation += `Paleta predominante: <strong>${intLabel}</strong> (${intPct}%). `;
  }

  if (warm > cool && warm > dark) {
    interpretation += 'Predominan colores calidos (asociados con energia, sociabilidad, estados activos). ';
  } else if (cool > warm && cool > dark) {
    interpretation += 'Predominan colores frios (asociados con calma, introspeccion, estado reflexivo). ';
  } else if (dark > warm && dark > cool) {
    interpretation += '<span style="color:#9a3412;">Predominan colores oscuros (pueden indicar estado animo bajo, fatiga o introversion. Correlacionar con nivel de animo).</span> ';
  }

  // Recent vs older color temperature
  const recentColors = colorHistory.slice(-5);
  const recentDark = recentColors.filter(c => darkColors.some(d => d.toUpperCase() === (c.colorHex || '').toUpperCase())).length;
  if (recentDark >= 3 && recentColors.length >= 5) {
    interpretation += '<span style="color:#991b1b;">Alerta: seleccion reciente concentrada en colores oscuros. Revisar estado emocional.</span>';
  }

  container.innerHTML = `
    <p><strong>Interpretacion cromatica</strong> (${total} selecciones)</p>
    <p style="margin-top: 0.3rem;">${interpretation}</p>
    <p style="margin-top: 0.3rem; font-size: 0.8rem; color: #94a3b8;"><em>Nota: la seleccion de color es un indicador complementario subjetivo. Debe interpretarse en conjunto con el nivel de animo y la observacion clinica.</em></p>
  `;
}

function renderGameClinicalInterpretation(sessions) {
  const container = document.getElementById('game-clinical-interpretation');
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<p><strong>Interpretacion:</strong> Sin sesiones de juego registradas.</p>';
    return;
  }

  const scores = sessions.map(s => s.score || 0);
  const durations = sessions.map(s => s.duration || 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Trend
  const recentScores = scores.slice(-5);
  const olderScores = scores.slice(0, Math.max(1, Math.floor(scores.length / 2)));
  const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;

  let trendText = '';
  if (sessions.length < 3) {
    trendText = 'Datos insuficientes para evaluar tendencia de rendimiento.';
  } else if (recentAvg > olderAvg * 1.15) {
    trendText = '<span style="color:#166534;">Mejora progresiva en rendimiento. Indica buena adaptacion cognitiva y aprendizaje.</span>';
  } else if (recentAvg < olderAvg * 0.85) {
    trendText = '<span style="color:#9a3412;">Decline en rendimiento. Puede indicar fatiga, desinteres o dificultad cognitiva. Evaluar en contexto clinico.</span>';
  } else {
    trendText = 'Rendimiento estable a lo largo de las sesiones.';
  }

  // Engagement
  let engagementText = '';
  const completedCount = sessions.filter(s => s.completed).length;
  const completionRate = ((completedCount / sessions.length) * 100).toFixed(0);
  if (completionRate >= 70) {
    engagementText = 'Alto nivel de compromiso (tasa de completado: ' + completionRate + '%). Buena motivacion y persistencia.';
  } else if (completionRate >= 40) {
    engagementText = 'Nivel de compromiso moderado (tasa de completado: ' + completionRate + '%). Tolerancia razonable a la frustracion.';
  } else {
    engagementText = '<span style="color:#9a3412;">Bajo nivel de completado (' + completionRate + '%). Posible indicador de baja tolerancia a la frustracion, desmotivacion o dificultad excesiva.</span>';
  }

  container.innerHTML = `
    <p><strong>Interpretacion de rendimiento ludico</strong> (${sessions.length} sesiones)</p>
    <ul style="margin: 0.5rem 0; padding-left: 1.2rem; list-style: disc;">
      <li>Puntuacion promedio: <strong>${avgScore.toFixed(0)}</strong> | Duracion promedio: <strong>${formatDuration(avgDuration)}</strong></li>
      <li>${trendText}</li>
      <li>${engagementText}</li>
    </ul>
    <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.3rem;"><em>Los juegos evaluan: motricidad fina, planificacion, atencion, memoria de trabajo y control de impulsos.</em></p>
  `;
}

function renderClinicalCorrelation(metrics, moodHistory, colorHistory, gameSessions) {
  const container = document.getElementById('clinical-correlation-content');
  if (!container) return;

  const hasData = (moodHistory && moodHistory.length > 0) || (gameSessions && gameSessions.length > 0);
  if (!hasData) {
    container.innerHTML = '<p style="color:var(--text-muted);">Se necesitan datos de animo y/o juegos para generar correlaciones clinicas. Los datos se acumularan a medida que el paciente use el portal.</p>';
    return;
  }

  let html = '<div style="display: grid; gap: 0.75rem;">';

  // Mood + Game correlation
  if (moodHistory && moodHistory.length >= 3 && gameSessions && gameSessions.length >= 3) {
    const moods = moodHistory.map(m => m.moodValue);
    const avgMood = moods.reduce((a, b) => a + b, 0) / moods.length;
    const scores = gameSessions.map(s => s.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Check if mood and game performance move together
    const recentMoods = moods.slice(-5);
    const recentScores = scores.slice(-5);
    const recentMoodAvg = recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
    const recentScoreAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

    const moodDirection = recentMoodAvg > avgMood ? 'mejorando' : recentMoodAvg < avgMood ? 'empeorando' : 'estable';
    const scoreDirection = recentScoreAvg > avgScore ? 'mejorando' : recentScoreAvg < avgScore ? 'empeorando' : 'estable';

    let corrText = '';
    if (moodDirection === scoreDirection) {
      corrText = `<strong>Correlacion positiva:</strong> El animo (${moodDirection}) y el rendimiento en juegos (${scoreDirection}) se mueven en la misma direccion. Esto sugiere coherencia entre el estado emocional y la capacidad cognitiva del paciente.`;
    } else if (moodDirection === 'mejorando' && scoreDirection === 'empeorando') {
      corrText = `<strong>Divergencia:</strong> El animo esta ${moodDirection} pero el rendimiento en juegos esta ${scoreDirection}. Posible fatiga cognitiva a pesar de mejora animica, o el paciente puede estar respondiendo al check-in de forma automatica.`;
    } else if (moodDirection === 'empeorando' && scoreDirection === 'mejorando') {
      corrText = `<strong>Divergencia:</strong> El animo esta ${moodDirection} pero el rendimiento en juegos esta ${scoreDirection}. El paciente mantiene capacidad cognitiva pero su estado emocional requiere atencion.`;
    } else {
      corrText = `Animo: ${moodDirection}. Rendimiento ludico: ${scoreDirection}. No se observa una correlacion clara.`;
    }

    html += `<div style="background: #fff; border-radius: 8px; padding: 0.75rem; border-left: 3px solid #2563eb;">
      <p style="font-weight: 600; color: #1e40af; margin-bottom: 0.3rem;">Animo vs. Rendimiento Cognitivo</p>
      <p>${corrText}</p>
    </div>`;
  }

  // Engagement correlation
  if (metrics) {
    const engagement = metrics.loginCount || 0;
    const gamePlays = metrics.gameSessions || 0;
    const posts = metrics.postsCount || 0;

    let engLevel = '';
    const totalActivity = engagement + gamePlays + posts;
    if (totalActivity >= 20) {
      engLevel = '<span style="color:#166534;"><strong>Alto compromiso</strong> con el portal. El paciente utiliza activamente los recursos digitales.</span>';
    } else if (totalActivity >= 5) {
      engLevel = '<strong>Compromiso moderado</strong> con el portal. Uso intermitente de las herramientas digitales.';
    } else {
      engLevel = '<span style="color:#9a3412;"><strong>Bajo compromiso</strong> con el portal. Considerar motivar al paciente o evaluar barreras de acceso.</span>';
    }

    html += `<div style="background: #fff; border-radius: 8px; padding: 0.75rem; border-left: 3px solid #10b981;">
      <p style="font-weight: 600; color: #065f46; margin-bottom: 0.3rem;">Nivel de Participacion Digital</p>
      <p>${engLevel} (${engagement} logins, ${gamePlays} juegos, ${posts} publicaciones)</p>
    </div>`;
  }

  // Color + Mood correlation
  if (colorHistory && colorHistory.length >= 3 && moodHistory && moodHistory.length >= 3) {
    const darkColors = ['#8B0000', '#800000', '#4B0082', '#191970', '#006400', '#2F4F4F', '#36454F', '#483C32', '#301934', '#1B1B1B'];
    const darkCount = colorHistory.filter(c => darkColors.some(d => d.toUpperCase() === (c.colorHex || '').toUpperCase())).length;
    const darkPct = ((darkCount / colorHistory.length) * 100).toFixed(0);

    const moods = moodHistory.map(m => m.moodValue);
    const avgMood = (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1);

    let colorMoodText = '';
    if (darkPct > 40 && avgMood < 3) {
      colorMoodText = '<span style="color:#991b1b;">Congruencia preocupante: alta seleccion de colores oscuros (' + darkPct + '%) con animo bajo (prom. ' + avgMood + '/5). Patrón consistente con estado depresivo.</span>';
    } else if (darkPct > 40 && avgMood >= 3) {
      colorMoodText = 'Seleccion de colores oscuros (' + darkPct + '%) con animo reportado como aceptable (' + avgMood + '/5). Posible discrepancia a explorar en sesion clinica.';
    } else {
      colorMoodText = 'La seleccion de colores es coherente con el nivel de animo reportado (prom. ' + avgMood + '/5, colores oscuros: ' + darkPct + '%).';
    }

    html += `<div style="background: #fff; border-radius: 8px; padding: 0.75rem; border-left: 3px solid #8b5cf6;">
      <p style="font-weight: 600; color: #5b21b6; margin-bottom: 0.3rem;">Color vs. Estado Animo</p>
      <p>${colorMoodText}</p>
    </div>`;
  }

  html += '</div>';
  html += '<p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.75rem;"><em>Las correlaciones son indicadores orientativos basados en datos del portal. No reemplazan la evaluacion clinica profesional.</em></p>';

  container.innerHTML = html;
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
// MOOD CHART (Longitudinal)
// =====================================
const MOOD_COLOR_MAP = {
  rojo: '#dc2626', naranja: '#ea580c', amarillo: '#eab308',
  verde: '#16a34a', celeste: '#0ea5e9', azul: '#2563eb',
  violeta: '#7c3aed', rosa: '#ec4899', marron: '#78350f',
  gris: '#6b7280', negro: '#1e1e1e', blanco: '#f8fafc'
};

const MOOD_EMOJIS = { 1: '😢', 2: '😔', 3: '😐', 4: '🙂', 5: '😊' };

function renderMoodChart(moodHistory) {
  const canvas = document.getElementById('mood-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  const W = container.clientWidth - 32;
  const H = 200;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  if (!moodHistory || moodHistory.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos de animo registrados', W / 2, H / 2);
    return;
  }

  const pad = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const y = pad.top + chartH - ((i - 1) / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    // Y axis labels (mood emoji)
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(MOOD_EMOJIS[i] || i, pad.left - 8, y + 4);
  }

  // Data line
  const points = moodHistory.map((m, i) => ({
    x: pad.left + (moodHistory.length > 1 ? (i / (moodHistory.length - 1)) * chartW : chartW / 2),
    y: pad.top + chartH - ((m.mood - 1) / 4) * chartH,
    color: m.color,
    mood: m.mood,
    date: m.date
  }));

  // Fill under curve
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
  ctx.lineTo(points[0].x, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(37,99,235,0.08)';
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2.5;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Data points with color
  points.forEach(p => {
    const dotColor = p.color && MOOD_COLOR_MAP[p.color] ? MOOD_COLOR_MAP[p.color] : '#2563eb';
    ctx.beginPath();
    ctx.fillStyle = dotColor;
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X axis dates (show a few)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(moodHistory.length / 6));
  for (let i = 0; i < moodHistory.length; i += step) {
    const d = new Date(moodHistory[i].date);
    const label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    ctx.fillText(label, points[i].x, H - 5);
  }
}

function renderColorHistory(moodHistory) {
  const dotsContainer = document.getElementById('color-history-dots');
  const freqContainer = document.getElementById('color-frequency');
  if (!dotsContainer || !freqContainer) return;

  const withColor = moodHistory.filter(m => m.color);

  if (withColor.length === 0) {
    dotsContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Sin datos de color aun.</span>';
    freqContainer.innerHTML = '';
    return;
  }

  // Render color dots timeline
  dotsContainer.innerHTML = withColor.map(m => {
    const hex = MOOD_COLOR_MAP[m.color] || '#ccc';
    const d = new Date(m.date);
    const dateStr = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    const border = m.color === 'blanco' ? 'border:2px solid #cbd5e1;' : '';
    return `<div title="${dateStr} - ${m.color} (animo: ${MOOD_EMOJIS[m.mood] || m.mood})" style="width:28px;height:28px;border-radius:50%;background:${hex};${border}cursor:help;flex-shrink:0;"></div>`;
  }).join('');

  // Frequency analysis
  const freq = {};
  withColor.forEach(m => { freq[m.color] = (freq[m.color] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  freqContainer.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);width:100%;margin-bottom:0.25rem;">Frecuencia:</p>' +
    sorted.map(([color, count]) => {
      const hex = MOOD_COLOR_MAP[color] || '#ccc';
      const border = color === 'blanco' ? 'border:1px solid #cbd5e1;' : '';
      return `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.82rem;background:#f1f5f9;padding:0.2rem 0.5rem;border-radius:8px;"><span style="width:14px;height:14px;border-radius:50%;background:${hex};${border}display:inline-block;"></span>${color}: ${count}</span>`;
    }).join('');
}

function renderMoodHistoryTable(moodHistory, crisisAlerts) {
  const container = document.getElementById('mood-history-table');
  if (!container) return;

  if (!moodHistory || moodHistory.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Sin registros de check-in diario</p></div>';
    return;
  }

  // Show most recent first
  const reversed = [...moodHistory].reverse().slice(0, 30);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Animo</th>
          <th>Color</th>
          <th>Nota</th>
          <th>Alerta</th>
        </tr>
      </thead>
      <tbody>
        ${reversed.map(m => {
          const d = new Date(m.date);
          const dateStr = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
          const hex = m.color && MOOD_COLOR_MAP[m.color] ? MOOD_COLOR_MAP[m.color] : null;
          const colorDot = hex
            ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;"><span style="width:16px;height:16px;border-radius:50%;background:${hex};display:inline-block;${m.color==='blanco'?'border:1px solid #cbd5e1;':''}"></span>${m.color}</span>`
            : '-';
          const alertMatch = crisisAlerts.find(a => {
            const aDate = new Date(a.date).toDateString();
            return aDate === d.toDateString();
          });
          const alertBadge = alertMatch
            ? `<span class="status-badge" style="background:#fee2e2;color:#991b1b;">${alertMatch.status}</span>`
            : '';
          return `
            <tr${m.mood <= 2 ? ' style="background:#fef2f2;"' : ''}>
              <td>${dateStr}</td>
              <td>${MOOD_EMOJIS[m.mood] || m.mood} (${m.mood}/5)</td>
              <td>${colorDot}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.note || '-')}</td>
              <td>${alertBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
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
// RESOURCES FUNCTIONS (DB-backed)
// =====================================
let resourcesData = [];

async function loadResources() {
  const container = document.getElementById('resources-list');
  try {
    const result = await api(`/api/hdd/admin?action=resources&sessionToken=${sessionToken}`);
    resourcesData = result.resources || [];
    renderResourcesList();
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>Error al cargar recursos</p></div>';
  }
}

function renderResourcesList() {
  const container = document.getElementById('resources-list');

  if (resourcesData.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><p>No hay recursos configurados</p><button class="btn btn-primary" style="margin-top:1rem;" onclick="showAddResourceModal()">+ Agregar Primer Recurso</button></div>';
    return;
  }

  container.innerHTML = resourcesData.map(r => `
    <div class="resource-card" data-category="${r.resourceType}">
      <div class="resource-icon">${r.icon || getResourceIcon(r.resourceType)}</div>
      <div class="resource-content">
        <h4>${escapeHtml(r.title)}</h4>
        <p>${escapeHtml(r.description || 'Sin descripcion')}</p>
        <div class="resource-meta">
          <span class="resource-type">${r.resourceType}</span>
          ${r.duration ? `<span>${escapeHtml(r.duration)}</span>` : ''}
          ${!r.isActive ? '<span style="color:var(--error);">Inactivo</span>' : ''}
        </div>
      </div>
      <div class="resource-actions">
        <button class="btn btn-primary btn-sm" onclick="openResource('${r.resourceType}', '${escapeHtml(r.url)}')">Ver</button>
        <button class="btn btn-secondary btn-sm" onclick="showEditResource(${r.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteResource(${r.id})">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function showAddResourceModal() {
  document.getElementById('add-resource-form').reset();
  document.getElementById('add-resource-modal').classList.remove('hidden');
}

async function addResource() {
  const title = document.getElementById('resource-title').value.trim();
  const resourceType = document.getElementById('resource-type').value;
  const url = document.getElementById('resource-url').value.trim();
  const description = document.getElementById('resource-description').value.trim();
  const duration = document.getElementById('resource-duration').value.trim();

  if (!title || !url) {
    alert('Complete los campos obligatorios');
    return;
  }

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'add_resource',
      sessionToken,
      title,
      resourceType,
      url,
      description: description || null,
      duration: duration || null
    })
  });

  if (result.success) {
    hideModal('add-resource-modal');
    loadResources();
    alert('Recurso agregado exitosamente');
  } else {
    alert(result.error || 'Error al agregar recurso');
  }
}

function showEditResource(resourceId) {
  const r = resourcesData.find(res => res.id === resourceId);
  if (!r) return;

  document.getElementById('edit-resource-id').value = r.id;
  document.getElementById('edit-resource-title').value = r.title || '';
  document.getElementById('edit-resource-type').value = r.resourceType || 'link';
  document.getElementById('edit-resource-url').value = r.url || '';
  document.getElementById('edit-resource-description').value = r.description || '';
  document.getElementById('edit-resource-duration').value = r.duration || '';

  document.getElementById('edit-resource-modal').classList.remove('hidden');
}

async function updateResource() {
  const resourceId = parseInt(document.getElementById('edit-resource-id').value);
  const title = document.getElementById('edit-resource-title').value.trim();
  const resourceType = document.getElementById('edit-resource-type').value;
  const url = document.getElementById('edit-resource-url').value.trim();
  const description = document.getElementById('edit-resource-description').value.trim();
  const duration = document.getElementById('edit-resource-duration').value.trim();

  if (!title || !url) {
    alert('Complete los campos obligatorios');
    return;
  }

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'update_resource',
      sessionToken,
      resourceId,
      title,
      resourceType,
      url,
      description: description || null,
      duration: duration || null
    })
  });

  if (result.success) {
    hideModal('edit-resource-modal');
    loadResources();
    alert('Recurso actualizado');
  } else {
    alert(result.error || 'Error al actualizar recurso');
  }
}

async function deleteResource(resourceId) {
  if (!confirm('Eliminar este recurso?')) return;

  const result = await api('/api/hdd/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'delete_resource',
      sessionToken,
      resourceId
    })
  });

  if (result.success) {
    loadResources();
    alert('Recurso eliminado');
  } else {
    alert(result.error || 'Error al eliminar recurso');
  }
}

function getResourceIcon(type) {
  const icons = { video: '🎥', document: '📄', course: '🎓', link: '🔗' };
  return icons[type] || '📎';
}

function filterResources(category) {
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

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
