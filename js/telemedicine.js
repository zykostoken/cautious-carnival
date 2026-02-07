// ========== TELEMEDICINE FUNCTIONS ==========

// Telemedicine state
let telemedCurrentUser = JSON.parse(localStorage.getItem('telemedUser') || 'null');
let telemedSessionToken = null;
let telemedPaymentReference = null;
let telemedTimerInterval = null;
let telemedPaymentTimerInterval = null;
let telemedCallDurationInterval = null;
let telemedPaymentCheckInterval = null;

async function checkTelemedicineUser() {
    // Show the appropriate step based on user state
    if (telemedCurrentUser && telemedCurrentUser.id) {
        telemedShowStep('services');
        document.getElementById('telemed-user-name').textContent = telemedCurrentUser.fullName || telemedCurrentUser.email;
    } else {
        telemedShowStep('register');
    }

    // Set min date for scheduling
    const dateInput = document.getElementById('telemed-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }
}

function telemedShowStep(step) {
    // Hide all steps
    document.querySelectorAll('.telemed-step').forEach(el => el.style.display = 'none');
    // Show requested step
    const stepEl = document.getElementById(`telemed-step-${step}`);
    if (stepEl) stepEl.style.display = 'block';
}

async function telemedRegister(event) {
    event.preventDefault();
    const fullname = document.getElementById('telemed-fullname').value.trim();
    const email = document.getElementById('telemed-email').value.trim();
    const phone = document.getElementById('telemed-phone').value.trim();
    const errorEl = document.getElementById('telemed-register-error');

    if (!fullname || !email) {
        errorEl.textContent = 'Por favor completá nombre y email.';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/telemedicine/credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'register',
                email,
                phone: phone || null,
                full_name: fullname
            })
        });

        const data = await res.json();

        if (data.success && data.userId) {
            telemedCurrentUser = {
                id: data.userId,
                email,
                fullName: fullname,
                phone
            };
            localStorage.setItem('telemedUser', JSON.stringify(telemedCurrentUser));
            telemedUserId = data.userId;
            localStorage.setItem('telemedUserId', data.userId);

            telemedShowStep('services');
            document.getElementById('telemed-user-name').textContent = fullname;
            errorEl.style.display = 'none';
        } else {
            errorEl.textContent = data.error || 'Error al registrar. Intentá nuevamente.';
            errorEl.style.display = 'block';
        }
    } catch (e) {
        console.error('Registration error:', e);
        errorEl.textContent = 'Error de conexión. Intentá nuevamente.';
        errorEl.style.display = 'block';
    }
}

function telemedLogout() {
    telemedCurrentUser = null;
    telemedSessionToken = null;
    localStorage.removeItem('telemedUser');
    localStorage.removeItem('telemedUserId');
    telemedUserId = null;
    telemedShowStep('register');
}

// Store current price info
let telemedCurrentPrice = null;

// Fetch current price from server
async function telemedFetchCurrentPrice() {
    try {
        const res = await fetch('/api/telemedicine/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_current_price' })
        });
        const data = await res.json();
        if (data.success) {
            telemedCurrentPrice = data;
            const priceDisplay = document.getElementById('telemed-price-display');
            const timeslotDisplay = document.getElementById('telemed-timeslot-display');
            if (priceDisplay) {
                priceDisplay.textContent = data.formattedPrice;
            }
            if (timeslotDisplay) {
                timeslotDisplay.textContent = `Franja: ${data.timeSlot}`;
            }
        }
    } catch (e) {
        console.log('Could not fetch price:', e);
    }
}

async function telemedSelectService(type) {
    if (!telemedCurrentUser) {
        telemedShowStep('register');
        return;
    }

    if (type === 'immediate') {
        // Request immediate on-demand call - will require payment first
        try {
            const res = await fetch('/api/telemedicine/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'request_call',
                    userId: telemedCurrentUser.id,
                    callType: 'on_demand',
                    patientName: telemedCurrentUser.fullName,
                    patientEmail: telemedCurrentUser.email,
                    patientPhone: telemedCurrentUser.phone
                })
            });

            const data = await res.json();

            if (data.success) {
                telemedSessionToken = data.sessionToken;
                telemedCurrentPrice = data.priceInfo;

                // Check if payment is required
                if (data.requiresPayment && data.paymentInfo && data.paymentInfo.mercadoPagoLink) {
                    // Store payment reference for verification
                    telemedPaymentReference = data.paymentInfo.externalReference;

                    // Update payment step UI
                    const payPrice = document.getElementById('telemed-pay-price');
                    const payTimeslot = document.getElementById('telemed-pay-timeslot');
                    const mpLink = document.getElementById('telemed-mp-link');

                    if (payPrice && data.priceInfo) {
                        payPrice.textContent = data.priceInfo.formattedPrice;
                    }
                    if (payTimeslot && data.priceInfo) {
                        payTimeslot.textContent = `Franja: ${data.priceInfo.timeSlot}`;
                    }
                    if (mpLink && data.paymentInfo.mercadoPagoLink) {
                        mpLink.href = data.paymentInfo.mercadoPagoLink;
                    }

                    // Show payment step
                    telemedShowStep('payment');
                    telemedStartPaymentTimer(data.expiresAt);
                } else if (!data.requiresPayment || !data.paymentInfo?.mercadoPagoLink) {
                    // MercadoPago not configured - show contact info
                    alert(data.message || 'Sistema de pagos no disponible. Por favor contacte a administración para coordinar su consulta.');
                    telemedBackToServices();
                }
            } else {
                alert(data.message || 'Error al solicitar consulta.');
            }
        } catch (e) {
            console.error('Request call error:', e);
            alert('Error de conexion. Por favor intenta nuevamente.');
        }
    }
    // 'scheduled' type is no longer supported - on-demand only
}

