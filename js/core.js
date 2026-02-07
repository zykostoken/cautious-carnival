// ==================== SISTEMA i18n ====================
const i18n = {
    es: {
        nav: {
            methodology: 'Metodología',
            team: 'Equipo',
            services: 'Servicios',
            timeline: 'Bitácora',
            contact: 'Contacto',
            professionals: 'Profesionales'
        },
        telemedicine: {
            title: 'Telemedicina Internacional',
            subtitle: 'Primera clínica psiquiátrica de Argentina con pagos internacionales',
            preparing: 'Estamos preparando algo único',
            description: 'Sistema de videoconsultas con pago seguro integrado - accesible desde cualquier parte del mundo',
            mercadopago: 'MercadoPago',
            mercadopagoDesc: 'Tarjetas de crédito/débito, transferencias',
            crypto: 'Criptomonedas',
            cryptoDesc: 'Bitcoin, USDT, USDC - Sin fronteras',
            whatIncludes: '¿Qué incluirá?',
            videoHD: 'Videoconsulta HD con Jitsi Meet (sin apps)',
            prepayment: 'Pago previo obligatorio (protección anti-abuse)',
            qrPayment: 'QR para pagar desde celular',
            history: 'Historial de consultas y recibos',
            multiLang: 'Multi-idioma (ES/EN/PT)',
            hours: 'Atención 8:00 a 20:00 hs (GMT-3)',
            preregister: 'Pre-registro (opcional)',
            preregisterDesc: 'Dejá tu email para ser de los primeros en acceder cuando lancemos:',
            notifyMe: 'Avisame',
            meanwhile: 'Mientras tanto, podés contactarnos por teléfono:',
            soon: 'PRÓXIMAMENTE'
        },
        banner: {
            telemedicineIntl: 'Telemedicina Internacional',
            payments: 'Pagos con MercadoPago + Crypto',
            soon: 'Pronto'
        }
    },
    en: {
        nav: {
            methodology: 'Methodology',
            team: 'Team',
            services: 'Services',
            timeline: 'Timeline',
            contact: 'Contact',
            professionals: 'Professionals'
        },
        telemedicine: {
            title: 'International Telemedicine',
            subtitle: 'First psychiatric clinic in Argentina with international payments',
            preparing: 'We are preparing something unique',
            description: 'Video consultation system with integrated secure payment - accessible from anywhere in the world',
            mercadopago: 'MercadoPago',
            mercadopagoDesc: 'Credit/debit cards, transfers',
            crypto: 'Cryptocurrency',
            cryptoDesc: 'Bitcoin, USDT, USDC - No borders',
            whatIncludes: 'What will it include?',
            videoHD: 'HD Video consultation with Jitsi Meet (no apps)',
            prepayment: 'Mandatory prepayment (anti-abuse protection)',
            qrPayment: 'QR to pay from your phone',
            history: 'Consultation history and receipts',
            multiLang: 'Multi-language (ES/EN/PT)',
            hours: 'Service 8:00 AM to 8:00 PM (GMT-3)',
            preregister: 'Pre-register (optional)',
            preregisterDesc: 'Leave your email to be among the first to access when we launch:',
            notifyMe: 'Notify me',
            meanwhile: 'Meanwhile, you can contact us by phone:',
            soon: 'COMING SOON'
        },
        banner: {
            telemedicineIntl: 'International Telemedicine',
            payments: 'MercadoPago + Crypto payments',
            soon: 'Soon'
        }
    },
    pt: {
        nav: {
            methodology: 'Metodologia',
            team: 'Equipe',
            services: 'Serviços',
            timeline: 'Linha do tempo',
            contact: 'Contato',
            professionals: 'Profissionais'
        },
        telemedicine: {
            title: 'Telemedicina Internacional',
            subtitle: 'Primeira clínica psiquiátrica da Argentina com pagamentos internacionais',
            preparing: 'Estamos preparando algo único',
            description: 'Sistema de videoconsultas com pagamento seguro integrado - acessível de qualquer lugar do mundo',
            mercadopago: 'MercadoPago',
            mercadopagoDesc: 'Cartões de crédito/débito, transferências',
            crypto: 'Criptomoedas',
            cryptoDesc: 'Bitcoin, USDT, USDC - Sem fronteiras',
            whatIncludes: 'O que incluirá?',
            videoHD: 'Videoconsulta HD com Jitsi Meet (sem apps)',
            prepayment: 'Pagamento prévio obrigatório (proteção anti-abuso)',
            qrPayment: 'QR para pagar do celular',
            history: 'Histórico de consultas e recibos',
            multiLang: 'Multi-idioma (ES/EN/PT)',
            hours: 'Atendimento 8:00 às 20:00 hs (GMT-3)',
            preregister: 'Pré-registro (opcional)',
            preregisterDesc: 'Deixe seu email para ser um dos primeiros a acessar quando lançarmos:',
            notifyMe: 'Avise-me',
            meanwhile: 'Enquanto isso, você pode nos contatar por telefone:',
            soon: 'EM BREVE'
        },
        banner: {
            telemedicineIntl: 'Telemedicina Internacional',
            payments: 'Pagamentos MercadoPago + Crypto',
            soon: 'Em breve'
        }
    }
};

