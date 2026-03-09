// ═══════════════════════════════════════════════════════════
// HCE — Historia Clínica Electrónica - Frontend Logic
// ═══════════════════════════════════════════════════════════

const API = '/api/hdd-hce';
let sessionToken = null;
let patientId = null;
let hceData = null;
let currentFilter = 'all';
let autosaveTimer = null;
let lastSavedContent = '';

// ── Specialty → color mapping ─────────────────────────────
const SPECIALTY_COLORS = {
  'psiquiatria': 'psiquiatria',
  'psiquiatra': 'psiquiatria',
  'psychiatry': 'psiquiatria',
  'medico psiquiatra': 'psiquiatria',
  'medica psiquiatra': 'psiquiatria',
  'psicologia': 'psicologia',
  'psicologa': 'psicologia',
  'psicologo': 'psicologia',
  'psychology': 'psicologia',
  'enfermeria': 'enfermeria',
  'enfermero': 'enfermeria',
  'enfermera': 'enfermeria',
  'nursing': 'enfermeria',
  'guardia': 'guardia',
  'terapia ocupacional': 'to',
  'to': 'to',
  'nutricion': 'nutricion',
  'nutricionista': 'nutricion',
  'trabajo social': 'trabajo-social',
  'trabajador social': 'trabajo-social',
  'trabajadora social': 'trabajo-social',
};

function getSpecialtyColor(specialty, tipo) {
  if (tipo === 'guardia' || tipo === 'ingreso' || tipo === 'egreso') return 'guardia';
  if (!specialty) return 'otro';
  const key = specialty.toLowerCase().trim();
  return SPECIALTY_COLORS[key] || 'otro';
}

function getSpecialtyLabel(specialty) {
  if (!specialty) return 'Profesional';
  const key = specialty.toLowerCase().trim();
  if (key.includes('psiquiatr')) return 'Psiquiatria';
  if (key.includes('psicolog')) return 'Psicologia';
  if (key.includes('enfermer')) return 'Enfermeria';
  if (key.includes('guardia')) return 'Guardia';
  if (key.includes('ocupacional') || key === 'to') return 'T.O.';
  if (key.includes('nutrici')) return 'Nutricion';
  if (key.includes('social')) return 'T. Social';
  return specialty;
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  sessionToken = sessionStorage.getItem('adminSessionToken') || localStorage.getItem('adminSessionToken');
  const params = new URLSearchParams(window.location.search);
  patientId = params.get('id');

  if (!sessionToken || !patientId) {
    alert('Sesion no valida o paciente no especificado.');
    window.location.href = '/hdd/admin';
    return;
  }

  loadPatientHCE();
  setupSidebarTabs();
  setupFilterButtons();
  setupAutosave();
});

// ── API call helper ───────────────────────────────────────
async function apiCall(action, data = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, sessionToken, patientId, ...data })
  });
  return res.json();
}

// ── Load full patient HCE ─────────────────────────────────
async function loadPatientHCE() {
  try {
    const result = await apiCall('get_patient_hce');
    if (!result.success) {
      alert(result.error || 'Error cargando HC');
      return;
    }

    hceData = result;
    renderPatientHeader(result.patient);
    renderMedications(result.medications);
    renderDiagnoses(result.diagnoses);
    renderAntecedentes(result.antecedentes);
    renderEvolutions(result.evolutions);
    renderStudies(result.studies);

    document.getElementById('hce-loading').style.display = 'none';
    document.getElementById('hce-patient-header').style.display = 'flex';
    document.getElementById('hce-main').style.display = 'grid';

    // Store prof name
    const profName = sessionStorage.getItem('adminProfName') || '';
    document.getElementById('hce-prof-name').textContent = profName;

  } catch (err) {
    console.error('Error loading HCE:', err);
    document.getElementById('hce-loading').innerHTML =
      '<span style="color:#ef4444;">Error de conexion. Intente nuevamente.</span>';
  }
}