function telemedStartPaymentTimer(expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    const timerEl = document.getElementById('telemed-payment-timer');

    if (telemedPaymentTimerInterval) clearInterval(telemedPaymentTimerInterval);

    telemedPaymentTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = expiryTime - now;

        if (remaining <= 0) {
            clearInterval(telemedPaymentTimerInterval);
            timerEl.textContent = '00:00';
            alert('El tiempo para completar el pago ha expirado. Por favor, solicite una nueva consulta.');
            telemedCancelPayment();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

async function telemedVerifyPayment() {
    if (!telemedSessionToken || !telemedPaymentReference) {
        alert('No hay pago pendiente para verificar.');
        return;
    }

    const statusEl = document.getElementById('telemed-payment-status');
    const statusTextEl = document.getElementById('telemed-payment-status-text');

    statusEl.style.display = 'block';
    statusTextEl.textContent = 'Verificando pago...';
    statusTextEl.style.color = 'var(--text-muted)';

    try {
        const res = await fetch('/api/telemedicine/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'check_payment_status',
                sessionToken: telemedSessionToken,
                externalReference: telemedPaymentReference
            })
        });

        const data = await res.json();

        if (data.paymentStatus === 'approved') {
            statusTextEl.textContent = 'Pago confirmado! Ingresando a sala de espera...';
            statusTextEl.style.color = 'var(--accent-green)';

            // Stop payment timer
            if (telemedPaymentTimerInterval) clearInterval(telemedPaymentTimerInterval);

            // Update waiting room with price info
            const waitingPrice = document.getElementById('telemed-waiting-price');
            if (waitingPrice && telemedCurrentPrice) {
                waitingPrice.textContent = telemedCurrentPrice.formattedPrice;
            }

            // Transition to waiting room
            setTimeout(() => {
                telemedShowStep('waiting');
                telemedStartWaitingTimer(null); // Will use remaining time
            }, 1500);
        } else if (data.paymentStatus === 'rejected') {
            statusTextEl.textContent = 'El pago fue rechazado. Por favor intente nuevamente con otro medio de pago.';
            statusTextEl.style.color = 'var(--accent-warm)';
        } else {
            statusTextEl.textContent = 'Pago aun no confirmado. Por favor complete el pago en MercadoPago y vuelva a verificar.';
            statusTextEl.style.color = '#ffc107';
        }
    } catch (e) {
        console.error('Payment verification error:', e);
        statusTextEl.textContent = 'Error al verificar pago. Intente nuevamente.';
        statusTextEl.style.color = 'var(--accent-warm)';
    }
}

async function telemedCancelPayment() {
    if (telemedPaymentTimerInterval) clearInterval(telemedPaymentTimerInterval);
    if (telemedPaymentCheckInterval) clearInterval(telemedPaymentCheckInterval);

    if (telemedSessionToken) {
        try {
            await fetch('/api/telemedicine/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'cancel_call',
                    sessionToken: telemedSessionToken
                })
            });
        } catch (e) {
            // Continue with cancellation
        }
    }

    telemedSessionToken = null;
    telemedPaymentReference = null;
    telemedBackToServices();
}

function telemedStartWaitingTimer(expiresAt) {
    // If expiresAt is null, calculate remaining time (30 mins from session creation)
    const expiryTime = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 30 * 60 * 1000;
    const timerEl = document.getElementById('telemed-timer');

    if (telemedTimerInterval) clearInterval(telemedTimerInterval);

    telemedTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = expiryTime - now;

        if (remaining <= 0) {
            clearInterval(telemedTimerInterval);
            timerEl.textContent = '00:00';
            alert('La sesión ha expirado. Por favor, solicitá una nueva consulta.');
            telemedBackToServices();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);

    // Poll for professional joining (in production, use WebSocket)
    telemedPollForProfessional();
}

