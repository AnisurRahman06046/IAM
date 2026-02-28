#!/usr/bin/env bash
#
# Doer IAM — Build and deploy Keycloakify theme to Keycloak
#
set -euo pipefail

THEME_DIR="${THEME_DIR:-$(dirname "$0")/../themes/keycloakify}"
KC_DIR="${KC_DIR:-$(dirname "$0")/../keycloak-26.5.4}"
JAR_NAME="doer-themes.jar"

echo "============================================"
echo " Doer IAM — Theme Deploy"
echo "============================================"
echo ""
echo "Theme dir  : $THEME_DIR"
echo "Keycloak   : $KC_DIR"
echo ""

# Step 1: Build theme
echo "── Building theme JAR ──"
cd "$THEME_DIR"
export PATH="$HOME/.local/bin:$PATH"
npm run build-keycloak-theme
echo ""

# Step 2: Copy to providers
echo "── Deploying to Keycloak ──"
cp dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar "$KC_DIR/providers/$JAR_NAME"
echo "  Copied JAR to $KC_DIR/providers/$JAR_NAME"
echo ""

# Step 3: Rebuild Keycloak
echo "── Rebuilding Keycloak ──"
"$KC_DIR/bin/kc.sh" build 2>&1 | grep -E "completed|ERROR" || true
echo ""

echo "============================================"
echo " Theme deployed! Restart Keycloak to apply."
echo "============================================"