// ── Render patient header ─────────────────────────────────
function renderPatientHeader(p) {
  document.getElementById('hce-patient-name').textContent = p.full_name || 'Sin nombre';
  document.getElementById('hce-patient-dni').textContent = 'DNI: ' + (p.dni || '-');
  document.getElementById('hce-patient-hc-number').textContent = p.numero_historia_clinica || '';

  // Calculate age
  if (p.fecha_nacimiento) {
    const birth = new Date(p.fecha_nacimiento);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
    const months = (now.getMonth() - birth.getMonth() + 12) % 12;
    document.getElementById('hce-patient-age').textContent = years + ' Años y ' + months + ' Meses';
  } else {
    document.getElementById('hce-patient-age').textContent = '';
  }

  // Obra social from notes or other field
  document.getElementById('hce-patient-os').textContent = '';

  // Alerts
  const alertsEl = document.getElementById('hce-patient-alerts');
  alertsEl.innerHTML = '';

  if (p.grupo_sanguineo) {
    alertsEl.innerHTML += '<span class="hce-alert-badge hce-alert-blood">' + esc(p.grupo_sanguineo) + '</span>';
  }

  // Check allergies from antecedentes
  if (hceData && hceData.antecedentes) {
    const allergies = hceData.antecedentes.filter(a => a.tipo === 'alergico');
    if (allergies.length > 0) {
      alertsEl.innerHTML += '<span class="hce-alert-badge hce-alert-allergy">ALERGIAS: ' +
        allergies.map(a => esc(a.descripcion)).join(', ') + '</span>';
    }
  }

  alertsEl.innerHTML += '<span class="hce-alert-badge hce-alert-status">' + esc(p.status || 'active') + '</span>';
}

// ── Render medications ────────────────────────────────────
function renderMedications(meds) {
  const activeEl = document.getElementById('hce-meds-active');
  const inactiveEl = document.getElementById('hce-meds-inactive');

  const active = meds.filter(m => m.estado === 'activo');
  const inactive = meds.filter(m => m.estado !== 'activo');

  if (active.length === 0) {
    activeEl.innerHTML = '<div class="hce-empty" style="padding:1rem;font-size:0.8rem;">Sin medicacion activa</div>';
  } else {
    activeEl.innerHTML = active.map(m => `
      <div class="hce-med-item">
        <div>
          <span class="hce-med-drug">${esc(m.droga)}</span>
          ${m.nombre_comercial ? '<span style="color:#94a3b8;font-size:0.75rem;"> (' + esc(m.nombre_comercial) + ')</span>' : ''}
        </div>
        <div>
          <span class="hce-med-dose">${esc(m.dosis)}</span>
          <span class="hce-med-schedule">${esc(m.frecuencia)} - ${esc(m.via || 'oral')}</span>
        </div>
        <div class="hce-med-prescriber">
          ${esc(m.prescripto_por || '')} - Desde ${formatDate(m.fecha_inicio)}
          <button style="margin-left:0.5rem;font-size:0.65rem;padding:0.1rem 0.3rem;border:1px solid #e2e8f0;border-radius:3px;background:#fff;cursor:pointer;" onclick="suspendMed(${m.id})">Suspender</button>
        </div>
      </div>
    `).join('');
  }

  if (inactive.length === 0) {
    inactiveEl.innerHTML = '<div class="hce-empty" style="padding:0.5rem;font-size:0.75rem;">-</div>';
  } else {
    inactiveEl.innerHTML = inactive.map(m => `
      <div class="hce-med-item hce-med-suspended">
        <div>
          <span class="hce-med-drug">${esc(m.droga)}</span>
          <span class="hce-med-dose">${esc(m.dosis)}</span>
        </div>
        <div class="hce-med-prescriber">
          ${m.motivo_suspension ? 'Motivo: ' + esc(m.motivo_suspension) : esc(m.estado)}
        </div>
      </div>
    `).join('');
  }
}

// ── Render diagnoses ──────────────────────────────────────
function renderDiagnoses(diags) {
  const el = document.getElementById('hce-diagnoses');
  if (!diags || diags.length === 0) {
    el.innerHTML = '<div class="hce-empty" style="padding:1rem;font-size:0.8rem;">Sin diagnosticos registrados</div>';
    return;
  }

  el.innerHTML = diags.map(d => `
    <div class="hce-diag-item ${d.estado === 'resuelto' ? 'hce-diag-resolved' : ''}">
      <div>
        ${d.codigo ? '<span class="hce-diag-code">[' + esc(d.codigo) + ']</span> ' : ''}
        <span class="hce-diag-desc">${esc(d.descripcion)}</span>
      </div>
      <div class="hce-diag-type">
        ${esc(d.tipo)} - ${esc(d.estado)}
        ${d.diagnosticado_por ? ' - ' + esc(d.diagnosticado_por) : ''}
        ${d.estado === 'activo' ? '<button style="margin-left:0.5rem;font-size:0.6rem;padding:0.1rem 0.3rem;border:1px solid #e2e8f0;border-radius:3px;background:#fff;cursor:pointer;" onclick="resolveDiag(' + d.id + ')">Resolver</button>' : ''}
      </div>
    </div>
  `).join('');
}

