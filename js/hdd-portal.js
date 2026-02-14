// State
let currentUser = null;
let sessionToken = null;
let uploadedImageUrl = null;
let selectedMood = null;
let selectedColor = null;
let selectedColorIntensity = 'vivid';
const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === 'true';

// API helpers
const API_BASE = '/api/hdd';

async function api(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}

// ==================== COLOR PALETTE ====================

const COLOR_PALETTES = {
  vivid: [
    '#FF0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFF00', '#ADFF2F', '#00FF00', '#00CED1',
    '#0000FF', '#4B0082', '#8B00FF', '#FF00FF', '#FF1493', '#DC143C', '#8B0000', '#FF6347',
    '#00BFFF', '#1E90FF', '#228B22', '#32CD32', '#FF69B4', '#BA55D3', '#00FA9A', '#FFE4B5'
  ],
  soft: [
    '#F08080', '#FFA07A', '#FFDAB9', '#FFE4B5', '#FFFACD', '#D2E4A0', '#98FB98', '#AFEEEE',
    '#87CEEB', '#B0C4DE', '#DDA0DD', '#D8BFD8', '#FFB6C1', '#FFC0CB', '#E6E6FA', '#F0E68C',
    '#ADD8E6', '#90EE90', '#FAFAD2', '#E0BBE4', '#F5CBA7', '#AED6F1', '#A9DFBF', '#F9E79F'
  ],
  pastel: [
    '#FFD1DC', '#FFDAC1', '#FFE5B4', '#FFFDD0', '#FDFD96', '#D4F0C0', '#C1E1C1', '#C1F0F0',
    '#C1D4E0', '#C1C1E0', '#D4C1E0', '#E0C1D4', '#F0C1C1', '#F5DEB3', '#E8DAEF', '#D5F5E3',
    '#FCF3CF', '#FADBD8', '#D6EAF8', '#D1F2EB', '#F2D7D5', '#D7BDE2', '#A9CCE3', '#A3E4D7'
  ],
  dark: [
    '#8B0000', '#800000', '#4B0082', '#191970', '#006400', '#2F4F4F', '#36454F', '#483C32',
    '#301934', '#1B1B1B', '#3C1414', '#1C2833', '#0B3D0B', '#3B0A45', '#2C1608', '#0A2E36',
    '#4A235A', '#1A5276', '#145A32', '#7B241C', '#4A4A4A', '#6C3483', '#1B4F72', '#196F3D'
  ],
  muted: [
    '#BC8F8F', '#C0A080', '#BDB76B', '#8FBC8F', '#708090', '#778899', '#9D8F8F', '#A0809F',
    '#809FA0', '#808F9F', '#9F808F', '#8F9D80', '#A09080', '#8F8F9D', '#9D808A', '#80A09D',
    '#A0909F', '#8FA09D', '#9D8FA0', '#908F8F', '#8D9F80', '#80889F', '#9F8080', '#808F80'
  ]
};

function setColorIntensity(intensity) {
  selectedColorIntensity = intensity;
  selectedColor = null;
  const preview = document.getElementById('selected-color-preview');
  if (preview) preview.style.display = 'none';

  document.querySelectorAll('.intensity-btn').forEach(btn => {
    if (btn.dataset.intensity === intensity) {
      btn.style.borderColor = 'var(--primary)';
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
      btn.classList.add('active');
    } else {
      btn.style.borderColor = 'var(--border)';
      btn.style.background = 'var(--surface)';
      btn.style.color = 'var(--text)';
      btn.classList.remove('active');
    }
  });

  renderColorPalette(intensity);
}

function renderColorPalette(intensity) {
  const grid = document.getElementById('color-palette-grid');
  if (!grid) return;
  const colors = COLOR_PALETTES[intensity] || COLOR_PALETTES.vivid;

  grid.innerHTML = colors.map(color => `
    <div class="color-swatch" onclick="selectColor('${color}')"
         style="width: 100%; aspect-ratio: 1; background: ${color}; border-radius: 6px; cursor: pointer; border: 3px solid transparent; transition: transform 0.15s, border-color 0.15s;"
         data-color="${color}"
         onmouseenter="this.style.transform='scale(1.15)'"
         onmouseleave="this.style.transform='scale(1)'">
    </div>
  `).join('');
}