const langFlags = { es: '🇪🇸', en: '🇺🇸', pt: '🇧🇷' };
let currentLang = localStorage.getItem('lang') || 'es';

function toggleLangMenu() {
    document.getElementById('lang-menu').classList.toggle('active');
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.getElementById('current-lang-flag').textContent = langFlags[lang];
    document.getElementById('lang-menu').classList.remove('active');
    document.documentElement.lang = lang;
    updateI18n();
}

function updateI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const keys = key.split('.');
        let value = i18n[currentLang];
        for (const k of keys) {
            if (value) value = value[k];
        }
        if (value) el.textContent = value;
    });
    // Update banner text
    const bannerText = document.querySelector('.neon-banner-text');
    const bannerSubtitle = document.querySelector('.neon-banner-subtitle');
    const bannerBadge = document.querySelector('.neon-badge-soon');
    if (bannerText) bannerText.textContent = i18n[currentLang].banner.telemedicineIntl;
    if (bannerSubtitle) bannerSubtitle.textContent = i18n[currentLang].banner.payments;
    if (bannerBadge) bannerBadge.textContent = i18n[currentLang].banner.soon;
}

// Close lang menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-selector')) {
        document.getElementById('lang-menu')?.classList.remove('active');
    }
});

// Initialize language on load
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-lang-flag').textContent = langFlags[currentLang];
    document.documentElement.lang = currentLang;
    if (currentLang !== 'es') updateI18n();
});


// ==================== MODAL SYSTEM ====================
// Modal content is lazy-loaded from modal-content.js
let modalContent = null;

async function ensureModalContent() {
    if (modalContent) return;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/js/modal-content.js';
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
}

async function openModal(id) {
    await ensureModalContent();
    const content = modalContent[id];
    if (content) {
        document.getElementById('modal-inner').innerHTML = content;
        document.getElementById('modal-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        // If telemedicine modal, fetch current price
        if (id === 'telemedicina' && typeof telemedFetchCurrentPrice === 'function') {
            telemedFetchCurrentPrice();
        }
    }
}

    if (!event || event.target.id === 'modal-overlay') {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.add('closing');
        setTimeout(() => {
            overlay.classList.remove('active', 'closing');
            document.body.style.overflow = '';
        }, 300);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ========== BACKEND INTEGRATION ==========

// Session management
const sessionId = localStorage.getItem('sessionId') || crypto.randomUUID();
localStorage.setItem('sessionId', sessionId);

// Telemedicine user management
let telemedUserId = localStorage.getItem('telemedUserId');

// Initialize session tracking
async function initSession() {
    try {
        await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'session_start',
                data: {
                    userAgent: navigator.userAgent,
                    referrer: document.referrer
                }
            })
        });
    } catch (e) {
        console.log('Session tracking unavailable');
    }
}

