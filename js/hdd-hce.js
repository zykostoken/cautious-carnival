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
  sessionToken = sessionStorage.getItem('adminSessionToken')
    || localStorage.getItem('adminSessionToken')
    || localStorage.getItem('hdd_admin_session');
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
    renderSidebarOS(result.patient);
    renderDatosPersonales(result.patient);
    renderMedications(result.medications);
    renderDiagnoses(result.diagnoses);
    renderAntecedentes(result.antecedentes);
    renderEvolutions(result.evolutions);
    renderStudies(result.studies);
    renderLastVitals(result.vitals);
    loadConsent();

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

  // Obra social
  document.getElementById('hce-patient-os').textContent = p.obra_social || '';

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

// ── Render OS in sidebar (always visible above plan farmacologico) ──
function renderSidebarOS(p) {
  const nameEl = document.getElementById('hce-os-name');
  const numEl = document.getElementById('hce-os-numero');
  const modEl = document.getElementById('hce-os-modality');
  if (!nameEl) return;

  nameEl.textContent = p.obra_social || 'Sin obra social';
  numEl.textContent = p.obra_social_numero ? 'N° ' + p.obra_social_numero : '';

  const modalityLabels = {
    'internacion': 'Internacion',
    'hospital_de_dia': 'Hospital de Dia',
    'externo': 'Consultorio Externo'
  };
  modEl.textContent = modalityLabels[p.care_modality] || p.care_modality || '';
}

// ── Render Datos Personales tab ──────────────────────────
function renderDatosPersonales(p) {
  const datosEl = document.getElementById('hce-datos-personales');
  const familiarEl = document.getElementById('hce-datos-familiar');
  if (!datosEl) return;

  const field = (label, value) => value
    ? `<div><strong style="color:var(--hce-muted,#6b7280);font-size:0.75rem;">${label}:</strong> ${esc(value)}</div>`
    : '';

  const birthDate = p.fecha_nacimiento
    ? new Date(p.fecha_nacimiento).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  datosEl.innerHTML =
    field('Nombre', p.full_name) +
    field('DNI', p.dni) +
    field('Fecha Nac.', birthDate) +
    field('Sexo', p.sexo) +
    field('Genero', p.genero) +
    field('Estado Civil', p.estado_civil) +
    field('Nacionalidad', p.nacionalidad) +
    field('Direccion', [p.direccion, p.localidad, p.provincia, p.codigo_postal].filter(Boolean).join(', ')) +
    field('Telefono', p.phone) +
    field('Email', p.email) +
    field('Ocupacion', p.ocupacion) +
    field('Nivel Educativo', p.nivel_educativo) +
    field('Grupo Sanguineo', p.grupo_sanguineo) +
    field('N° HC Papel', p.numero_hc_papel) +
    field('N° HC Digital', p.numero_historia_clinica) +
    field('Obra Social', p.obra_social) +
    field('N° Afiliado', p.obra_social_numero) +
    field('Ingreso', p.admission_date ? new Date(p.admission_date).toLocaleDateString('es-AR') : null)
  || '<div style="color:var(--hce-muted,#6b7280);">Sin datos cargados</div>';

  if (familiarEl) {
    familiarEl.innerHTML =
      field('Contacto', p.contacto_emergencia_nombre) +
      field('Telefono', p.contacto_emergencia_telefono) +
      field('Relacion', p.contacto_emergencia_relacion)
    || '<div style="color:var(--hce-muted,#6b7280);">Sin familiar/responsable cargado</div>';
  }
}

// ── Consentimiento Informado ─────────────────────────────
function saveConsent() {
  // Save consent state to localStorage (per patient) - will persist until backend supports it
  const consentData = {
    tratamiento: document.getElementById('consent-tratamiento')?.checked || false,
    hce: document.getElementById('consent-hce')?.checked || false,
    medicacion: document.getElementById('consent-medicacion')?.checked || false,
    estudios: document.getElementById('consent-estudios')?.checked || false,
    internacion: document.getElementById('consent-internacion')?.checked || false,
    observaciones: document.getElementById('consent-observaciones')?.value || '',
    savedAt: new Date().toISOString()
  };
  localStorage.setItem('hce_consent_' + patientId, JSON.stringify(consentData));

  const statusEl = document.getElementById('consent-status');
  if (statusEl) {
    const anyChecked = Object.values(consentData).some(v => v === true);
    statusEl.textContent = anyChecked
      ? 'Registrado ' + new Date().toLocaleDateString('es-AR')
      : 'Sin registrar';
    statusEl.style.color = anyChecked ? '#22c55e' : '#6b7280';
  }
}