function selectColor(color) {
  selectedColor = color;

  document.querySelectorAll('.color-swatch').forEach(s => {
    s.style.borderColor = s.dataset.color === color ? '#1e293b' : 'transparent';
    s.style.boxShadow = s.dataset.color === color ? '0 0 0 2px #fff, 0 0 0 4px #1e293b' : 'none';
  });

  const preview = document.getElementById('selected-color-preview');
  preview.style.display = 'block';
  preview.style.background = color;
  // Determine text color for contrast
  const r = parseInt(color.slice(1,3), 16);
  const g = parseInt(color.slice(3,5), 16);
  const b = parseInt(color.slice(5,7), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  preview.style.color = luma > 160 ? '#1e293b' : '#ffffff';
  preview.textContent = 'Color seleccionado';
}

// Selección de color sin requerir mood (modo neutral)
function selectColorOnly(color) {
  selectedColor = color;
  selectedMood = null; // No hay mood asociado

  document.querySelectorAll('.color-swatch').forEach(s => {
    const isSelected = s.dataset.color === color;
    s.style.borderColor = isSelected ? '#fff' : 'transparent';
    s.style.boxShadow = isSelected ? '0 0 0 3px #fff, 0 0 0 5px ' + color : 'none';
    s.style.transform = isSelected ? 'scale(1.1)' : 'scale(1)';
  });

  const preview = document.getElementById('selected-color-preview');
  if (preview) {
    preview.style.display = 'block';
    preview.style.background = color;
    const r = parseInt(color.slice(1,3), 16);
    const g = parseInt(color.slice(3,5), 16);
    const b = parseInt(color.slice(5,7), 16);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    preview.style.color = luma > 160 ? '#1e293b' : '#ffffff';
    preview.textContent = 'Color seleccionado';
  }

  // Habilitar botón de guardar
  const submitBtn = document.getElementById('submit-mood-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
  }
}

// ==================== MOOD CHECK-IN ====================

function selectMood(value) {
  selectedMood = value;
  document.querySelectorAll('.mood-option').forEach(opt => {
    opt.classList.remove('selected');
    if (parseInt(opt.dataset.value) === value) {
      opt.classList.add('selected');
    }
  });
  document.getElementById('submit-mood-btn').disabled = false;
}

function shouldShowMoodCheckin() {
  // Check if already checked in today
  const today = new Date().toISOString().split('T')[0];
  const lastCheckin = localStorage.getItem('hdd_mood_checkin_date');
  return lastCheckin !== today;
}

function toggleWellnessReference() {
  const ref = document.getElementById('wellness-reference');
  if (!ref) return;
  if (ref.style.display === 'none') {
    ref.style.display = '';
  } else {
    ref.style.display = 'none';
  }
}

function showMoodCheckinModal() {
  if (!shouldShowMoodCheckin()) return;

  selectedMood = null;
  selectedColor = null;
  selectedColorIntensity = 'vivid';

  const modal = document.getElementById('mood-checkin-modal');
  if (!modal) return;

  document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));

  const noteEl = document.getElementById('mood-note');
  if (noteEl) noteEl.value = '';

  const submitBtn = document.getElementById('submit-mood-btn');
  if (submitBtn) submitBtn.disabled = true;

  const preview = document.getElementById('selected-color-preview');
  if (preview) preview.style.display = 'none';

  // Show the wellness reference by default
  const wellnessRef = document.getElementById('wellness-reference');
  if (wellnessRef) wellnessRef.style.display = '';

  modal.classList.remove('hidden');

  // Render initial color palette with small delay to ensure DOM is ready
  setTimeout(() => {
    renderColorPalette('vivid');
    // Reset intensity buttons
    document.querySelectorAll('.intensity-btn').forEach(btn => {
      if (btn.dataset.intensity === 'vivid') {
        btn.style.borderColor = 'var(--primary)';
        btn.classList.add('active');
      } else {
        btn.style.borderColor = 'var(--border)';
        btn.classList.remove('active');
      }
    });
  }, 50);
}

function hideMoodCheckinModal() {
  document.getElementById('mood-checkin-modal').classList.add('hidden');
}

async function submitMoodCheckin() {
  if (!selectedMood) return;

  const note = document.getElementById('mood-note').value.trim();

  // Save to backend
  try {
    await api('/games', {
      method: 'POST',
      body: JSON.stringify({
        action: 'mood_checkin',
        sessionToken: sessionToken,
        mood: selectedMood,
        note: note || null,
        colorHex: selectedColor || null,
        colorIntensity: selectedColorIntensity || null,
        context: 'daily_checkin'
      })
    });
  } catch (e) {
    console.error('Error saving mood checkin:', e);
  }

  // Mark as checked in today
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem('hdd_mood_checkin_date', today);
  localStorage.setItem('hdd_last_mood', selectedMood.toString());
  if (selectedColor) {
    localStorage.setItem('hdd_last_color', selectedColor);
  }

  hideMoodCheckinModal();
}

function skipMoodCheckin() {
  // Mark as skipped for today
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem('hdd_mood_checkin_date', today);
  hideMoodCheckinModal();
}

// Auth
async function login(dni, password) {
  const result = await api('/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', dni, password })
  });

  if (result.success) {
    sessionToken = result.sessionToken;
    currentUser = result.patient;
    localStorage.setItem('hdd_session', sessionToken);
    localStorage.setItem('hdd_user', JSON.stringify(currentUser));
    showApp();
    loadFeed();
  }

  return result;
}

async function logout() {
  if (sessionToken) {
    await api('/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout', sessionToken })
    });
  }

  sessionToken = null;
  currentUser = null;
  localStorage.removeItem('hdd_session');
  localStorage.removeItem('hdd_user');
  showLoginForm();
}

async function verifySession() {
  const stored = localStorage.getItem('hdd_session');
  const storedUser = localStorage.getItem('hdd_user');

  if (stored && storedUser) {
    const result = await api(`/auth?action=verify&sessionToken=${stored}`);

    if (result.valid) {
      sessionToken = stored;
      currentUser = result.patient;
      return true;
    }
  }

  localStorage.removeItem('hdd_session');
  localStorage.removeItem('hdd_user');
  return false;
}

