#!/usr/bin/env bash
#
# Doer IAM — Update Keycloak client redirect URIs for dummy frontend
#
set -euo pipefail

KC_HOST="${KC_HOST:-localhost}"
KC_PORT="${KC_PORT:-8080}"
KC_BASE="http://${KC_HOST}:${KC_PORT}"
REALM="doer"

# Auth service account credentials
CLIENT_ID="doer-auth-svc"
CLIENT_SECRET="${AUTH_SVC_SECRET:-BKvf27gj5wIIzWXsksHxdVHYJ5RqUV2q}"

FRONTEND_URL="http://localhost:5173"

echo "============================================"
echo " Doer IAM — Keycloak Client URI Setup"
echo "============================================"
echo ""

# Step 1: Get service account token
echo "── Getting service account token ──"
TOKEN=$(curl -s -X POST "${KC_BASE}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "  Token obtained"

# Step 2: Find doer-visa client
echo ""
echo "── Finding doer-visa client ──"
CLIENT_UUID=$(curl -s "${KC_BASE}/admin/realms/${REALM}/clients?clientId=doer-visa" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "  Client UUID: ${CLIENT_UUID}"

# Step 3: Get current client config
echo ""
echo "── Fetching current client config ──"
CLIENT_JSON=$(curl -s "${KC_BASE}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer ${TOKEN}")

# Step 4: Update redirect URIs and web origins
echo ""
echo "── Updating redirect URIs and web origins ──"
UPDATED_JSON=$(echo "$CLIENT_JSON" | python3 -c "
import sys, json

client = json.load(sys.stdin)

# Add frontend callback to redirect URIs if not present
redirect_uris = client.get('redirectUris', [])
callback_uri = '${FRONTEND_URL}/callback'
if callback_uri not in redirect_uris:
    redirect_uris.append(callback_uri)
    print(f'  Added {callback_uri} to redirectUris', file=sys.stderr)
else:
    print(f'  {callback_uri} already in redirectUris', file=sys.stderr)

# Also add wildcard for dev convenience
wildcard_uri = '${FRONTEND_URL}/*'
if wildcard_uri not in redirect_uris:
    redirect_uris.append(wildcard_uri)
    print(f'  Added {wildcard_uri} to redirectUris', file=sys.stderr)

client['redirectUris'] = redirect_uris

# Add frontend origin to web origins if not present
web_origins = client.get('webOrigins', [])
if '${FRONTEND_URL}' not in web_origins:
    web_origins.append('${FRONTEND_URL}')
    print(f'  Added ${FRONTEND_URL} to webOrigins', file=sys.stderr)
else:
    print(f'  ${FRONTEND_URL} already in webOrigins', file=sys.stderr)

client['webOrigins'] = web_origins

json.dump(client, sys.stdout)
")

# Step 5: PUT updated config
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${KC_BASE}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_JSON")

if [ "$RESP" = "204" ]; then
  echo "  [OK] Client updated successfully"
else
  echo "  [FAIL] HTTP ${RESP}"
fi

echo ""
echo "============================================"
echo " Done! doer-visa client URIs updated."
echo "============================================"