function loadConsent() {
  const saved = localStorage.getItem('hce_consent_' + patientId);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.tratamiento) document.getElementById('consent-tratamiento').checked = true;
    if (data.hce) document.getElementById('consent-hce').checked = true;
    if (data.medicacion) document.getElementById('consent-medicacion').checked = true;
    if (data.estudios) document.getElementById('consent-estudios').checked = true;
    if (data.internacion) document.getElementById('consent-internacion').checked = true;
    if (data.observaciones) document.getElementById('consent-observaciones').value = data.observaciones;
    const statusEl = document.getElementById('consent-status');
    if (statusEl && data.savedAt) {
      statusEl.textContent = 'Registrado ' + new Date(data.savedAt).toLocaleDateString('es-AR');
      statusEl.style.color = '#22c55e';
    }
  } catch(e) {}
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
          <div class="hce-firma-sello">
            <div class="hce-firma-line"></div>
            <div class="hce-firma-nombre">${esc(e.firma_nombre || e.profesional_nombre || '')}</div>
            <div class="hce-firma-detail">${esc(e.firma_especialidad || e.profesional_especialidad || '')}</div>
            ${e.firma_matricula ? '<div class="hce-firma-detail">' + esc(e.firma_matricula) + '</div>' : ''}
            <div class="hce-firma-detail">${formatDateTime(e.fecha)}</div>
          </div>
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
    // ── Save vitals from inline fields if valid ──
    const svData = parseInlineVitals();
    if (svData) {
      await apiCall('add_vitals', svData);
    }

    // Clear form
    document.getElementById('evo-contenido').value = '';
    document.getElementById('evo-motivo').value = '';
    document.getElementById('evo-examen').value = '';
    document.getElementById('evo-plan').value = '';
    document.getElementById('evo-indicaciones').value = '';
    clearInlineVitals();
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

// ── Parse inline vitals — only returns data if at least one value is valid ──
function parseInlineVitals() {
  const taRaw = (document.getElementById('evo-sv-ta')?.value || '').trim();
  const fcRaw = document.getElementById('evo-sv-fc')?.value;
  const frRaw = document.getElementById('evo-sv-fr')?.value;
  const tempRaw = document.getElementById('evo-sv-temp')?.value;
  const satRaw = document.getElementById('evo-sv-sat')?.value;
  const gluRaw = document.getElementById('evo-sv-glu')?.value;

  let taSistolica = null, taDiastolica = null;
  // Validate TA format: 2-3 digits / 2-3 digits (ej: 120/80, 100/50, 120/110)
  if (taRaw) {
    const taMatch = taRaw.match(/^(\d{2,3})\/(\d{2,3})$/);
    if (taMatch) {
      taSistolica = parseInt(taMatch[1]);
      taDiastolica = parseInt(taMatch[2]);
    }
    // If format doesn't match, ignore TA silently
  }

  const fc = fcRaw ? parseInt(fcRaw) : null;
  const fr = frRaw ? parseInt(frRaw) : null;
  const temperatura = tempRaw ? parseFloat(tempRaw) : null;
  const saturacion = satRaw ? parseInt(satRaw) : null;
  const glucemia = gluRaw ? parseInt(gluRaw) : null;

  // Only save if at least one value is present
  if (!taSistolica && !fc && !fr && !temperatura && !saturacion && !glucemia) {
    return null;
  }

  return { taSistolica, taDiastolica, fc, fr, temperatura, saturacion, glucemia };
}