async function telemedPollForProfessional() {
    // Simple polling every 5 seconds to check if a professional took the call
    const checkInterval = setInterval(async () => {
        if (!telemedSessionToken) {
            clearInterval(checkInterval);
            return;
        }

        try {
            const res = await fetch(`/api/call-queue?videoSessionToken=${telemedSessionToken}`);
            const data = await res.json();

            // Check if payment is confirmed and professional joined
            if (data.paymentConfirmed && (data.videoStatus === 'in_progress' || data.professionalJoined)) {
                clearInterval(checkInterval);
                if (telemedTimerInterval) clearInterval(telemedTimerInterval);
                telemedStartVideoCall();
            }
        } catch (e) {
            // Continue polling
        }
    }, 5000);
}

async function telemedCancelCall() {
    if (telemedTimerInterval) clearInterval(telemedTimerInterval);

    if (telemedSessionToken) {
        try {
            await fetch('/api/telemedicine/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'cancel_call',
                    sessionToken: telemedSessionToken
                })
            });
        } catch (e) {
            // Continue with cancellation
        }
    }

    telemedSessionToken = null;
    telemedBackToServices();
}

function telemedBackToServices() {
    telemedShowStep('services');
    telemedFetchCurrentPrice(); // Refresh price when returning
}

function telemedStartVideoCall() {
    telemedShowStep('call');

    // Start call duration timer
    const startTime = Date.now();
    const durationEl = document.getElementById('telemed-call-duration');

    telemedCallDurationInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        durationEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);

    // Initialize Jitsi Meet in the container
    const roomName = `ClinicaJoseIngenieros_${telemedSessionToken.substring(0, 12)}`;
    const container = document.getElementById('telemed-jitsi-container');

    // Load Jitsi API if not loaded
    if (!window.JitsiMeetExternalAPI) {
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.onload = () => initJitsiInModal(roomName, container);
        document.head.appendChild(script);
    } else {
        initJitsiInModal(roomName, container);
    }
}

function initJitsiInModal(roomName, container) {
    const domain = 'meet.jit.si';
    const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: container,
        userInfo: {
            displayName: telemedCurrentUser?.fullName || 'Paciente'
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            defaultLanguage: 'es'
        },
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#1a1a2e',
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'chat', 'settings', 'raisehand',
                'videoquality', 'tileview'
            ],
            SETTINGS_SECTIONS: ['devices', 'language'],
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
        }
    };

    window.telemedJitsiApi = new JitsiMeetExternalAPI(domain, options);

    window.telemedJitsiApi.addEventListener('readyToClose', () => {
        telemedEndCall();
    });
}

async function telemedEndCall() {
    if (telemedCallDurationInterval) clearInterval(telemedCallDurationInterval);

    if (window.telemedJitsiApi) {
        window.telemedJitsiApi.dispose();
        window.telemedJitsiApi = null;
    }

    // Notify backend
    if (telemedSessionToken) {
        try {
            await fetch('/api/telemedicine/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'complete_call',
                    sessionToken: telemedSessionToken
                })
            });
        } catch (e) {
            console.log('Error notifying call completion:', e);
        }
    }

    telemedSessionToken = null;
    alert('¡Gracias por tu consulta! Esperamos haberte ayudado.');
    telemedBackToServices();
}


// ========== HOSPITAL DE DÍA FUNCTIONS ==========

function openHospitalDeDia() {
    // Open the HDD community portal
    window.location.href = '/hdd/';
}

async function registrarUsuarioTelemedicina(event) {
    event.preventDefault();
    const email = document.getElementById('tele-email').value;
    const phone = document.getElementById('tele-phone').value;

    try {
        const res = await fetch('/api/telemedicine/credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'register',
                email,
                phone
            })
        });

        const data = await res.json();
        if (data.success) {
            telemedUserId = data.userId;
            localStorage.setItem('telemedUserId', telemedUserId);
            checkTelemedicineUser();
            alert('Registro exitoso. Ya puedes usar el servicio de telemedicina.');
        } else {
            alert('Error en el registro. Por favor, intenta nuevamente.');
        }
    } catch (e) {
        alert('Servicio temporalmente no disponible.');
    }
}

// Pre-registro para telemedicina (lista de espera)
async function preregistrarTelemedicina(event) {
    event.preventDefault();
    const email = document.getElementById('preregistro-email').value;
    const mensajeEl = document.getElementById('preregistro-mensaje');

    try {
        // Guardar en tracking como evento genérico
        await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                eventType: 'telemedicina_preregistro',
                data: { email, timestamp: new Date().toISOString() }
            })
        });

        // Mostrar mensaje de éxito
        mensajeEl.textContent = '¡Listo! Te avisaremos cuando lancemos. Gracias por tu interés.';
        mensajeEl.style.display = 'block';
        mensajeEl.style.color = 'var(--accent-green)';
        document.getElementById('preregistro-email').value = '';

        // Guardar localmente
        localStorage.setItem('telemedPreregistro', email);
    } catch (e) {
        mensajeEl.textContent = 'Error al registrar. Por favor, intenta más tarde.';
        mensajeEl.style.display = 'block';
        mensajeEl.style.color = 'var(--accent-warm)';
    }
}

