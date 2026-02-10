// ========== STARS ANIMATION ==========
const canvas = document.getElementById('stars-canvas');
const ctx = canvas.getContext('2d');
let stars = [];
const numStars = 200;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initStars();
}

function initStars() {
  stars = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.5 + 0.3,
      speed: Math.random() * 0.02 + 0.01
    });
  }
}

function drawStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  stars.forEach(star => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
    ctx.fill();

    // Twinkle effect
    star.alpha += star.speed * (Math.random() > 0.5 ? 1 : -1);
    if (star.alpha > 0.8) star.speed = -Math.abs(star.speed);
    if (star.alpha < 0.2) star.speed = Math.abs(star.speed);
  });

  requestAnimationFrame(drawStars);
}

resizeCanvas();
drawStars();
window.addEventListener('resize', resizeCanvas);

// ========== BLACKBOARD FUNCTIONALITY ==========
let selectedColor = '#e8dcc8';
let boardMessages = [];
let pendingImageFile = null;

// Load messages from server
async function loadBoardMessages() {
  try {
    // Only load 'community' type messages for the HDD blackboard
    const response = await fetch('/api/announcements?type=community&limit=20');
    const data = await response.json();
    if (data.announcements) {
      boardMessages = data.announcements;
      renderBoardMessages();
    }
  } catch (e) {
    console.log('Could not load board messages:', e);
  }
}

function parseMessageContent(content) {
  // Parse content to separate text from image URL
  const imgMatch = content.match(/\[IMG:(.*?)\]$/);
  if (imgMatch) {
    return {
      text: content.replace(/\n?\[IMG:.*?\]$/, ''),
      imageUrl: imgMatch[1]
    };
  }
  return { text: content, imageUrl: null };
}

function renderBoardMessages() {
  const container = document.getElementById('blackboard-messages');
  if (!boardMessages.length) {
    container.innerHTML = `
      <div class="board-message" style="color: #e8dcc8;">
        Bienvenidos a la pizarra comunitaria del Hospital de Día
        <div class="board-message-author">- Equipo HdD</div>
      </div>
    `;
    return;
  }

  container.innerHTML = boardMessages.map(msg => {
    const { text, imageUrl } = parseMessageContent(msg.content);
    let html = `<div class="board-message" style="color: ${msg.color || '#e8dcc8'};">`;
    html += escapeHtml(text);
    if (imageUrl) {
      html += `<div class="board-message-image"><img src="${escapeHtml(imageUrl)}" alt="Imagen adjunta" loading="lazy"></div>`;
    }
    html += `<div class="board-message-author">- ${escapeHtml(msg.author_name || 'Anónimo')}, ${formatDate(msg.created_at)}</div>`;
    html += `</div>`;
    return html;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Image upload handling
document.getElementById('board-image-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file size (2MB max)
  if (file.size > 2 * 1024 * 1024) {
    alert('La imagen es demasiado grande. Máximo 2MB.');
    this.value = '';
    return;
  }

  // Show preview
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('board-image-preview-img').src = e.target.result;
    document.getElementById('board-image-preview').classList.add('show');
    document.getElementById('board-image-btn').classList.add('has-image');
  };
  reader.readAsDataURL(file);
  pendingImageFile = file;
});

function clearBoardImage() {
  pendingImageFile = null;
  document.getElementById('board-image-input').value = '';
  document.getElementById('board-image-preview').classList.remove('show');
  document.getElementById('board-image-btn').classList.remove('has-image');
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/api/board-images', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al subir la imagen');
  }
  return data.imageUrl;
}

async function postBoardMessage() {
  const name = document.getElementById('board-name').value.trim();
  const message = document.getElementById('board-message').value.trim();

  if (!message && !pendingImageFile) {
    alert('Escribí un mensaje o adjuntá una imagen para publicar');
    return;
  }

  try {
    let imageUrl = null;

    // Upload image first if present
    if (pendingImageFile) {
      try {
        imageUrl = await uploadImage(pendingImageFile);
      } catch (imgError) {
        alert(imgError.message || 'Error al subir la imagen');
        return;
      }
    }

    const response = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        title: 'Mensaje de Pizarra',
        content: message || '(imagen)',
        authorName: name || 'Visitante',
        type: 'community',
        color: selectedColor,
        imageUrl: imageUrl
      })
    });

    const data = await response.json();
    if (data.success) {
      document.getElementById('board-name').value = '';
      document.getElementById('board-message').value = '';
      clearBoardImage();
      loadBoardMessages();
    } else {
      alert(data.error || 'Error al publicar el mensaje');
    }
  } catch (e) {
    console.error('Error posting message:', e);
    alert('Error de conexión');
  }
}

// Chalk color selection
document.querySelectorAll('.chalk-color').forEach(el => {
  el.addEventListener('click', function() {
    document.querySelectorAll('.chalk-color').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    selectedColor = this.dataset.color;
  });
});

// Load messages on page load
loadBoardMessages();

// ========== DYNAMIC ACTIVITIES LOADING ==========
async function loadPublicActivities() {
  const container = document.getElementById('public-activities-grid');
  if (!container) return;

  try {
    const response = await fetch('/api/hdd/admin?action=public_activities');
    const data = await response.json();

    if (data.activities && data.activities.length > 0) {
      container.innerHTML = data.activities.map(a => `
        <div class="activity-card">
          <div class="activity-icon">${a.icon || '📋'}</div>
          <div class="activity-info">
            <div class="activity-name">${a.name}</div>
            <div class="activity-schedule">${a.dayName} ${a.startTime} - ${a.endTime}</div>
          </div>
        </div>
      `).join('');
    }
    // If no activities returned, keep the default HTML as fallback
  } catch (e) {
    // Keep default HTML activities on error
    console.log('Could not load activities:', e);
  }
}

loadPublicActivities();