function clearInlineVitals() {
  ['evo-sv-ta','evo-sv-fc','evo-sv-fr','evo-sv-temp','evo-sv-sat','evo-sv-glu'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
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

// ── Load & render metrics ─────────────────────────────────
let lastMetricsData = null;

async function loadMetrics() {
  openModal('metrics');
  const contentEl = document.getElementById('hce-metrics-content');
  contentEl.innerHTML = '<div class="hce-empty">Cargando metricas...</div>';

  const result = await apiCall('get_patient_metrics', {});
  if (!result.success) {
    contentEl.innerHTML = '<div class="hce-empty">No se pudieron cargar las metricas</div>';
    return;
  }

  lastMetricsData = result;
  const { gameProgress, gameSessions, moodCheckins, moodEntries } = result;

  let html = '';

  // Game progress summary
  if (gameProgress && gameProgress.length > 0) {
    html += '<div class="hce-metrics-section"><h4>Juegos Terapeuticos (ultimos 90 dias)</h4>';
    html += '<div class="hce-metrics-grid">';
    gameProgress.forEach(g => {
      const gameNames = { 'lawn-mower': 'Cortadora de Cesped', 'medication-memory': 'Memoria de Medicacion', 'pill-organizer': 'Pastillero', 'super-market': 'Supermercado', 'daily-routine': 'Rutina Diaria', 'fridge-logic': 'Logica de Heladera' };
      const name = gameNames[g.game_slug] || g.game_slug;
      const totalMin = Math.round((g.total_time_seconds || 0) / 60);
      html += `
        <div class="hce-metric-card">
          <div class="hce-metric-title">${name}</div>
          <div class="hce-metric-rows">
            <div class="hce-metric-row"><span>Sesiones</span><strong>${g.total_sessions}</strong></div>
            <div class="hce-metric-row"><span>Puntaje promedio</span><strong>${Math.round(g.avg_score || 0)}</strong></div>
            <div class="hce-metric-row"><span>Mejor puntaje</span><strong>${g.best_score || 0}</strong></div>
            <div class="hce-metric-row"><span>Nivel max</span><strong>${g.max_level || '-'}</strong></div>
            <div class="hce-metric-row"><span>Tiempo total</span><strong>${totalMin} min</strong></div>
            <div class="hce-metric-row"><span>Ultima sesion</span><strong>${g.last_session ? formatDateTime(g.last_session) : '-'}</strong></div>
          </div>
        </div>
      `;
    });
    html += '</div></div>';
  } else {
    html += '<div class="hce-metrics-section"><h4>Juegos Terapeuticos</h4><p style="color:var(--hce-muted);font-size:0.85rem;">Sin sesiones de juego registradas</p></div>';
  }

  // Mood timeline
  if (moodCheckins && moodCheckins.length > 0) {
    html += '<div class="hce-metrics-section"><h4>Estado de Animo (ultimos registros)</h4>';
    html += '<div class="hce-mood-timeline">';
    moodCheckins.slice(0, 20).forEach(m => {
      const moodLabels = { 1: 'Muy mal', 2: 'Mal', 3: 'Regular', 4: 'Bien', 5: 'Muy bien' };
      html += `
        <div class="hce-mood-entry">
          ${m.color_hex ? `<span class="hce-mood-dot" style="background:${m.color_hex}"></span>` : ''}
          <span class="hce-mood-val">${moodLabels[m.mood_value] || m.mood_value || '-'}</span>
          <span class="hce-mood-date">${formatDateTime(m.created_at)}</span>
          ${m.note ? `<span class="hce-mood-note">${m.note}</span>` : ''}
        </div>
      `;
    });
    html += '</div></div>';
  }

  // Color entries
  if (moodEntries && moodEntries.length > 0) {
    html += '<div class="hce-metrics-section"><h4>Selecciones de Color</h4>';
    html += '<div class="hce-color-timeline">';
    moodEntries.slice(0, 30).forEach(e => {
      html += `<span class="hce-color-dot" style="background:${e.color_hex}" title="${e.source_activity || e.context_type} — ${formatDateTime(e.recorded_at)}"></span>`;
    });
    html += '</div></div>';
  }

  if (!html) html = '<div class="hce-empty">Sin metricas disponibles para este paciente</div>';
  contentEl.innerHTML = html;
}

// Insert metrics summary into evolution textarea
function insertMetricsInEvolution() {
  if (!lastMetricsData) return;
  const { gameProgress, moodCheckins } = lastMetricsData;

  let text = '=== METRICAS TERAPEUTICAS ===\n';
  const gameNames = { 'lawn-mower': 'Cortadora de Cesped', 'medication-memory': 'Memoria de Medicacion', 'pill-organizer': 'Pastillero', 'super-market': 'Supermercado', 'daily-routine': 'Rutina Diaria', 'fridge-logic': 'Logica de Heladera' };

  if (gameProgress && gameProgress.length > 0) {
    text += '\nJuegos terapeuticos (90 dias):\n';
    gameProgress.forEach(g => {
      const name = gameNames[g.game_slug] || g.game_slug;
      text += `- ${name}: ${g.total_sessions} sesiones, puntaje prom ${Math.round(g.avg_score || 0)}, mejor ${g.best_score || 0}, nivel max ${g.max_level || '-'}\n`;
    });
  }

  if (moodCheckins && moodCheckins.length > 0) {
    const moodLabels = { 1: 'Muy mal', 2: 'Mal', 3: 'Regular', 4: 'Bien', 5: 'Muy bien' };
    const recent = moodCheckins.slice(0, 5);
    text += '\nEstado de animo reciente:\n';
    recent.forEach(m => {
      text += `- ${formatDateTime(m.created_at)}: ${moodLabels[m.mood_value] || m.mood_value}${m.note ? ' — ' + m.note : ''}\n`;
    });
  }

  text += '=============================\n\n';

  const textarea = document.getElementById('evo-contenido');
  if (textarea) {
    textarea.value = text + textarea.value;
    textarea.focus();
  }
  closeModal('metrics');
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
    // Reload to show updated vitals
    loadPatientHCE();
  } else {
    alert(result.error || 'Error al registrar signos vitales');
  }
}

// ── Render vitals: header summary + sidebar tab ───────────
function renderLastVitals(vitals) {
  const alertsEl = document.getElementById('hce-patient-alerts');
  const svCurrentEl = document.getElementById('hce-sv-current');
  const svHistoryEl = document.getElementById('hce-sv-history');

  if (!vitals || vitals.length === 0) {
    alertsEl.innerHTML = '<span class="hce-sv-alert hce-sv-missing">SV: Sin registro</span>';
    if (svCurrentEl) svCurrentEl.innerHTML = '<div style="color:#9ca3af;font-size:0.82rem;padding:0.5rem 0;">Sin signos vitales registrados</div>';
    if (svHistoryEl) svHistoryEl.innerHTML = '';
    return;
  }

  const last = vitals[0];
  const lastTime = new Date(last.fecha);
  const hoursAgo = Math.floor((Date.now() - lastTime.getTime()) / 3600000);
  const isStale = hoursAgo >= 6;

  // Build values for header
  const parts = [];
  if (last.ta_sistolica && last.ta_diastolica) parts.push(`TA ${last.ta_sistolica}/${last.ta_diastolica}`);
  if (last.fc) parts.push(`FC ${last.fc}`);
  if (last.temperatura) parts.push(`T ${last.temperatura}°`);
  if (last.saturacion) parts.push(`Sat ${last.saturacion}%`);
  if (last.fr) parts.push(`FR ${last.fr}`);
  if (last.glucemia) parts.push(`Glu ${last.glucemia}`);

  const timeLabel = hoursAgo < 1 ? 'hace < 1h' : hoursAgo < 24 ? `hace ${hoursAgo}h` : `hace ${Math.floor(hoursAgo/24)}d`;
  const staleClass = isStale ? 'hce-sv-stale' : 'hce-sv-ok';
  const registradoPor = last.registrado_por ? ` — ${last.registrado_por}` : '';

  // Header badge
  alertsEl.innerHTML = `
    <div class="hce-sv-summary ${staleClass}" title="Registrado: ${formatDateTime(last.fecha)}${registradoPor}">
      <span class="hce-sv-values">${parts.join(' | ') || 'Sin datos'}</span>
      <span class="hce-sv-time">${timeLabel}${isStale ? ' — VENCIDO' : ''}</span>
    </div>
  `;

  // ── Sidebar: ultimo registro destacado ──
  if (svCurrentEl) {
    svCurrentEl.innerHTML = `
      <div class="hce-sv-card ${staleClass}">
        <div class="hce-sv-card-header">
          <strong>Ultimo control</strong>
          <span class="hce-sv-card-time">${formatDateTime(last.fecha)}${isStale ? ' — VENCIDO' : ''}</span>
        </div>
        <div class="hce-sv-card-values">
          ${last.ta_sistolica && last.ta_diastolica ? `<div class="hce-sv-row"><span class="hce-sv-label">TA</span><span class="hce-sv-val">${last.ta_sistolica}/${last.ta_diastolica} mmHg</span></div>` : ''}
          ${last.fc ? `<div class="hce-sv-row"><span class="hce-sv-label">FC</span><span class="hce-sv-val">${last.fc} lpm</span></div>` : ''}
          ${last.fr ? `<div class="hce-sv-row"><span class="hce-sv-label">FR</span><span class="hce-sv-val">${last.fr} rpm</span></div>` : ''}
          ${last.temperatura ? `<div class="hce-sv-row"><span class="hce-sv-label">Temp</span><span class="hce-sv-val">${last.temperatura} °C</span></div>` : ''}
          ${last.saturacion ? `<div class="hce-sv-row"><span class="hce-sv-label">SatO2</span><span class="hce-sv-val">${last.saturacion}%</span></div>` : ''}
          ${last.glucemia ? `<div class="hce-sv-row"><span class="hce-sv-label">Glucemia</span><span class="hce-sv-val">${last.glucemia} mg/dL</span></div>` : ''}
          ${last.peso_kg ? `<div class="hce-sv-row"><span class="hce-sv-label">Peso</span><span class="hce-sv-val">${last.peso_kg} kg</span></div>` : ''}
          ${last.talla_cm ? `<div class="hce-sv-row"><span class="hce-sv-label">Talla</span><span class="hce-sv-val">${last.talla_cm} cm</span></div>` : ''}
        </div>
        ${last.registrado_por ? `<div class="hce-sv-card-footer">${last.registrado_por}</div>` : ''}
      </div>
    `;
  }

  // ── Sidebar: historial (registros anteriores) ──
  if (svHistoryEl && vitals.length > 1) {
    const historyHtml = vitals.slice(1).map(v => {
      const vParts = [];
      if (v.ta_sistolica && v.ta_diastolica) vParts.push(`TA ${v.ta_sistolica}/${v.ta_diastolica}`);
      if (v.fc) vParts.push(`FC ${v.fc}`);
      if (v.temperatura) vParts.push(`T ${v.temperatura}°`);
      if (v.saturacion) vParts.push(`Sat ${v.saturacion}%`);
      return `
        <div class="hce-sv-hist-row">
          <span class="hce-sv-hist-date">${formatDateTime(v.fecha)}</span>
          <span class="hce-sv-hist-vals">${vParts.join(' | ')}</span>
          ${v.registrado_por ? `<span class="hce-sv-hist-by">${v.registrado_por}</span>` : ''}
        </div>
      `;
    }).join('');
    svHistoryEl.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:var(--hce-muted,#6b7280);margin-bottom:0.3rem;">Historial</div>
      ${historyHtml}
    `;
  } else if (svHistoryEl) {
    svHistoryEl.innerHTML = '';
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
  // Go back to referrer or default
  if (document.referrer && document.referrer.includes('/hce')) {
    window.location.href = '/hce';
  } else if (document.referrer && document.referrer.includes('/hdd/admin')) {
    window.history.back();
  } else if (window.location.pathname.startsWith('/hce')) {
    window.location.href = '/hce';
  } else {
    window.location.href = '/hdd/admin';
  }
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