// UI Navigation
function showLoginForm() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('register-view').classList.add('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showRegisterForm() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('register-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('register-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser.fullName;

  // Show daily mood check-in after a brief delay (not in preview mode)
  if (!isPreviewMode) {
    setTimeout(() => {
      showMoodCheckinModal();
    }, 800);
  }
}

// Registration - simplified (no code verification)
async function register(dni, fullName, email, password) {
  const result = await api('/auth', {
    method: 'POST',
    body: JSON.stringify({
      action: 'register',
      dni,
      fullName,
      email,
      password
    })
  });

  if (result.success) {
    sessionToken = result.sessionToken;
    currentUser = result.patient;
    localStorage.setItem('hdd_session', sessionToken);
    localStorage.setItem('hdd_user', JSON.stringify(currentUser));
    showApp();
    loadFeed();
  }

  return result;
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  document.querySelectorAll('.feed-container').forEach(c => c.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  if (tabId === 'my-posts') {
    loadMyPosts();
  }
  if (tabId === 'games') {
    loadGames();
  }
  if (tabId === 'activities') {
    loadPortalActivities();
    loadPortalResources();
  }
}

// ==================== ACTIVITIES & RESOURCES (DB-backed) ====================

async function loadPortalActivities() {
  const container = document.getElementById('activities-list');
  if (!container) return;

  try {
    const response = await fetch('/api/hdd/admin?action=public_activities');
    const data = await response.json();

    if (data.activities && data.activities.length > 0) {
      container.innerHTML = data.activities.map(a => `
        <div class="activity-card">
          <div class="activity-icon">${a.icon || '📋'}</div>
          <div class="activity-info">
            <div class="activity-name">${escapeHtml(a.name)}</div>
            <div class="activity-schedule">${a.dayName} ${a.startTime} - ${a.endTime}</div>
            ${a.professional ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">Prof. ${escapeHtml(a.professional)}</div>` : ''}
            ${a.location ? `<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(a.location)}</div>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="color:var(--text-muted);">No hay actividades programadas actualmente.</p>';
    }
  } catch (e) {
    // Fallback to default activities
    container.innerHTML = `
      <div class="activity-card"><div class="activity-icon">🎵</div><div class="activity-info"><div class="activity-name">Musica</div><div class="activity-schedule">Lunes 10:00 - 11:30</div></div></div>
      <div class="activity-card"><div class="activity-icon">🌱</div><div class="activity-info"><div class="activity-name">Huerta</div><div class="activity-schedule">Martes 10:00 - 12:00</div></div></div>
      <div class="activity-card"><div class="activity-icon">🪵</div><div class="activity-info"><div class="activity-name">Carpinteria</div><div class="activity-schedule">Miercoles 10:00 - 12:00</div></div></div>
      <div class="activity-card"><div class="activity-icon">🍳</div><div class="activity-info"><div class="activity-name">Cocina</div><div class="activity-schedule">Jueves 10:00 - 12:00</div></div></div>
      <div class="activity-card"><div class="activity-icon">💃</div><div class="activity-info"><div class="activity-name">Expresion Corporal</div><div class="activity-schedule">Viernes 10:00 - 11:30</div></div></div>
    `;
  }
}

async function loadPortalResources() {
  const container = document.getElementById('portal-resources-list');
  if (!container) return;

  try {
    const response = await fetch('/api/hdd/admin?action=public_resources');
    const data = await response.json();

    if (data.resources && data.resources.length > 0) {
      const icons = { video: '🎥', document: '📄', course: '🎓', link: '🔗' };
      container.innerHTML = data.resources.map(r => `
        <div class="activity-card" style="cursor:pointer;" onclick="window.open('${escapeHtml(r.url)}', '_blank')">
          <div class="activity-icon" style="font-size:1.5rem;">${r.icon || icons[r.resourceType] || '📎'}</div>
          <div class="activity-info">
            <div class="activity-name">${escapeHtml(r.title)}</div>
            <div class="activity-schedule">${escapeHtml(r.description || '')}</div>
            ${r.duration ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">${escapeHtml(r.resourceType)} - ${escapeHtml(r.duration)}</div>` : ''}
          </div>
          <span style="color: var(--primary);">Ver →</span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="color:var(--text-muted);">No hay recursos disponibles actualmente.</p>';
    }
  } catch (e) {
    container.innerHTML = '<p style="color:var(--text-muted);">No se pudieron cargar los recursos.</p>';
  }
}

// Feed
async function loadFeed() {
  const container = document.getElementById('feed-posts');
  container.innerHTML = '<div class="loading">Cargando publicaciones...</div>';

  // In preview mode, show a message instead of loading actual feed
  if (isPreviewMode) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👀</div>
        <p>Vista previa del portal de pacientes</p>
        <p style="font-size:0.9rem;color:var(--text-muted);margin-top:0.5rem;">Las publicaciones de pacientes son privadas. Esta es una vista de prueba para profesionales.</p>
      </div>
    `;
    return;
  }

  const result = await api(`/community?action=feed&sessionToken=${sessionToken}`);

  if (result.posts && result.posts.length > 0) {
    container.innerHTML = result.posts.map(renderPost).join('');
  } else {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <p>No hay publicaciones todavía. ¡Sé el primero en compartir!</p>
      </div>
    `;
  }
}

async function loadMyPosts() {
  const container = document.getElementById('my-posts-list');
  container.innerHTML = '<div class="loading">Cargando...</div>';

  const result = await api(`/community?action=my_posts&sessionToken=${sessionToken}`);

  if (result.posts && result.posts.length > 0) {
    container.innerHTML = result.posts.map(renderPost).join('');
  } else {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <p>No tienes publicaciones todavía.</p>
      </div>
    `;
  }
}

function renderPost(post) {
  const initials = post.authorName ? post.authorName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
  const date = new Date(post.createdAt).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-avatar">${initials}</div>
        <div>
          <div class="post-author">${post.authorName || 'Anónimo'}</div>
          <div class="post-date">${date}</div>
        </div>
        ${post.isOwnPost ? `
          <button class="btn btn-secondary" style="margin-left: auto; padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                  onclick="deletePost(${post.id})">Eliminar</button>
        ` : ''}
      </div>
      <div class="post-content">${escapeHtml(post.content)}</div>
      ${post.imageUrl ? `<img src="${post.imageUrl}" class="post-image" alt="Imagen">` : ''}
      <div class="post-actions">
        <button class="post-action ${post.userLiked ? 'liked' : ''}" onclick="toggleLike(${post.id}, this)">
          ${post.userLiked ? '❤️' : '🤍'} ${post.likesCount}
        </button>
        <button class="post-action" onclick="showComments(${post.id})">
          💬 ${post.commentsCount}
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Actions
async function createPost() {
  const content = document.getElementById('new-post-content').value.trim();

  if (!content) {
    alert('Escribe algo para publicar');
    return;
  }

  // Upload image if present
  let imageUrl = null;
  if (pendingImageFile) {
    imageUrl = await uploadImage();
  }

  const result = await api('/community', {
    method: 'POST',
    body: JSON.stringify({
      action: 'create_post',
      sessionToken,
      content,
      postType: imageUrl ? 'photo' : 'text',
      imageUrl: imageUrl
    })
  });

  if (result.success) {
    document.getElementById('new-post-content').value = '';
    clearImagePreview();
    loadFeed();
  } else {
    alert(result.error || 'Error al publicar');
  }
}

async function deletePost(postId) {
  if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;

  const result = await api('/community', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete_post', sessionToken, postId })
  });

  if (result.success) {
    loadFeed();
    loadMyPosts();
  } else {
    alert(result.error || 'Error al eliminar');
  }
}

async function toggleLike(postId, button) {
  const result = await api('/community', {
    method: 'POST',
    body: JSON.stringify({ action: 'toggle_like', sessionToken, postId })
  });

  if (result.success) {
    const card = button.closest('.post-card');
    const countMatch = button.textContent.match(/\d+/);
    const currentCount = countMatch ? parseInt(countMatch[0]) : 0;

    if (result.liked) {
      button.classList.add('liked');
      button.innerHTML = `❤️ ${currentCount + 1}`;
    } else {
      button.classList.remove('liked');
      button.innerHTML = `🤍 ${Math.max(0, currentCount - 1)}`;
    }
  }
}

async function showComments(postId) {
  const modal = document.getElementById('comments-modal');
  const content = document.getElementById('comments-modal-content');
  modal.classList.remove('hidden');
  content.innerHTML = '<div class="loading">Cargando comentarios...</div>';

  const result = await api(`/community?action=post&postId=${postId}&sessionToken=${sessionToken}`);

  if (result.post) {
    let html = `
      <div class="post-content" style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
        ${escapeHtml(result.post.content)}
      </div>
    `;

    if (result.comments && result.comments.length > 0) {
      html += result.comments.map(c => {
        const initials = c.authorName ? c.authorName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
        const date = new Date(c.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
        return `
          <div class="comment">
            <div class="comment-avatar">${initials}</div>
            <div class="comment-content">
              <div class="comment-author">${c.authorName}</div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
              <div class="comment-date">${date}</div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      html += '<p class="text-muted">No hay comentarios todavía.</p>';
    }

    html += `
      <div class="add-comment">
        <input type="text" id="comment-input-${postId}" placeholder="Escribe un comentario...">
        <button class="btn btn-primary" onclick="addComment(${postId})">Enviar</button>
      </div>
    `;

    content.innerHTML = html;
  }
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();

  if (!content) return;

  const result = await api('/community', {
    method: 'POST',
    body: JSON.stringify({ action: 'add_comment', sessionToken, postId, content })
  });

  if (result.success) {
    showComments(postId);
    loadFeed();
  } else {
    alert(result.error || 'Error al comentar');
  }
}

function hideCommentsModal() {
  document.getElementById('comments-modal').classList.add('hidden');
}

// Image handling - upload to server
let pendingImageFile = null;

function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('La imagen es muy grande (máximo 5MB)');
    return;
  }

  // Store file for upload and show preview
  pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('image-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

async function uploadImage() {
  if (!pendingImageFile) return null;

  // Read as base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: e.target.result,
            folder: 'hdd/community'
          })
        });
        const result = await response.json();
        if (result.success) {
          resolve(result.url);
        } else {
          alert(result.error || 'Error al subir la imagen');
          resolve(null);
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('Error al subir la imagen');
        resolve(null);
      }
    };
    reader.readAsDataURL(pendingImageFile);
  });
}