// ── Render antecedentes ───────────────────────────────────
function renderAntecedentes(ants) {
  const el = document.getElementById('hce-antecedentes');
  if (!ants || ants.length === 0) {
    el.innerHTML = '<div class="hce-empty" style="padding:1rem;font-size:0.8rem;">Sin antecedentes registrados</div>';
    return;
  }

  // Group by tipo
  const grouped = {};
  ants.forEach(a => {
    if (!grouped[a.tipo]) grouped[a.tipo] = [];
    grouped[a.tipo].push(a);
  });

  el.innerHTML = Object.entries(grouped).map(([tipo, items]) => `
    <div class="hce-ant-item">
      <div class="hce-ant-tipo">${esc(tipo)}</div>
      ${items.map(a => `
        <div style="font-size:0.82rem;margin-left:0.5rem;">
          ${esc(a.descripcion)}
          ${a.fecha_aproximada ? '<span style="color:#94a3b8;"> (' + esc(a.fecha_aproximada) + ')</span>' : ''}
        </div>
      `).join('')}
    </div>
  `).join('');
}

// ── Render evolutions ─────────────────────────────────────
function renderEvolutions(evos) {
  const el = document.getElementById('hce-evo-list');

  // Filter out drafts
  const visible = evos.filter(e => e.tipo !== 'borrador');

  if (visible.length === 0) {
    el.innerHTML = '<div class="hce-empty">Sin evoluciones registradas. Haga clic en "+ Nueva Evolucion" para agregar la primera.</div>';
    return;
  }

  el.innerHTML = visible.map(e => {
    const color = getSpecialtyColor(e.profesional_especialidad, e.tipo);
    const label = e.tipo === 'guardia' ? 'Guardia' : getSpecialtyLabel(e.profesional_especialidad);
    const filterClass = getFilterClass(color);

    return `
      <div class="hce-evo-card" data-specialty="${filterClass}" data-id="${e.id}">
        <div class="hce-evo-header" onclick="toggleEvo(this)">
          <div class="hce-evo-color-bar hce-evo-color-${color}"></div>
          <span class="hce-evo-prof-badge hce-badge-${color}">${esc(label)}</span>
          <div class="hce-evo-info">
            <div class="hce-evo-prof-name">${esc(e.profesional_nombre || 'Profesional')}</div>
            <div class="hce-evo-date">${formatDateTime(e.fecha)} ${e.tipo !== 'evolucion' ? '- ' + esc(e.tipo) : ''}</div>
          </div>
          <div class="hce-evo-preview">${esc((e.contenido || '').substring(0, 80))}...</div>
          <span class="hce-evo-toggle">&#9660;</span>
        </div>
        <div class="hce-evo-body">
          ${e.motivo_consulta ? '<div style="margin-bottom:0.5rem;"><strong>Motivo:</strong> ' + esc(e.motivo_consulta) + '</div>' : ''}
          <div class="hce-evo-content">${esc(e.contenido || '')}</div>
          ${(e.examen_mental || e.plan_terapeutico) ? `
            <div class="hce-evo-fields">
              ${e.examen_mental ? '<div class="hce-evo-field"><div class="hce-evo-field-label">Examen Mental</div><div class="hce-evo-field-value">' + esc(e.examen_mental) + '</div></div>' : ''}
              ${e.plan_terapeutico ? '<div class="hce-evo-field"><div class="hce-evo-field-label">Plan Terapeutico</div><div class="hce-evo-field-value">' + esc(e.plan_terapeutico) + '</div></div>' : ''}
            </div>
          ` : ''}
          ${e.indicaciones ? '<div style="margin-top:0.5rem;"><strong>Indicaciones:</strong> ' + esc(e.indicaciones) + '</div>' : ''}
          ${e.editado ? '<div class="hce-evo-edited">Editado el ' + formatDateTime(e.editado_at) + '</div>' : ''}
        </div>
      </div>
    `;
  }).join('');

  applyFilter();
}

function getFilterClass(color) {
  if (['psiquiatria'].includes(color)) return 'psiquiatria';
  if (['psicologia'].includes(color)) return 'psicologia';
  if (['enfermeria'].includes(color)) return 'enfermeria';
  if (['guardia'].includes(color)) return 'guardia';
  return 'otro';
}

