#!/bin/bash
# ====================================================================
# SCRIPT PARA EJECUTAR DESDE TU MÁQUINA (WSL/Ubuntu)
# ====================================================================

echo "🚀 MEGA FIX HDD - Deployment Script"
echo "===================================="
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}PASO 1: Fetch y Checkout${NC}"
cd ~/zykostoken/cautious-carnival || exit 1
git fetch --all
git checkout mega-fix-hdd-complete
git log --oneline -6

echo ""
echo -e "${YELLOW}PASO 2: Push a GitHub${NC}"
git push origin mega-fix-hdd-complete

echo ""
echo -e "${GREEN}✅ Branch pushed!${NC}"
echo ""
echo "Ahora andá a GitHub y creá el PR:"
echo "👉 https://github.com/zykostoken/cautious-carnival/compare/mega-fix-hdd-complete?expand=1"
echo ""
echo -e "${YELLOW}PASO 3: SQL Migrations (ANTES de merge)${NC}"
echo "Ejecutá en Supabase SQL Editor:"
echo "1. sql/01_color_psychology.sql"
echo "2. sql/02_game_sessions.sql"
echo ""
echo -e "${YELLOW}PASO 4: Testing en Deploy Preview${NC}"
echo "Netlify creará deploy preview automáticamente"
echo ""
echo -e "${YELLOW}PASO 5: Fix SMTP${NC}"
echo "Netlify UI → ZOHO_SMTP_PASS = Npemb5ZNuFA8"
echo ""
echo -e "${YELLOW}PASO 6: Merge a main${NC}"
echo "Si todo OK, merge el PR"
echo ""
echo -e "${GREEN}DONE!${NC}"