async function iniciarConsultaInmediata() {
    if (!telemedUserId) {
        alert('Primero debes registrarte para usar el servicio de telemedicina.');
        const registroDiv = document.getElementById('tele-registro');
        if (registroDiv) registroDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/telemedicine/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'request_call',
                userId: telemedUserId,
                callType: 'immediate'
            })
        });

        const data = await res.json();

        if (data.success) {
            alert(data.message);
            // Open video call using Jitsi Meet (free, no app needed)
            iniciarVideollamadaJitsi(data.sessionToken);
        } else if (data.error === 'outside_hours') {
            alert(`${data.message}\n\n${data.nextAvailable}`);
        } else if (data.error === 'user_not_found') {
            alert(data.message);
            const registroDiv = document.getElementById('tele-registro');
            if (registroDiv) registroDiv.style.display = 'block';
        }
    } catch (e) {
        alert('Error al conectar con el servicio. Por favor, intenta nuevamente.');
    }
}

function abrirAgendamiento() {
    if (!telemedUserId) {
        alert('Primero debes registrarte para usar el servicio de telemedicina.');
        const registroDiv = document.getElementById('tele-registro');
        if (registroDiv) registroDiv.style.display = 'block';
        return;
    }

    // Simple date/time picker - in production this would be a proper calendar
    const fecha = prompt('Ingresa la fecha deseada (YYYY-MM-DD):');
    if (!fecha) return;

    const hora = prompt('Ingresa la hora deseada (HH:MM, entre 08:00 y 20:00):');
    if (!hora) return;

    agendarConsulta(fecha, hora);
}

async function agendarConsulta(fecha, hora) {
    try {
        const res = await fetch('/api/telemedicine/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'schedule_call',
                userId: telemedUserId,
                scheduledDate: fecha,
                scheduledTime: hora
            })
        });

        const data = await res.json();

        if (data.success) {
            alert(`Cita agendada exitosamente.\n\nFecha y hora: ${new Date(data.scheduledAt).toLocaleString('es-AR')}`);
        } else if (data.error === 'user_not_found') {
            alert(data.message);
            const registroDiv = document.getElementById('tele-registro');
            if (registroDiv) registroDiv.style.display = 'block';
        }
    } catch (e) {
        alert('Error al agendar. Por favor, intenta nuevamente.');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initSession();
    updateMetrics();
});


// ========== JITSI MEET VIDEO CALL INTEGRATION ==========
// Jitsi is free, open-source, no app download needed, works in browser

