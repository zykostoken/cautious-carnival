#!/bin/bash
# =============================================================================
# Setup Daily.co Rooms - Clínica José Ingenieros (HDD)
# =============================================================================
# Ejecutar: bash scripts/setup-daily-rooms.sh
# Requiere: curl, jq (sudo apt install jq)
# =============================================================================

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
API_KEY="4f445b633af78c2b797b01be09ac28dabe32824cb5509741d99c192932397887"
DAILY_API="https://api.daily.co/v1"

# ── Colores ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Daily.co Room Setup - Clínica José Ingenieros (HDD)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Verificar dependencias ──────────────────────────────────────────────────
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl no está instalado. Ejecutá: sudo apt install curl${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Advertencia: jq no está instalado. Instalando...${NC}"
    sudo apt install -y jq 2>/dev/null || {
        echo -e "${RED}No se pudo instalar jq. Ejecutá: sudo apt install jq${NC}"
        exit 1
    }
fi

# ── Verificar API Key ──────────────────────────────────────────────────────
echo -e "${YELLOW}Verificando API Key...${NC}"
VERIFY=$(curl -s -w "\n%{http_code}" "$DAILY_API/rooms" \
    -H "Authorization: Bearer $API_KEY" 2>&1)
HTTP_CODE=$(echo "$VERIFY" | tail -1)

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}Error: API Key inválida o expirada (HTTP $HTTP_CODE)${NC}"
    echo -e "${RED}Regenerá tu API Key en: https://dashboard.daily.co/developers${NC}"
    exit 1
fi
echo -e "${GREEN}API Key válida${NC}"
echo ""

# ── Función para crear sala ─────────────────────────────────────────────────
create_room() {
    local ROOM_NAME="$1"
    local MAX_PARTICIPANTS="$2"
    local DESCRIPTION="$3"
    local ENABLE_SCREENSHARE="$4"

    echo -e "${YELLOW}Creando sala: ${ROOM_NAME}...${NC}"

    # Verificar si ya existe
    CHECK=$(curl -s -w "\n%{http_code}" "$DAILY_API/rooms/$ROOM_NAME" \
        -H "Authorization: Bearer $API_KEY" 2>&1)
    CHECK_CODE=$(echo "$CHECK" | tail -1)

    if [ "$CHECK_CODE" = "200" ]; then
        echo -e "${GREEN}  ✓ Sala '$ROOM_NAME' ya existe - actualizando configuración...${NC}"

        # Actualizar configuración
        RESULT=$(curl -s -X POST "$DAILY_API/rooms/$ROOM_NAME" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "{
                \"privacy\": \"public\",
                \"properties\": {
                    \"max_participants\": $MAX_PARTICIPANTS,
                    \"enable_chat\": true,
                    \"enable_screenshare\": $ENABLE_SCREENSHARE,
                    \"start_video_off\": false,
                    \"start_audio_off\": true,
                    \"enable_people_ui\": true,
                    \"enable_pip_ui\": true,
                    \"enable_emoji_reactions\": true,
                    \"enable_hand_raising\": true,
                    \"enable_prejoin_ui\": true,
                    \"enable_network_ui\": true,
                    \"enable_noise_cancellation_ui\": true,
                    \"lang\": \"es\",
                    \"autojoin\": false,
                    \"enable_knocking\": true,
                    \"enable_recording\": \"local\"
                }
            }" 2>&1)

        URL=$(echo "$RESULT" | jq -r '.url // "error"')
        if [ "$URL" != "error" ] && [ "$URL" != "null" ]; then
            echo -e "${GREEN}  ✓ Actualizada: $URL${NC}"
        else
            echo -e "${RED}  ✗ Error actualizando: $(echo "$RESULT" | jq -r '.error // .info // "unknown"')${NC}"
        fi
        return
    fi

    # Crear sala nueva
    RESULT=$(curl -s -X POST "$DAILY_API/rooms" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$ROOM_NAME\",
            \"privacy\": \"public\",
            \"properties\": {
                \"max_participants\": $MAX_PARTICIPANTS,
                \"enable_chat\": true,
                \"enable_screenshare\": $ENABLE_SCREENSHARE,
                \"start_video_off\": false,
                \"start_audio_off\": true,
                \"enable_people_ui\": true,
                \"enable_pip_ui\": true,
                \"enable_emoji_reactions\": true,
                \"enable_hand_raising\": true,
                \"enable_prejoin_ui\": true,
                \"enable_network_ui\": true,
                \"enable_noise_cancellation_ui\": true,
                \"lang\": \"es\",
                \"autojoin\": false,
                \"enable_knocking\": true,
                \"enable_recording\": \"local\"
            }
        }" 2>&1)

    URL=$(echo "$RESULT" | jq -r '.url // "error"')
    if [ "$URL" != "error" ] && [ "$URL" != "null" ]; then
        echo -e "${GREEN}  ✓ Creada: $URL${NC}"
    else
        ERROR=$(echo "$RESULT" | jq -r '.error // .info // "unknown"')
        echo -e "${RED}  ✗ Error: $ERROR${NC}"
    fi
}

# ── Crear las 4 salas del HDD ──────────────────────────────────────────────
echo -e "${BLUE}── Creando salas del Hospital de Día ──${NC}"
echo ""

# Sala 1: Consulta Grupal (20 participantes)
# Sala principal para consultas grupales con pacientes del HDD
create_room "consulta-grupal" 20 "Consultas grupales HDD" "false"
echo ""

# Sala 2: Aula Virtual (30 participantes)
# Para clases, talleres educativos y presentaciones - screenshare habilitado
create_room "aula-virtual" 30 "Clases y talleres educativos" "true"
echo ""

# Sala 3: Terapia Grupal (15 participantes)
# Para sesiones de terapia grupal y mindfulness - más íntima
create_room "terapia-grupal" 15 "Terapia grupal y mindfulness" "false"
echo ""

# Sala 4: Sala Multimedia (25 participantes)
# Para compartir videos, películas y contenido multimedia - screenshare habilitado
create_room "sala-multimedia" 25 "Videos y contenido multimedia" "true"
echo ""

# ── Resumen ─────────────────────────────────────────────────────────────────
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Setup completado!${NC}"
echo ""
echo -e "Las salas están disponibles en:"
echo -e "  ${GREEN}https://zykos.daily.co/consulta-grupal${NC}    (20 personas)"
echo -e "  ${GREEN}https://zykos.daily.co/aula-virtual${NC}      (30 personas)"
echo -e "  ${GREEN}https://zykos.daily.co/terapia-grupal${NC}    (15 personas)"
echo -e "  ${GREEN}https://zykos.daily.co/sala-multimedia${NC}   (25 personas)"
echo ""
echo -e "${BLUE}Configuración aplicada a todas las salas:${NC}"
echo -e "  - Idioma: Español"
echo -e "  - Chat: Habilitado"
echo -e "  - Pre-join UI: Habilitado (lobby antes de entrar)"
echo -e "  - Knocking: Habilitado (pedir permiso para entrar)"
echo -e "  - Audio: Inicia muteado (para no molestar al entrar)"
echo -e "  - Video: Inicia encendido"
echo -e "  - Emojis y mano levantada: Habilitados"
echo -e "  - Cancelación de ruido: Habilitada"
echo -e "  - Grabación: Local (solo profesional puede iniciar)"
echo -e "  - Screenshare: Solo en Aula Virtual y Sala Multimedia"
echo ""
echo -e "${YELLOW}IMPORTANTE: Regenerá tu API Key en Daily.co si la compartiste.${NC}"
echo -e "${YELLOW}  https://dashboard.daily.co/developers${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