function clearImagePreview() {
  uploadedImageUrl = null;
  pendingImageFile = null;
  document.getElementById('image-preview').classList.add('hidden');
  document.getElementById('image-upload').value = '';
}

// Profile
function showProfileModal() {
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('profile-dni').value = currentUser.dni;
  document.getElementById('profile-email').value = currentUser.email || '';
  document.getElementById('profile-phone').value = currentUser.phone || '';
}

function hideProfileModal() {
  document.getElementById('profile-modal').classList.add('hidden');
  document.getElementById('profile-message').classList.add('hidden');
}

async function saveProfile() {
  const email = document.getElementById('profile-email').value;
  const phone = document.getElementById('profile-phone').value;

  const result = await api('/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_profile', sessionToken, email, phone })
  });

  const msg = document.getElementById('profile-message');
  if (result.success) {
    currentUser.email = result.patient.email;
    currentUser.phone = result.patient.phone;
    localStorage.setItem('hdd_user', JSON.stringify(currentUser));
    msg.className = 'alert alert-success';
    msg.textContent = 'Perfil actualizado';
    msg.classList.remove('hidden');
  } else {
    msg.className = 'alert alert-error';
    msg.textContent = result.error || 'Error al guardar';
    msg.classList.remove('hidden');
  }
}

// Modal close helper
function closeModal(event, modalId) {
  if (event.target.classList.contains('modal-overlay')) {
    document.getElementById(modalId).classList.add('hidden');
  }
}

// Password form
document.getElementById('password-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;

  if (!currentPassword || !newPassword) {
    alert('Complete ambos campos');
    return;
  }

  const result = await api('/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'change_password', sessionToken, currentPassword, newPassword })
  });

  const msg = document.getElementById('profile-message');
  if (result.success) {
    msg.className = 'alert alert-success';
    msg.textContent = 'Contraseña actualizada';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
  } else {
    msg.className = 'alert alert-error';
    msg.textContent = result.error || 'Error al cambiar contraseña';
  }
  msg.classList.remove('hidden');
});