// Track section views
const observedSections = new Set();
const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !observedSections.has(entry.target.id)) {
            observedSections.add(entry.target.id);
            trackSectionView(entry.target.id);
            updateMetrics();
        }
    });
}, { threshold: 0.3 });

document.querySelectorAll('section[id]').forEach(section => {
    sectionObserver.observe(section);
});

async function trackSectionView(sectionId) {
    try {
        await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'section_view',
                data: { sectionId }
            })
        });
    } catch (e) {}
}

// Contact Form Submission
async function submitContactForm(event) {
    event.preventDefault();

    const form = document.getElementById('contact-form');
    const submitBtn = document.getElementById('contact-submit-btn');
    const messageEl = document.getElementById('contact-form-message');

    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const consultationType = document.getElementById('contact-type').value;
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !message) {
        messageEl.textContent = 'Por favor completá los campos requeridos';
        messageEl.className = 'form-message error';
        messageEl.style.display = 'block';
        return;
    }

    if (!email && !phone) {
        messageEl.textContent = 'Por favor proporcioná un email o teléfono para contactarte';
        messageEl.className = 'form-message error';
        messageEl.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    messageEl.style.display = 'none';

    try {
        const response = await fetch('/api/consultations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'submit',
                name,
                email: email || null,
                phone: phone || null,
                consultationType,
                subject: subject || null,
                message,
                sessionId
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            messageEl.textContent = data.message || 'Su consulta ha sido enviada. Nos pondremos en contacto a la brevedad.';
            messageEl.className = 'form-message success';
            messageEl.style.display = 'block';
            form.reset();

            // Track the event
            try {
                await fetch('/api/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        eventType: 'consultation_submitted',
                        data: { consultationType }
                    })
                });
            } catch (e) {}
        } else {
            messageEl.textContent = data.error || 'Hubo un error al enviar tu consulta. Por favor intentá nuevamente.';
            messageEl.className = 'form-message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Contact form error:', error);
        messageEl.textContent = 'Error de conexión. Por favor intentá nuevamente.';
        messageEl.className = 'form-message error';
        messageEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Consulta';
    }
}

// Heartbeat for time on site tracking
setInterval(async () => {
    try {
        await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'heartbeat'
            })
        });
    } catch (e) {}
}, 30000);

// Survey tracking
const surveysCompleted = new Set(JSON.parse(localStorage.getItem('surveysCompleted') || '[]'));

async function selectSurvey(button, surveyId) {
    const response = button.textContent;
    const container = button.closest('.survey-options');

    // Visual feedback
    container.querySelectorAll('.survey-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = true;
    });
    button.classList.add('selected');

    try {
        const res = await fetch('/api/survey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                surveyId,
                response
            })
        });

        if (res.ok) {
            surveysCompleted.add(surveyId);
            localStorage.setItem('surveysCompleted', JSON.stringify([...surveysCompleted]));
            updateMetrics();
        }
    } catch (e) {
        console.log('Survey tracking unavailable');
    }
}

// Update metrics display
const sessionStartTime = Date.now();