function iniciarVideollamadaJitsi(sessionToken) {
    // Generate a unique room name using the session token
    const roomName = `ClinicaJoseIngenieros_${sessionToken.substring(0, 12)}`;
    const displayName = telemedUserId ? `Paciente_${telemedUserId}` : 'Paciente';

    // Create the video call container
    const videoModal = document.createElement('div');
    videoModal.id = 'video-call-modal';
    videoModal.innerHTML = `
        <div class="video-call-overlay">
            <div class="video-call-container">
                <div class="video-call-header">
                    <h3>Videoconsulta - Clínica José Ingenieros</h3>
                    <div class="video-call-status">
                        <span class="status-dot"></span>
                        <span id="video-status-text">Conectando...</span>
                    </div>
                    <button class="video-call-close" onclick="cerrarVideollamada('${sessionToken}')" title="Finalizar llamada">&times;</button>
                </div>
                <div class="video-call-body">
                    <div id="jitsi-container"></div>
                </div>
                <div class="video-call-footer">
                    <p><small>La videollamada utiliza Jitsi Meet (tecnología segura y cifrada). No se requiere descargar ninguna aplicación.</small></p>
                    <button class="btn btn-danger" onclick="cerrarVideollamada('${sessionToken}')">Finalizar Consulta</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(videoModal);

    // Load Jitsi Meet API
    if (!window.JitsiMeetExternalAPI) {
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.onload = () => cargarJitsi(roomName, displayName);
        document.head.appendChild(script);
    } else {
        cargarJitsi(roomName, displayName);
    }
}

function cargarJitsi(roomName, displayName) {
    const domain = 'meet.jit.si';
    const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: document.querySelector('#jitsi-container'),
        userInfo: {
            displayName: displayName
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            defaultLanguage: 'es'
        },
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#1a1a2e',
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'chat', 'settings', 'raisehand',
                'videoquality', 'tileview'
            ],
            SETTINGS_SECTIONS: ['devices', 'language'],
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
        }
    };

    const api = new JitsiMeetExternalAPI(domain, options);

    // Event handlers
    api.addEventListener('videoConferenceJoined', () => {
        const statusText = document.getElementById('video-status-text');
        if (statusText) {
            statusText.textContent = 'Conectado - Esperando al profesional';
            statusText.parentElement.classList.add('connected');
        }
    });

    api.addEventListener('participantJoined', (participant) => {
        const statusText = document.getElementById('video-status-text');
        if (statusText) {
            statusText.textContent = 'En consulta';
            statusText.parentElement.classList.add('in-call');
        }
    });

    api.addEventListener('readyToClose', () => {
        const modal = document.getElementById('video-call-modal');
        if (modal) modal.remove();
    });

    // Store API reference for cleanup
    window.jitsiApi = api;
}

async function cerrarVideollamada(sessionToken) {
    if (confirm('¿Deseas finalizar la videoconsulta?')) {
        // Dispose Jitsi
        if (window.jitsiApi) {
            window.jitsiApi.dispose();
            window.jitsiApi = null;
        }

        // Remove modal
        const modal = document.getElementById('video-call-modal');
        if (modal) modal.remove();

        // Notify backend that call ended
        try {
            await fetch('/api/telemedicine/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'complete_call',
                    sessionToken: sessionToken
                })
            });
            alert('Consulta finalizada. Gracias por usar nuestro servicio.');
        } catch (e) {
            console.log('Error notifying backend:', e);
        }
    }
}

// Function to test video call without backend (for development/demo)
function probarVideollamadaDemo() {
    const testToken = 'demo_' + Date.now().toString(36);
    iniciarVideollamadaJitsi(testToken);
}


// ========== PROFESSIONAL PANEL ==========

let professionalSession = localStorage.getItem('professionalSession');
let professionalData = null;
let queueRefreshInterval = null;

function openProfessionalLogin() {
    const panel = document.getElementById('professional-panel');
    panel.classList.add('active');

    // If already logged in, show dashboard
    if (professionalSession) {
        verifyProfessionalSession();
    }
}

function closeProfessionalPanel() {
    const panel = document.getElementById('professional-panel');
    panel.classList.remove('active');
}

function showRegisterForm() {
    document.querySelector('.login-form').style.display = 'none';
    document.getElementById('register-form-container').style.display = 'block';
    document.getElementById('verify-email-container').style.display = 'none';
    document.getElementById('forgot-password-container').style.display = 'none';
    document.getElementById('reset-password-container').style.display = 'none';
}

function showLoginForm() {
    document.querySelector('.login-form').style.display = 'block';
    document.getElementById('register-form-container').style.display = 'none';
    document.getElementById('verify-email-container').style.display = 'none';
    document.getElementById('forgot-password-container').style.display = 'none';
    document.getElementById('reset-password-container').style.display = 'none';
}

function showVerifyEmailForm(email) {
    document.querySelector('.login-form').style.display = 'none';
    document.getElementById('register-form-container').style.display = 'none';
    document.getElementById('verify-email-container').style.display = 'block';
    document.getElementById('forgot-password-container').style.display = 'none';
    document.getElementById('reset-password-container').style.display = 'none';
    document.getElementById('verify-email-hidden').value = email;
}

function showForgotPasswordForm() {
    document.querySelector('.login-form').style.display = 'none';
    document.getElementById('register-form-container').style.display = 'none';
    document.getElementById('verify-email-container').style.display = 'none';
    document.getElementById('forgot-password-container').style.display = 'block';
    document.getElementById('reset-password-container').style.display = 'none';
}

function showResetPasswordForm(email) {
    document.querySelector('.login-form').style.display = 'none';
    document.getElementById('register-form-container').style.display = 'none';
    document.getElementById('verify-email-container').style.display = 'none';
    document.getElementById('forgot-password-container').style.display = 'none';
    document.getElementById('reset-password-container').style.display = 'block';
    document.getElementById('reset-email-hidden').value = email;
}

async function requestPasswordReset(event) {
    event.preventDefault();

    const email = document.getElementById('forgot-email').value;
    const errorEl = document.getElementById('forgot-error');

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'request_password_reset',
                email
            })
        });

        const data = await res.json();

        if (data.success && data.canResetWithDni) {
            // Can reset with DNI - show reset form
            showResetPasswordForm(email);
            errorEl.classList.remove('visible');
        } else if (data.success && !data.canResetWithDni) {
            // Email not found or no DNI configured
            errorEl.textContent = data.message || 'No se puede recuperar la contraseña. Contactá al administrador.';
            errorEl.classList.add('visible');
        } else {
            errorEl.textContent = data.error || 'No se puede recuperar la contraseña. Contactá al administrador.';
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

async function resetPassword(event) {
    event.preventDefault();

    const email = document.getElementById('reset-email-hidden').value;
    const dniLast4 = document.getElementById('reset-dni-last4').value;
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-new-password-confirm').value;
    const errorEl = document.getElementById('reset-error');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        errorEl.textContent = 'Las contraseñas no coinciden';
        errorEl.classList.add('visible');
        return;
    }

    if (newPassword.length < 6) {
        errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
        errorEl.classList.add('visible');
        return;
    }

    if (!/^\d{4}$/.test(dniLast4)) {
        errorEl.textContent = 'Ingresá exactamente 4 dígitos del DNI';
        errorEl.classList.add('visible');
        return;
    }

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reset_password',
                email,
                dniLast4,
                newPassword
            })
        });

        const data = await res.json();

        if (data.success && data.sessionToken) {
            // Password reset successful, auto-login
            professionalSession = data.sessionToken;
            localStorage.setItem('professionalSession', professionalSession);

            showProfessionalDashboard();
            alert('Contraseña actualizada exitosamente. ¡Bienvenido!');
            errorEl.classList.remove('visible');
        } else {
            errorEl.textContent = data.error || 'Error al cambiar contraseña';
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

async function loginProfessional(event) {
    event.preventDefault();

    const email = document.getElementById('prof-email').value;
    const password = document.getElementById('prof-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                email,
                password
            })
        });

        const data = await res.json();

        if (data.success) {
            professionalSession = data.sessionToken;
            professionalData = data.professional;
            localStorage.setItem('professionalSession', professionalSession);

            showProfessionalDashboard();
            errorEl.classList.remove('visible');
        } else if (data.requiresVerification) {
            // Email not verified - show verification form
            showVerifyEmailForm(email);
            errorEl.classList.remove('visible');
        } else {
            errorEl.textContent = data.error || 'Error de autenticación';
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

async function registerProfessional(event) {
    event.preventDefault();

    const fullName = document.getElementById('reg-fullname').value;
    const email = document.getElementById('reg-email').value;
    const dni = document.getElementById('reg-dni').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-password-confirm').value;
    const specialty = document.getElementById('reg-specialty').value;
    const whatsapp = document.getElementById('reg-whatsapp').value;
    const errorEl = document.getElementById('register-error');

    // Validate passwords match
    if (password !== confirmPassword) {
        errorEl.textContent = 'Las contraseñas no coinciden';
        errorEl.classList.add('visible');
        return;
    }

    if (password.length < 6) {
        errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
        errorEl.classList.add('visible');
        return;
    }

    // Validate DNI if provided
    if (dni && !/^\d{7,8}$/.test(dni)) {
        errorEl.textContent = 'El DNI debe tener 7 u 8 dígitos';
        errorEl.classList.add('visible');
        return;
    }

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'register',
                fullName,
                email,
                dni: dni || null,
                password,
                specialty,
                whatsapp
            })
        });

        const data = await res.json();

        if (data.success && data.requiresVerification) {
            // Registration successful, but needs email verification
            showVerifyEmailForm(email);
            errorEl.classList.remove('visible');
            alert(data.message || 'Revisá tu email para el código de verificación.');
        } else if (data.success && data.sessionToken) {
            // Direct login (unlikely with new flow, but handle it)
            professionalSession = data.sessionToken;
            professionalData = data.professional;
            localStorage.setItem('professionalSession', professionalSession);

            showProfessionalDashboard();
            alert('Registro exitoso. ¡Bienvenido!');
        } else {
            errorEl.textContent = data.details ? `${data.error}: ${data.details}` : (data.error || 'Error en el registro');
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

async function verifyProfessionalEmail(event) {
    event.preventDefault();

    const code = document.getElementById('verify-code').value;
    const email = document.getElementById('verify-email-hidden').value;
    const errorEl = document.getElementById('verify-error');

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verify_email',
                email,
                code
            })
        });

        const data = await res.json();

        if (data.success) {
            professionalSession = data.sessionToken;
            localStorage.setItem('professionalSession', professionalSession);

            // Fetch professional data
            await verifyProfessionalSession();

            alert('¡Email verificado exitosamente! Ya podés acceder al sistema.');
            errorEl.classList.remove('visible');
        } else {
            errorEl.textContent = data.error || 'Código inválido';
            errorEl.classList.add('visible');
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.classList.add('visible');
    }
}

async function resendVerificationCode() {
    const email = document.getElementById('verify-email-hidden').value;
    if (!email) {
        alert('No hay un email para reenviar el código.');
        return;
    }

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'register',
                email,
                password: 'resend_placeholder',
                fullName: 'Resend'
            })
        });

        const data = await res.json();

        if (data.success || data.message) {
            alert('Se ha enviado un nuevo código a tu email.');
        } else {
            alert(data.error || 'No se pudo reenviar el código.');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

async function verifyProfessionalSession() {
    if (!professionalSession) return;

    try {
        const res = await fetch(`/api/professionals?action=verify&sessionToken=${professionalSession}`);
        const data = await res.json();

        if (data.valid) {
            professionalData = data.professional;
            showProfessionalDashboard();
        } else {
            // Session expired, clear it
            localStorage.removeItem('professionalSession');
            professionalSession = null;
            professionalData = null;
        }
    } catch (e) {
        console.log('Session verification failed');
    }
}

function showProfessionalDashboard() {
    document.getElementById('prof-login-view').style.display = 'none';
    document.getElementById('prof-dashboard-view').style.display = 'block';

    if (professionalData) {
        document.getElementById('prof-name').textContent = professionalData.fullName;

        // Update availability toggle
        const toggle = document.getElementById('availability-toggle');
        const indicator = document.getElementById('prof-status-indicator');
        const statusText = document.getElementById('prof-status-text');

        if (professionalData.isAvailable) {
            toggle.classList.add('active');
            indicator.classList.add('online');
            statusText.textContent = 'Disponible';
        } else {
            toggle.classList.remove('active');
            indicator.classList.remove('online');
            statusText.textContent = 'No disponible';
        }

        // Update notification checkboxes
        if (professionalData.notifications) {
            document.getElementById('notify-email-check').checked = professionalData.notifications.email;
            document.getElementById('notify-whatsapp-check').checked = professionalData.notifications.whatsapp;
        }
    }

    // Start refreshing call queue
    loadCallQueue();
    loadActiveCalls();
    queueRefreshInterval = setInterval(() => {
        loadCallQueue();
        loadActiveCalls();
    }, 10000); // Refresh every 10 seconds
}

async function logoutProfessional() {
    if (professionalSession) {
        try {
            await fetch('/api/professionals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'logout',
                    sessionToken: professionalSession
                })
            });
        } catch (e) {
            console.log('Logout notification failed');
        }
    }

    localStorage.removeItem('professionalSession');
    professionalSession = null;
    professionalData = null;

    if (queueRefreshInterval) {
        clearInterval(queueRefreshInterval);
        queueRefreshInterval = null;
    }

    document.getElementById('prof-login-view').style.display = 'block';
    document.getElementById('prof-dashboard-view').style.display = 'none';
}

async function toggleAvailability() {
    const toggle = document.getElementById('availability-toggle');
    const isAvailable = !toggle.classList.contains('active');

    try {
        const res = await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'toggle_availability',
                sessionToken: professionalSession,
                isAvailable
            })
        });

        const data = await res.json();

        if (data.success) {
            const indicator = document.getElementById('prof-status-indicator');
            const statusText = document.getElementById('prof-status-text');

            if (data.isAvailable) {
                toggle.classList.add('active');
                indicator.classList.add('online');
                statusText.textContent = 'Disponible';
            } else {
                toggle.classList.remove('active');
                indicator.classList.remove('online');
                statusText.textContent = 'No disponible';
            }

            if (professionalData) {
                professionalData.isAvailable = data.isAvailable;
            }
        }
    } catch (e) {
        console.log('Toggle availability failed');
    }
}

async function updateNotificationSettings() {
    const notifyEmail = document.getElementById('notify-email-check').checked;
    const notifyWhatsapp = document.getElementById('notify-whatsapp-check').checked;

    try {
        await fetch('/api/professionals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_notifications',
                sessionToken: professionalSession,
                notifyEmail,
                notifyWhatsapp
            })
        });
    } catch (e) {
        console.log('Update notifications failed');
    }
}

async function loadCallQueue() {
    try {
        const res = await fetch(`/api/call-queue?sessionToken=${professionalSession}&status=waiting`);
        const data = await res.json();

        const queueList = document.getElementById('call-queue-list');
        const queueCount = document.getElementById('queue-count');

        queueCount.textContent = data.waitingCount || 0;

        if (data.queue && data.queue.length > 0) {
            queueList.innerHTML = data.queue.map(call => {
                const waitTime = Math.floor((Date.now() - new Date(call.createdAt).getTime()) / 60000);
                return `
                    <div class="call-queue-item">
                        <div class="patient-info">
                            <span class="patient-name">${call.patientName || 'Paciente'}</span>
                            <span class="waiting-time">Esperando: ${waitTime} min</span>
                        </div>
                        <div class="actions">
                            <button class="btn-take-call" onclick="takeCall(${call.id})">Atender</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            queueList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No hay llamadas en espera</p>';
        }
    } catch (e) {
        console.log('Load queue failed');
    }
}