// Login form
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const dni = document.getElementById('dni').value;
  const password = document.getElementById('password').value;

  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  const result = await login(dni, password);

  if (!result.success) {
    errorEl.textContent = result.error || 'Error al iniciar sesión';
    errorEl.classList.remove('hidden');
  } else if (result.firstLogin) {
    alert('¡Bienvenido/a! Su contraseña ha sido configurada exitosamente.');
  }
});

// Register form - simplified (no code verification)
document.getElementById('register-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const dni = document.getElementById('reg-dni').value;
  const fullName = document.getElementById('reg-fullname').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  const errorEl = document.getElementById('register-error');
  errorEl.classList.add('hidden');

  if (password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    errorEl.classList.remove('hidden');
    return;
  }

  const result = await register(dni, fullName, email, password);

  if (!result.success) {
    errorEl.textContent = result.details ? `${result.error}: ${result.details}` : (result.error || 'Error al registrarse');
    errorEl.classList.remove('hidden');
  }
});

// =============================================
// THERAPEUTIC GAMES
// =============================================

let currentGame = null;
let gameState = {};

function openGame(gameId) {
  document.getElementById('game-container').classList.remove('hidden');
  currentGame = gameId;

  if (gameId === 'lawn-mower') {
    document.getElementById('game-title').textContent = 'Cortadora de Cesped';
    initLawnMowerGame();
  } else if (gameId === 'memory-meds') {
    document.getElementById('game-title').textContent = 'Memoria de Medicamentos';
    initMemoryMedsGame();
  }

  // Track activity
  trackGameActivity(gameId, 'start');
}

function closeGame() {
  document.getElementById('game-container').classList.add('hidden');
  document.getElementById('game-area').innerHTML = '';
  if (currentGame) {
    trackGameActivity(currentGame, 'close');
  }
  currentGame = null;
  gameState = {};
}

function trackGameActivity(gameId, action) {
  if (sessionToken) {
    api('/auth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'track_activity',
        sessionToken,
        activityType: `game_${gameId}`,
        activityData: { action, timestamp: Date.now() }
      })
    }).catch(e => console.log('Activity tracking failed:', e));
  }
}

// =============================================
// GAME 1: LAWN MOWER
// Motricidad fina, planificacion, atencion
// =============================================

function initLawnMowerGame() {
  const area = document.getElementById('game-area');
  gameState = {
    level: 1,
    score: 0,
    mowed: 0,
    totalGrass: 0,
    gameOver: false
  };

  area.innerHTML = `
    <div class="game-info">
      <div>
        <span class="game-score">Puntos: <span id="lawn-score">0</span></span>
      </div>
      <div class="game-level">Nivel <span id="lawn-level">1</span></div>
    </div>
    <div class="game-instructions">
      Arrastra la cortadora sobre el cesped verde para cortarlo.
      Evita las flores y la pileta. Corta todo el cesped para avanzar de nivel.
    </div>
    <canvas id="lawn-canvas" class="game-canvas" width="400" height="400"></canvas>
    <div style="text-align: center; padding: 1rem;">
      <button class="btn btn-primary" onclick="startLawnLevel()">Comenzar</button>
    </div>
  `;
}

function startLawnLevel() {
  const canvas = document.getElementById('lawn-canvas');
  const ctx = canvas.getContext('2d');
  const level = gameState.level;

  // Grid setup
  const gridSize = 20;
  const cols = canvas.width / gridSize;
  const rows = canvas.height / gridSize;

  // Create grid: 0=empty, 1=grass, 2=flower, 3=pool, 4=mowed
  const grid = [];
  let totalGrass = 0;

  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      // Border is empty
      if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
        grid[y][x] = 0;
      } else {
        // 70% grass
        if (Math.random() < 0.7) {
          grid[y][x] = 1;
          totalGrass++;
        } else {
          grid[y][x] = 0;
        }
      }
    }
  }

  // Add obstacles based on level
  const numFlowers = 3 + level * 2;
  const poolSize = Math.min(3 + level, 6);

  // Add flowers
  for (let i = 0; i < numFlowers; i++) {
    const x = Math.floor(Math.random() * (cols - 4)) + 2;
    const y = Math.floor(Math.random() * (rows - 4)) + 2;
    grid[y][x] = 2;
    if (grid[y][x] === 1) totalGrass--;
  }

  // Add pool (rectangle)
  const poolX = Math.floor(Math.random() * (cols - poolSize - 4)) + 2;
  const poolY = Math.floor(Math.random() * (rows - poolSize - 4)) + 2;
  for (let py = poolY; py < poolY + poolSize; py++) {
    for (let px = poolX; px < poolX + poolSize; px++) {
      if (grid[py] && grid[py][px] === 1) totalGrass--;
      if (grid[py]) grid[py][px] = 3;
    }
  }

  gameState.grid = grid;
  gameState.totalGrass = totalGrass;
  gameState.mowed = 0;
  gameState.gameOver = false;
  gameState.mowerX = 1;
  gameState.mowerY = 1;

  // Draw initial state
  drawLawnGame(ctx, grid, gridSize, gameState.mowerX, gameState.mowerY);

  // Setup touch/mouse controls
  let isDragging = false;

  const handleMove = (clientX, clientY) => {
    if (!isDragging || gameState.gameOver) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / gridSize);
    const y = Math.floor((clientY - rect.top) / gridSize);

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      const cell = grid[y][x];

      if (cell === 2) {
        // Hit flower - game over
        gameState.gameOver = true;
        showLawnResult(false, 'Chocaste con una flor!');
        return;
      }

      if (cell === 3) {
        // Hit pool - game over
        gameState.gameOver = true;
        showLawnResult(false, 'Caiste en la pileta!');
        return;
      }

      if (cell === 1) {
        // Mow grass
        grid[y][x] = 4;
        gameState.mowed++;
        gameState.score += 10;
        document.getElementById('lawn-score').textContent = gameState.score;

        // Check if level complete
        if (gameState.mowed >= gameState.totalGrass) {
          gameState.gameOver = true;
          showLawnResult(true, 'Nivel completado!');
          return;
        }
      }

      gameState.mowerX = x;
      gameState.mowerY = y;
      drawLawnGame(ctx, grid, gridSize, x, y);
    }
  };

  canvas.onmousedown = () => { isDragging = true; };
  canvas.onmouseup = () => { isDragging = false; };
  canvas.onmouseleave = () => { isDragging = false; };
  canvas.onmousemove = (e) => handleMove(e.clientX, e.clientY);

  canvas.ontouchstart = (e) => { isDragging = true; e.preventDefault(); };
  canvas.ontouchend = () => { isDragging = false; };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };
}