function updateMetrics() {
    // Sections viewed
    const sectionsEl = document.getElementById('m-nav');
    if (sectionsEl) sectionsEl.textContent = observedSections.size;

    // Time on site
    const tiempoEl = document.getElementById('m-tiempo');
    if (tiempoEl) {
        const seconds = Math.floor((Date.now() - sessionStartTime) / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        tiempoEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Surveys completed
    const encEl = document.getElementById('m-enc');
    if (encEl) encEl.textContent = `${surveysCompleted.size}/3`;

    // Intention percentage (based on positive responses)
    const intencionEl = document.getElementById('m-intencion');
    if (intencionEl) {
        const positive = [...surveysCompleted].filter(s => {
            const btn = document.querySelector(`.survey-btn.selected`);
            return btn && (btn.textContent.includes('Sí') || btn.textContent.includes('interesa'));
        }).length;
        const pct = surveysCompleted.size > 0 ? Math.round((positive / surveysCompleted.size) * 100) : 0;
        intencionEl.textContent = `${pct}%`;
    }
}

// Update time on site every second
setInterval(updateMetrics, 1000);

// Track modal opens
const originalOpenModal = openModal;
openModal = function(id) {
    originalOpenModal(id);
    try {
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'modal_open',
                data: { modalId: id }
            })
        });
    } catch (e) {}

    // If telemedicina modal, check user status
    if (id === 'telemedicina') {
        checkTelemedicineUser();
    }
};

// Track contact clicks
document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', () => {
        const type = link.href.startsWith('tel:') ? 'phone' : 'email';
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'contact_click',
                data: {
                    contactType: type,
                    contactValue: link.href.replace(/^(tel:|mailto:)/, '')
                }
            })
        }).catch(() => {});
    });
});


// ========== ANNOUNCEMENTS / CARTELERA ==========

async function loadAnnouncements() {
    try {
        const res = await fetch('/api/announcements');
        const data = await res.json();

        if (data.announcements && data.announcements.length > 0) {
            // Filter out 'community' type announcements (those are for HDD blackboard only)
            const filteredAnnouncements = data.announcements.filter(a => a.type !== 'community');

            if (filteredAnnouncements.length === 0) return;

            const container = document.getElementById('announcements-container');
            const list = document.getElementById('announcements-list');

            list.innerHTML = filteredAnnouncements.map(a => {
                const typeEmoji = {
                    'info': 'ℹ️',
                    'event': '📅',
                    'alert': '⚠️',
                    'celebration': '🎉'
                }[a.type] || '📢';

                const date = new Date(a.createdAt).toLocaleDateString('es-AR');

                return `
                    <div class="announcement-item ${a.isPinned ? 'pinned' : ''}">
                        <span class="announcement-type">${typeEmoji}</span>
                        <div class="announcement-content">
                            <h4>${a.title}</h4>
                            <p>${a.content}</p>
                            <span class="announcement-meta">${date}</span>
                        </div>
                    </div>
                `;
            }).join('');

            container.style.display = 'block';
        }
    } catch (e) {
        console.log('Announcements not available');
    }
}


// ========== NEON BANNER FUNCTIONS ==========
function initNeonBanner() {
    // Check if banner was closed in this session
    const bannerClosed = sessionStorage.getItem('neonBannerClosed');
    if (bannerClosed) {
        const banner = document.getElementById('neon-telemedicina-banner');
        if (banner) banner.style.display = 'none';
    }
}

function closeNeonBanner() {
    const banner = document.getElementById('neon-telemedicina-banner');
    if (banner) {
        banner.style.display = 'none';
        sessionStorage.setItem('neonBannerClosed', 'true');
    }
}

// ========== ADMIN FUNCTIONS ==========
// Admin emails - can be configured via environment or hardcoded
const ADMIN_EMAILS = ['gonzaloperezcortizo@gmail.com', 'gerencia@clinicajoseingenieros.ar'];

function isAdmin() {
    return professionalData && ADMIN_EMAILS.includes(professionalData.email);
}