// ── Render studies ────────────────────────────────────────
function renderStudies(studies) {
  const el = document.getElementById('hce-studies-list');
  if (!studies || studies.length === 0) {
    el.innerHTML = '<div class="hce-empty">Sin estudios registrados</div>';
    return;
  }

  el.innerHTML = studies.map(s => `
    <div style="padding:0.75rem;border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:600;font-size:0.9rem;">${esc(s.titulo || s.tipo)}</div>
      <div style="font-size:0.8rem;color:#64748b;">${formatDate(s.fecha_estudio)} - ${esc(s.tipo)}</div>
      ${s.descripcion ? '<div style="font-size:0.85rem;margin-top:0.25rem;">' + esc(s.descripcion) + '</div>' : ''}
      ${s.resultado_texto ? '<div style="font-size:0.85rem;margin-top:0.25rem;white-space:pre-wrap;">' + esc(s.resultado_texto) + '</div>' : ''}
    </div>
  `).join('');
}

// ── Toggle evolution card ─────────────────────────────────
function toggleEvo(headerEl) {
  const card = headerEl.closest('.hce-evo-card');
  card.classList.toggle('expanded');
}

// ── Filter buttons ────────────────────────────────────────
function setupFilterButtons() {
  document.querySelectorAll('.hce-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hce-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFilter();
    });
  });
}

function applyFilter() {
  document.querySelectorAll('.hce-evo-card').forEach(card => {
    if (currentFilter === 'all') {
      card.style.display = '';
    } else {
      card.style.display = card.dataset.specialty === currentFilter ? '' : 'none';
    }
  });
}

// ── Sidebar tabs ──────────────────────────────────────────
function setupSidebarTabs() {
  document.querySelectorAll('.hce-sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hce-sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.hce-sidebar-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('sidebar-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// ── New evolution form ────────────────────────────────────
function toggleNewEvoForm() {
  const form = document.getElementById('hce-new-evo-form');
  form.classList.toggle('visible');
  if (form.classList.contains('visible')) {
    document.getElementById('evo-contenido').focus();
  }
}

// ── Autosave ──────────────────────────────────────────────
function setupAutosave() {
  const textarea = document.getElementById('evo-contenido');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const content = textarea.value.trim();
      if (content && content !== lastSavedContent && content.length > 10) {
        try {
          await apiCall('autosave_draft', { draftContent: content, draftType: 'evolucion' });
          lastSavedContent = content;
          document.getElementById('hce-autosave-status').textContent =
            'Guardado automatico: ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          document.getElementById('hce-autosave-status').textContent = 'Error al autoguardar';
        }
      }
    }, 30000); // 30 seconds
  });
}

// ── Save evolution ────────────────────────────────────────
async function saveEvolution() {
  const contenido = document.getElementById('evo-contenido').value.trim();
  if (!contenido) {
    alert('Escriba el contenido de la evolucion.');
    return;
  }

  const data = {
    tipo: document.getElementById('evo-tipo').value,
    contenido,
    motivoConsulta: document.getElementById('evo-motivo').value.trim() || null,
    examenMental: document.getElementById('evo-examen').value.trim() || null,
    planTerapeutico: document.getElementById('evo-plan').value.trim() || null,
    indicaciones: document.getElementById('evo-indicaciones').value.trim() || null,
  };

  const result = await apiCall('add_evolution', data);
  if (result.success) {
    // Clear form
    document.getElementById('evo-contenido').value = '';
    document.getElementById('evo-motivo').value = '';
    document.getElementById('evo-examen').value = '';
    document.getElementById('evo-plan').value = '';
    document.getElementById('evo-indicaciones').value = '';
    document.getElementById('hce-autosave-status').textContent = '';
    lastSavedContent = '';
    toggleNewEvoForm();

    // Also delete draft if exists
    apiCall('commit_draft', { tipo: data.tipo }).catch(() => {});

    // Reload
    loadPatientHCE();
  } else {
    alert(result.error || 'Error al guardar evolucion');
  }
}

// ── Save medication ───────────────────────────────────────
async function saveMedication() {
  const droga = document.getElementById('med-droga').value.trim();
  const dosis = document.getElementById('med-dosis').value.trim();
  const frecuencia = document.getElementById('med-frecuencia').value.trim();

  if (!droga || !dosis || !frecuencia) {
    alert('Droga, dosis y frecuencia son requeridos.');
    return;
  }

  const result = await apiCall('add_medication', {
    droga,
    nombreComercial: document.getElementById('med-comercial').value.trim() || null,
    dosis,
    frecuencia,
    via: document.getElementById('med-via').value,
    fechaInicio: document.getElementById('med-fecha-inicio').value || null,
  });

  if (result.success) {
    closeModal('add-med');
    // Clear fields
    document.getElementById('med-droga').value = '';
    document.getElementById('med-comercial').value = '';
    document.getElementById('med-dosis').value = '';
    document.getElementById('med-frecuencia').value = '';
    loadPatientHCE();
  } else {
    alert(result.error || 'Error al guardar medicacion');
  }
}