function drawLawnGame(ctx, grid, size, mowerX, mowerY) {
  const colors = {
    0: '#f5f5dc', // empty - beige
    1: '#22c55e', // grass - green
    2: '#ec4899', // flower - pink
    3: '#3b82f6', // pool - blue
    4: '#a3e635'  // mowed - light green
  };

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      ctx.fillStyle = colors[grid[y][x]];
      ctx.fillRect(x * size, y * size, size - 1, size - 1);

      // Draw flower icon
      if (grid[y][x] === 2) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(x * size + size/2, y * size + size/2, size/4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw mower
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(mowerX * size + 2, mowerY * size + 2, size - 4, size - 4);
}

function showLawnResult(success, message) {
  const area = document.getElementById('game-area');
  const bonus = success ? gameState.level * 50 : 0;
  gameState.score += bonus;

  if (success) {
    trackGameActivity('lawn-mower', `level_${gameState.level}_complete`);
  } else {
    trackGameActivity('lawn-mower', `level_${gameState.level}_fail`);
  }

  area.innerHTML = `
    <div class="game-over">
      <h3>${success ? 'Excelente!' : 'Ups!'}</h3>
      <p>${message}</p>
      <p><strong>Puntuacion total: ${gameState.score}</strong></p>
      ${success ? `<p>Bonus de nivel: +${bonus} puntos</p>` : ''}
      <button class="btn btn-primary" onclick="${success ? 'nextLawnLevel()' : 'startLawnLevel()'}">
        ${success ? 'Siguiente nivel' : 'Reintentar'}
      </button>
    </div>
  `;
}

function nextLawnLevel() {
  gameState.level++;
  document.getElementById('lawn-level').textContent = gameState.level;
  startLawnLevel();
}

// =============================================
// GAME 2: MEMORY MEDICATIONS
// Memoria, atencion, seguimiento de instrucciones
// =============================================

const MEDICATIONS = [
  { name: 'Risperidona', doses: ['0.5mg', '1mg', '2mg', '3mg'] },
  { name: 'Quetiapina', doses: ['25mg', '50mg', '100mg', '200mg'] },
  { name: 'Clonazepam', doses: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  { name: 'Sertralina', doses: ['25mg', '50mg', '100mg'] },
  { name: 'Fluoxetina', doses: ['10mg', '20mg', '40mg'] },
  { name: 'Levomepromazina', doses: ['2mg', '5mg', '25mg'] },
  { name: 'Lorazepam', doses: ['0.5mg', '1mg', '2.5mg'] },
  { name: 'Carbamazepina', doses: ['200mg', '400mg'] }
];

const SCHEDULES = ['Manana', 'Tarde', 'Noche'];

function initMemoryMedsGame() {
  const area = document.getElementById('game-area');
  gameState = {
    level: 1,
    score: 0,
    round: 1,
    prescription: null,
    selectedMed: null,
    selectedDose: null,
    selectedSchedule: [],
    showTime: 5000 // 5 seconds to memorize
  };

  area.innerHTML = `
    <div class="game-info">
      <div>
        <span class="game-score">Puntos: <span id="med-score">0</span></span>
      </div>
      <div class="game-level">Nivel <span id="med-level">1</span></div>
    </div>
    <div class="game-instructions">
      Memorizaras una prescripcion medica y luego debes seleccionar el medicamento correcto,
      la dosis y los horarios de toma.
    </div>
    <div id="med-game-area" style="padding: 1rem;"></div>
    <div style="text-align: center; padding: 1rem;">
      <button class="btn btn-primary" onclick="startMedRound()">Comenzar</button>
    </div>
  `;
}

function startMedRound() {
  const gameArea = document.getElementById('med-game-area');
  const level = gameState.level;

  // Generate random prescription
  const med = MEDICATIONS[Math.floor(Math.random() * MEDICATIONS.length)];
  const dose = med.doses[Math.floor(Math.random() * med.doses.length)];

  // Generate schedule (1-3 times based on level)
  const numTimes = Math.min(level, 3);
  const schedule = [];
  const availableSchedules = [...SCHEDULES];
  for (let i = 0; i < numTimes; i++) {
    const idx = Math.floor(Math.random() * availableSchedules.length);
    schedule.push(availableSchedules.splice(idx, 1)[0]);
  }

  gameState.prescription = { med: med.name, dose, schedule };
  gameState.selectedMed = null;
  gameState.selectedDose = null;
  gameState.selectedSchedule = [];

  // Show prescription
  gameArea.innerHTML = `
    <div class="med-prescription" style="animation: pulse 1s infinite;">
      <p style="margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Prescripcion:</p>
      <p style="font-size: 1.3rem; font-weight: 600; margin-bottom: 0.5rem;">${med.name} ${dose}</p>
      <p style="font-size: 1rem;">${schedule.join(' - ')}</p>
    </div>
    <p style="text-align: center; color: var(--text-muted);">Memoriza esta prescripcion...</p>
    <p style="text-align: center; font-size: 2rem;" id="med-countdown">${gameState.showTime / 1000}</p>
  `;

  // Countdown
  let countdown = gameState.showTime / 1000;
  const timer = setInterval(() => {
    countdown--;
    const el = document.getElementById('med-countdown');
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(timer);
      showMedSelection();
    }
  }, 1000);
}

function showMedSelection() {
  const gameArea = document.getElementById('med-game-area');
  const level = gameState.level;

  // Generate distractors (more with higher levels)
  const numOptions = Math.min(4 + level, MEDICATIONS.length);
  const options = [MEDICATIONS.find(m => m.name === gameState.prescription.med)];

  while (options.length < numOptions) {
    const med = MEDICATIONS[Math.floor(Math.random() * MEDICATIONS.length)];
    if (!options.find(o => o.name === med.name)) {
      options.push(med);
    }
  }

  // Shuffle options
  options.sort(() => Math.random() - 0.5);

  gameArea.innerHTML = `
    <p style="text-align: center; font-weight: 600; margin-bottom: 1rem;">Selecciona el medicamento correcto:</p>
    <div class="med-cabinet">
      ${options.map(med => `
        <div class="med-item" onclick="selectMed('${med.name}')" id="med-${med.name.replace(/\s/g, '')}">
          <div class="med-name">${med.name}</div>
        </div>
      `).join('')}
    </div>
    <div id="dose-section" class="hidden">
      <p style="text-align: center; font-weight: 600; margin: 1rem 0;">Selecciona la dosis:</p>
      <div class="dose-selector" id="dose-buttons"></div>
    </div>
    <div id="schedule-section" class="hidden">
      <p style="text-align: center; font-weight: 600; margin: 1rem 0;">Selecciona los horarios de toma:</p>
      <div class="dose-selector" id="schedule-buttons">
        ${SCHEDULES.map(s => `
          <button class="dose-btn" onclick="toggleSchedule('${s}')" id="sched-${s}">${s}</button>
        `).join('')}
      </div>
    </div>
    <div style="text-align: center; padding: 1rem;">
      <button class="btn btn-success hidden" id="med-submit" onclick="checkMedAnswer()">Confirmar</button>
    </div>
  `;
}

function selectMed(medName) {
  // Clear previous selection
  document.querySelectorAll('.med-item').forEach(el => el.classList.remove('selected'));

  // Select new
  const el = document.getElementById('med-' + medName.replace(/\s/g, ''));
  el.classList.add('selected');
  gameState.selectedMed = medName;

  // Show dose selection
  const med = MEDICATIONS.find(m => m.name === medName);
  const doseSection = document.getElementById('dose-section');
  const doseButtons = document.getElementById('dose-buttons');

  doseButtons.innerHTML = med.doses.map(d => `
    <button class="dose-btn" onclick="selectDose('${d}')" id="dose-${d.replace('.', '-')}">${d}</button>
  `).join('');

  doseSection.classList.remove('hidden');
  gameState.selectedDose = null;
  gameState.selectedSchedule = [];
  document.getElementById('schedule-section').classList.add('hidden');
  document.getElementById('med-submit').classList.add('hidden');
}

function selectDose(dose) {
  document.querySelectorAll('#dose-buttons .dose-btn').forEach(el => el.classList.remove('selected'));
  document.getElementById('dose-' + dose.replace('.', '-')).classList.add('selected');
  gameState.selectedDose = dose;

  // Show schedule selection
  document.getElementById('schedule-section').classList.remove('hidden');
  gameState.selectedSchedule = [];
  document.querySelectorAll('#schedule-buttons .dose-btn').forEach(el => el.classList.remove('selected'));
}

function toggleSchedule(schedule) {
  const el = document.getElementById('sched-' + schedule);
  const idx = gameState.selectedSchedule.indexOf(schedule);

  if (idx >= 0) {
    gameState.selectedSchedule.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    gameState.selectedSchedule.push(schedule);
    el.classList.add('selected');
  }

  // Show submit button if at least one schedule selected
  if (gameState.selectedSchedule.length > 0) {
    document.getElementById('med-submit').classList.remove('hidden');
  } else {
    document.getElementById('med-submit').classList.add('hidden');
  }
}

function checkMedAnswer() {
  const p = gameState.prescription;
  const correct =
    gameState.selectedMed === p.med &&
    gameState.selectedDose === p.dose &&
    gameState.selectedSchedule.length === p.schedule.length &&
    p.schedule.every(s => gameState.selectedSchedule.includes(s));

  const gameArea = document.getElementById('med-game-area');
  const bonus = correct ? gameState.level * 30 : 0;

  if (correct) {
    gameState.score += 100 + bonus;
    trackGameActivity('memory-meds', `level_${gameState.level}_correct`);
  } else {
    trackGameActivity('memory-meds', `level_${gameState.level}_incorrect`);
  }

  document.getElementById('med-score').textContent = gameState.score;

  gameArea.innerHTML = `
    <div class="game-over">
      <h3>${correct ? 'Correcto!' : 'Incorrecto'}</h3>
      ${!correct ? `
        <p>La prescripcion era:</p>
        <div class="med-prescription" style="margin: 1rem auto; max-width: 300px;">
          <p style="font-weight: 600;">${p.med} ${p.dose}</p>
          <p>${p.schedule.join(' - ')}</p>
        </div>
      ` : ''}
      <p><strong>Puntuacion: ${gameState.score}</strong></p>
      ${correct ? `<p>Bonus: +${bonus} puntos</p>` : ''}
      <button class="btn btn-primary" onclick="${correct ? 'nextMedLevel()' : 'startMedRound()'}">
        ${correct ? 'Siguiente nivel' : 'Reintentar'}
      </button>
    </div>
  `;
}

function nextMedLevel() {
  gameState.level++;
  gameState.showTime = Math.max(2000, gameState.showTime - 500); // Reduce time
  document.getElementById('med-level').textContent = gameState.level;
  startMedRound();
}

// Games
const THERAPEUTIC_LABELS = {
  motricidad_fina: 'Motricidad Fina',
  planificacion: 'Planificacion',
  atencion: 'Atencion',
  control_impulsos: 'Control de Impulsos',
  agilidad_mental: 'Agilidad Mental',
  memoria: 'Memoria',
  comprension_lectora: 'Comprension Lectora',
  responsabilidad_terapeutica: 'Resp. Terapeutica'
};

async function loadGames() {
  const container = document.getElementById('games-list');
  container.innerHTML = '<div class="loading">Cargando juegos...</div>';

  try {
    // In preview mode, show static game list
    if (isPreviewMode) {
      const previewGames = [
        { slug: 'lawn-mower', name: 'Cortadora de Cesped', description: 'Corta el cesped del jardin evitando obstaculos', icon: '🌿', therapeutic_areas: ['planificacion', 'atencion', 'control_impulsos'], available: true },
        { slug: 'medication-memory', name: 'Memoria de Medicacion', description: 'Memoriza recetas medicas y arma la medicacion correcta', icon: '💊', therapeutic_areas: ['memoria', 'atencion', 'comprension_lectora'], available: true }
      ];
      container.innerHTML = previewGames.map(g => {
        const tags = (g.therapeutic_areas || []).map(t =>
          `<span class="game-tag">${THERAPEUTIC_LABELS[t] || t}</span>`
        ).join('');
        return `
          <div class="game-card" onclick="openGame('${g.slug}')">
            <div class="game-icon">${g.icon || '🎮'}</div>
            <div class="game-info">
              <div class="game-name">${escapeHtml(g.name)}</div>
              <div class="game-desc">${escapeHtml(g.description || '')}</div>
              <div class="game-tags">${tags}</div>
            </div>
            <div class="game-status">
              <span class="availability-badge available">Modo Demo</span>
              <div class="level">Probar juego</div>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const result = await api(`/games?action=list&sessionToken=${sessionToken}`);

    if (result.games && result.games.length > 0) {
      container.innerHTML = result.games.map(g => {
        const tags = (g.therapeutic_areas || []).map(t =>
          `<span class="game-tag">${THERAPEUTIC_LABELS[t] || t}</span>`
        ).join('');

        const prog = g.progress;
        const statusHtml = prog
          ? `<div class="level">Nivel ${prog.current_level}</div>
             <div class="best-score">Mejor: ${prog.best_score}</div>
             <div style="font-size:0.75rem;color:var(--text-muted)">${prog.total_sessions} sesiones</div>`
          : `<div class="level">Sin jugar</div>`;

        const availBadge = g.available
          ? '<span class="availability-badge available">Disponible</span>'
          : '<span class="availability-badge unavailable">Fuera de horario</span>';

        return `
          <div class="game-card ${g.available ? '' : 'unavailable'}" onclick="${g.available ? `openGame('${g.slug}')` : ''}">
            <div class="game-icon">${g.icon || '🎮'}</div>
            <div class="game-info">
              <div class="game-name">${escapeHtml(g.name)}</div>
              <div class="game-desc">${escapeHtml(g.description || '')}</div>
              <div class="game-tags">${tags}</div>
            </div>
            <div class="game-status">
              ${availBadge}
              ${statusHtml}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎮</div><p>No hay juegos disponibles en este momento.</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>Error al cargar juegos.</p></div>';
  }
}

function openGame(slug) {
  const token = sessionToken;
  if (isPreviewMode) {
    window.open(`/hdd/portal/games/${slug}.html?demo=true`, '_blank');
  } else {
    window.open(`/hdd/portal/games/${slug}.html?token=${encodeURIComponent(token)}`, '_blank');
  }
}

// Init
async function init() {
  // If in preview mode, show app directly with demo user
  if (isPreviewMode) {
    currentUser = {
      id: 0,
      fullName: 'Modo Vista Previa (Profesional)',
      dni: '00000000',
      email: 'preview@hdd.local',
      status: 'active'
    };
    sessionToken = null;
    showApp();
    loadFeed();

    // Show a preview mode indicator
    const header = document.querySelector('.header-content');
    if (header) {
      const badge = document.createElement('span');
      badge.style.cssText = 'background:#f59e0b;color:#fff;padding:0.25rem 0.75rem;border-radius:4px;font-size:0.75rem;font-weight:600;margin-left:0.5rem;';
      badge.textContent = 'VISTA PREVIA';
      const logo = header.querySelector('.logo');
      if (logo) logo.insertAdjacentElement('afterend', badge);
    }
    return;
  }

  const valid = await verifySession();
  if (valid) {
    showApp();
    loadFeed();
  } else {
    showLoginForm();
  }
}

init();

// Launch game in /games/play/ directory (for new games like pill-organizer, neuro-chef)
function launchGame(gameSlug) {
  console.log('[launchGame] Called with slug:', gameSlug);
  const token = sessionToken;
  const patientId = currentUser?.id || 'preview';
  
  // Map game slugs to actual paths
  const gamePaths = {
    'pill-organizer': '/games/play/pill-organizer.html',
    'neuro-chef': '/games/play/neuro-chef/index.html'
  };
  
  const gamePath = gamePaths[gameSlug] || `/games/play/${gameSlug}.html`;
  console.log('[launchGame] Game path:', gamePath);
  console.log('[launchGame] Preview mode:', isPreviewMode);
  console.log('[launchGame] Patient ID:', patientId);
  
  if (isPreviewMode) {
    const url = `${gamePath}?demo=true&patient_id=${patientId}`;
    console.log('[launchGame] Opening URL:', url);
    window.open(url, '_blank');
  } else {
    const url = `${gamePath}?session=${encodeURIComponent(token)}&patient_id=${patientId}`;
    console.log('[launchGame] Opening URL:', url);
    window.open(url, '_blank');
  }
}