function toggleAddProfessionalForm() {
    const form = document.getElementById('admin-add-form');
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

async function loadAdminProfessionalList() {
    if (!isAdmin()) return;

    const listEl = document.getElementById('admin-professional-list');
    if (!listEl) return;

    try {
        const res = await fetch(`/api/professionals?action=admin_list&sessionToken=${professionalSession}`);
        const data = await res.json();

        if (data.professionals && data.professionals.length > 0) {
            listEl.innerHTML = data.professionals.map(prof => `
                <div class="admin-professional-item ${!prof.isActive ? 'inactive' : prof.isPending ? 'pending' : ''}">
                    <div class="admin-professional-header">
                        <div>
                            <div class="admin-professional-name">${prof.fullName}</div>
                            <div class="admin-professional-specialty">${prof.specialty} - ${prof.email}</div>
                        </div>
                        <span class="admin-professional-status ${prof.isActive ? 'active' : prof.isPending ? 'pending' : 'inactive'}">
                            ${prof.isActive ? 'Activo' : prof.isPending ? 'Pendiente' : 'Inactivo'}
                        </span>
                    </div>
                    <div class="admin-professional-actions">
                        ${prof.isPending ? `
                            <button class="admin-btn admin-btn-approve" onclick="adminApproveProfessional(${prof.id})">Aprobar</button>
                        ` : ''}
                        ${prof.isActive ? `
                            <button class="admin-btn admin-btn-deactivate" onclick="adminToggleProfessional(${prof.id}, false)">Desactivar</button>
                        ` : `
                            <button class="admin-btn admin-btn-activate" onclick="adminToggleProfessional(${prof.id}, true)">Activar</button>
                        `}
                    </div>
                </div>
            `).join('');
        } else {
            listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No hay profesionales registrados</p>';
        }
    } catch (e) {
        console.error('Error loading admin list:', e);
        listEl.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem;">Error al cargar profesionales</p>';
    }
}

async function adminToggleProfessional(profId, activate) {
    if (!isAdmin() || !confirm(`¿${activate ? 'Activar' : 'Desactivar'} este profesional?`)) return;

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'admin_toggle_active',
                sessionToken: professionalSession,
                professionalId: profId,
                isActive: activate
            })
        });

        const data = await res.json();
        if (data.success) {
            loadAdminProfessionalList();
        } else {
            alert(data.error || 'Error al actualizar profesional');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

async function adminApproveProfessional(profId) {
    if (!isAdmin() || !confirm('¿Aprobar este profesional?')) return;
    await adminToggleProfessional(profId, true);
}

async function adminAddProfessional(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const fullName = document.getElementById('admin-add-fullname').value;
    const email = document.getElementById('admin-add-email').value;
    const password = document.getElementById('admin-add-password').value;
    const specialty = document.getElementById('admin-add-specialty').value;
    const whatsapp = document.getElementById('admin-add-whatsapp').value;
    const errorEl = document.getElementById('admin-add-error');

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'admin_create_professional',
                sessionToken: professionalSession,
                fullName,
                email,
                password,
                specialty,
                whatsapp
            })
        });

        const data = await res.json();
        if (data.success) {
            // Clear form
            document.getElementById('admin-add-fullname').value = '';
            document.getElementById('admin-add-email').value = '';
            document.getElementById('admin-add-password').value = '';
            document.getElementById('admin-add-whatsapp').value = '';
            toggleAddProfessionalForm();
            loadAdminProfessionalList();
            alert('Profesional creado exitosamente');
        } else {
            errorEl.textContent = data.error || 'Error al crear profesional';
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

// Override showProfessionalDashboard to include admin check
const originalShowProfessionalDashboard = showProfessionalDashboard;
showProfessionalDashboard = function() {
    originalShowProfessionalDashboard();

    // Show admin section if user is admin
    const adminSection = document.getElementById('admin-section');
    if (adminSection && isAdmin()) {
        adminSection.style.display = 'block';
        loadAdminProfessionalList();
    }
};

// ========== INITIALIZATION ==========

// Check for professional hash in URL
if (window.location.hash === '#profesional') {
    setTimeout(() => openProfessionalLogin(), 500);
}

// Auto-verify professional session on load
if (professionalSession) {
    verifyProfessionalSession();
}

// Load announcements on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAnnouncements();
    initNeonBanner();
});