// ── Suspend medication ────────────────────────────────────
async function suspendMed(medId) {
  const motivo = prompt('Motivo de suspension (opcional):');
  const result = await apiCall('update_medication', {
    medicationId: medId,
    estado: 'suspendido',
    motivoSuspension: motivo || null
  });

  if (result.success) {
    loadPatientHCE();
  } else {
    alert(result.error || 'Error');
  }
}

// ── Save diagnosis ────────────────────────────────────────
async function saveDiagnosis() {
  const descripcion = document.getElementById('diag-descripcion').value.trim();
  if (!descripcion) {
    alert('Descripcion es requerida.');
    return;
  }

  const result = await apiCall('add_diagnosis', {
    codigo: document.getElementById('diag-codigo').value.trim() || null,
    sistema: document.getElementById('diag-sistema').value,
    descripcion,
    tipo: document.getElementById('diag-tipo').value,
    fechaDiagnostico: document.getElementById('diag-fecha').value || null,
  });

  if (result.success) {
    closeModal('add-diag');
    document.getElementById('diag-codigo').value = '';
    document.getElementById('diag-descripcion').value = '';
    loadPatientHCE();
  } else {
    alert(result.error || 'Error al guardar diagnostico');
  }
}

// ── Resolve diagnosis ─────────────────────────────────────
async function resolveDiag(diagId) {
  if (!confirm('Marcar diagnostico como resuelto?')) return;
  const result = await apiCall('update_diagnosis', {
    diagnosisId: diagId,
    estado: 'resuelto'
  });
  if (result.success) loadPatientHCE();
}

// ── Save antecedente ──────────────────────────────────────
async function saveAntecedente() {
  const descripcion = document.getElementById('ant-descripcion').value.trim();
  const tipo = document.getElementById('ant-tipo').value;
  if (!descripcion) {
    alert('Descripcion es requerida.');
    return;
  }

  const result = await apiCall('add_antecedente', {
    tipo,
    descripcion,
    fechaAproximada: document.getElementById('ant-fecha').value.trim() || null,
    observaciones: document.getElementById('ant-observaciones').value.trim() || null,
  });

  if (result.success) {
    closeModal('add-ant');
    document.getElementById('ant-descripcion').value = '';
    document.getElementById('ant-fecha').value = '';
    document.getElementById('ant-observaciones').value = '';
    loadPatientHCE();
  } else {
    alert(result.error || 'Error al guardar antecedente');
  }
}

// ── Save vitals ───────────────────────────────────────────
async function saveVitals() {
  const result = await apiCall('add_vitals', {
    taSistolica: numOrNull('vital-ta-s'),
    taDiastolica: numOrNull('vital-ta-d'),
    fc: numOrNull('vital-fc'),
    fr: numOrNull('vital-fr'),
    temperatura: numOrNull('vital-temp'),
    saturacion: numOrNull('vital-sat'),
    glucemia: numOrNull('vital-glu'),
    pesoKg: numOrNull('vital-peso'),
    tallaCm: numOrNull('vital-talla'),
    notas: document.getElementById('vital-notas').value.trim() || null,
  });

  if (result.success) {
    closeModal('vitals');
    // Clear fields
    ['vital-ta-s','vital-ta-d','vital-fc','vital-fr','vital-temp','vital-sat','vital-glu','vital-peso','vital-talla','vital-notas'].forEach(id => {
      document.getElementById(id).value = '';
    });
    alert('Signos vitales registrados.');
  } else {
    alert(result.error || 'Error al registrar signos vitales');
  }
}

// ── Modal helpers ─────────────────────────────────────────
function openModal(name) {
  document.getElementById('modal-' + name).classList.remove('hidden');
}

function closeModal(name) {
  document.getElementById('modal-' + name).classList.add('hidden');
}

// ── Navigation ────────────────────────────────────────────
function goBack() {
  // If there's unsaved content, warn
  const content = document.getElementById('evo-contenido')?.value?.trim();
  if (content && content !== lastSavedContent) {
    if (!confirm('Tiene contenido sin guardar. Desea salir?')) return;
  }
  window.location.href = '/hdd/admin';
}

// ── Utility functions ─────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function numOrNull(id) {
  const val = document.getElementById(id).value.trim();
  return val ? parseFloat(val) : null;
}
