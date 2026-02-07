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
// METRICS FUNCTIONS
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

  if (!patientId) {
    contentDiv.classList.add('hidden');
    return;
  }

  contentDiv.classList.remove('hidden');

  // Try to load metrics from API
  try {
    const result = await api(`/api/hdd/admin?action=patient_metrics&patientId=${patientId}&sessionToken=${sessionToken}`);

    if (result.metrics) {
      document.getElementById('metric-logins').textContent = result.metrics.loginCount || 0;
      document.getElementById('metric-games').textContent = result.metrics.gameSessions || 0;
      document.getElementById('metric-posts').textContent = result.metrics.postsCount || 0;
      document.getElementById('metric-time').textContent = formatDuration(result.metrics.totalGameTime || 0);

      renderGamesProgress(result.gamesProgress || []);
      renderRecentActivity(result.recentActivity || []);
    } else {
      setDefaultMetrics();
    }
  } catch (e) {
    // If API doesn't have this action yet, show placeholder data
    setDefaultMetrics();
  }
}

function setDefaultMetrics() {
  document.getElementById('metric-logins').textContent = '-';
  document.getElementById('metric-games').textContent = '-';
  document.getElementById('metric-posts').textContent = '-';
  document.getElementById('metric-time').textContent = '-';

  document.getElementById('games-progress-list').innerHTML = `
    <div class="alert alert-info">
      Las metricas detalladas de juegos se mostraran cuando el paciente utilice el portal.
    </div>
  `;

  document.getElementById('recent-activity-list').innerHTML = `
    <div class="alert alert-info">
      La actividad reciente se mostrara cuando el paciente interactue con el sistema.
    </div>
  `;
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