async function loadActiveCalls() {
    try {
        const res = await fetch(`/api/call-queue?sessionToken=${professionalSession}&status=assigned`);
        const data = await res.json();

        const activeList = document.getElementById('active-calls-list');

        if (data.queue && data.queue.length > 0) {
            activeList.innerHTML = data.queue.map(call => `
                <div class="call-queue-item" style="border-color: var(--accent-green);">
                    <div class="patient-info">
                        <span class="patient-name">${call.patientName || 'Paciente'}</span>
                        ${call.patientEmail ? `<br><small style="color: var(--text-secondary);">${call.patientEmail}</small>` : ''}
                    </div>
                    <div class="actions">
                        <button class="btn-take-call" onclick="joinCall('${call.roomName}', ${call.id})">Unirse</button>
                        <button class="btn-transfer" onclick="showTransferDialog(${call.id})">Derivar</button>
                        <button class="btn-end-call" onclick="completeCall(${call.id})" style="background: #dc3545; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Cortar</button>
                    </div>
                </div>
            `).join('');
        } else {
            activeList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Sin llamadas activas</p>';
        }
    } catch (e) {
        console.log('Load active calls failed');
    }
}

async function takeCall(queueId) {
    try {
        const res = await fetch('/api/call-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'take',
                sessionToken: professionalSession,
                queueId
            })
        });

        const data = await res.json();

        if (data.success) {
            // Join the video call with queueId for proper completion tracking
            joinCall(data.roomName, data.queueId);
            // Refresh the queue
            loadCallQueue();
            loadActiveCalls();
        } else {
            alert(data.error || 'No se pudo tomar la llamada');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

function joinCall(roomName, queueId) {
    // Store current call's queueId for later use
    window.currentCallQueueId = queueId;

    // Create the professional video call interface
    const videoModal = document.createElement('div');
    videoModal.id = 'video-call-modal';
    videoModal.innerHTML = `
        <div class="video-call-overlay">
            <div class="video-call-container">
                <div class="video-call-header">
                    <h3>Videoconsulta - Profesional</h3>
                    <div class="video-call-status">
                        <span class="status-dot"></span>
                        <span id="video-status-text">Conectando...</span>
                    </div>
                    <button class="video-call-close" onclick="endProfessionalCall('${roomName}', ${queueId})" title="Finalizar llamada">&times;</button>
                </div>
                <div class="video-call-body">
                    <div id="jitsi-container"></div>
                </div>
                <div class="video-call-footer">
                    <p><small>Sala: ${roomName}</small></p>
                    <button class="btn btn-danger" onclick="endProfessionalCall('${roomName}', ${queueId})">Finalizar Consulta</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(videoModal);

    // Load Jitsi
    if (!window.JitsiMeetExternalAPI) {
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.onload = () => loadJitsiForProfessional(roomName);
        document.head.appendChild(script);
    } else {
        loadJitsiForProfessional(roomName);
    }
}

function loadJitsiForProfessional(roomName) {
    const displayName = professionalData ? professionalData.fullName : 'Profesional';

    const options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: document.querySelector('#jitsi-container'),
        userInfo: {
            displayName: displayName
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            defaultLanguage: 'es'
        },
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#1a1a2e',
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'chat', 'settings', 'raisehand',
                'videoquality', 'tileview', 'recording'
            ],
            MOBILE_APP_PROMO: false
        }
    };

    const api = new JitsiMeetExternalAPI('meet.jit.si', options);

    api.addEventListener('videoConferenceJoined', () => {
        const statusText = document.getElementById('video-status-text');
        if (statusText) {
            statusText.textContent = 'En consulta';
            statusText.parentElement.classList.add('in-call');
        }
    });

    window.jitsiApi = api;
}

async function endProfessionalCall(roomName, queueId) {
    if (confirm('¿Deseas finalizar esta consulta?')) {
        if (window.jitsiApi) {
            window.jitsiApi.dispose();
            window.jitsiApi = null;
        }

        const modal = document.getElementById('video-call-modal');
        if (modal) modal.remove();

        // Mark call as completed in backend
        const callQueueId = queueId || window.currentCallQueueId;
        if (callQueueId && professionalSession) {
            try {
                await fetch('/api/call-queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'complete',
                        sessionToken: professionalSession,
                        queueId: callQueueId
                    })
                });
                window.currentCallQueueId = null;
            } catch (e) {
                console.log('Error completing call:', e);
            }
        }

        // Refresh lists
        loadCallQueue();
        loadActiveCalls();
    }
}

async function showTransferDialog(queueId) {
    // Get available professionals
    try {
        const res = await fetch('/api/professionals?action=available');
        const data = await res.json();

        if (data.professionals && data.professionals.length > 0) {
            const options = data.professionals
                .filter(p => p.id !== professionalData?.id)
                .map(p => `${p.id}: ${p.fullName} (${p.specialty})`);

            if (options.length === 0) {
                alert('No hay otros profesionales disponibles para derivar');
                return;
            }

            const selection = prompt(
                `Selecciona profesional para derivar:\n\n${options.join('\n')}\n\nIngresa el número ID:`
            );

            if (selection) {
                const targetId = parseInt(selection.split(':')[0]);
                const reason = prompt('Motivo de la derivación (opcional):');

                await transferCall(queueId, targetId, reason);
            }
        } else {
            alert('No hay profesionales disponibles para derivar');
        }
    } catch (e) {
        alert('Error al cargar profesionales');
    }
}

async function transferCall(queueId, targetProfessionalId, reason) {
    try {
        const res = await fetch('/api/call-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'transfer',
                sessionToken: professionalSession,
                queueId,
                targetProfessionalId,
                reason
            })
        });

        const data = await res.json();

        if (data.success) {
            alert(data.message);
            loadCallQueue();
            loadActiveCalls();
        } else {
            alert(data.error || 'Error al transferir');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

async function completeCall(queueId) {
    if (!confirm('¿Deseas cortar/finalizar esta llamada?')) {
        return;
    }

    try {
        const res = await fetch('/api/call-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'complete',
                sessionToken: professionalSession,
                queueId
            })
        });

        const data = await res.json();

        if (data.success) {
            alert('Llamada finalizada correctamente');
            loadCallQueue();
            loadActiveCalls();
        } else {
            alert(data.error || 'Error al finalizar la llamada');
        }
    } catch (e) {
        alert('Error de conexión');
    }
}

