#!/bin/bash
cd ~/ai-backend
EMAIL="abcd@gmail.com"
PASSWORD="Neeraj@923456789"

echo "=== 1. Logging in via Assistant Auth ==="
LOGIN_RESP=$(curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
    TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
fi
if [ -z "$TOKEN" ]; then
    echo "❌ Login failed!"
    exit 1
fi
echo "✅ Login Successful via Assistant!"

echo "=== 2. Extracting User ID from Token (sub) ==="
TOKEN_PAYLOAD=$(echo "$TOKEN" | cut -d. -f2)
MOD=$((${#TOKEN_PAYLOAD} % 4))
if [ $MOD -ne 0 ]; then TOKEN_PAYLOAD="$TOKEN_PAYLOAD$(printf '=%.0s' $(seq 1 $((4 - MOD))))"; fi

# Yahan 'sub' check kar rahe hain kyunki JWT me User ID 'sub' me hoti hai
USER_ID=$(echo "$TOKEN_PAYLOAD" | base64 -d 2>/dev/null | grep -o '"sub":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    echo "❌ Token se User ID nahi mili."
    exit 1
fi
echo "✅ User ID Mili: $USER_ID"

echo "=== 3. Linking User to Anime DB (Project Insert) ==="
export $(grep -v '^#' .env | grep -E '^ANIME_' | xargs)
curl -s -X POST "$ANIME_SUPABASE_URL/rest/v1/projects" \
  -H "apikey: $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  -d "{\"id\":\"11111111-1111-4111-8111-111111111111\",\"user_id\":\"$USER_ID\",\"name\":\"My Anime Project\",\"is_active\":true,\"current_season\":1,\"current_episode\":1}"
echo "✅ Project successfully linked to your Assistant User ID!"

echo "=== 4. Testing Anime Command with your Token ==="
curl -s -X POST http://127.0.0.1:3000/v1/anime/commands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: sso-test-$(date +%s)" \
  -d '{"project_id":"11111111-1111-4111-8111-111111111111","intent":"CHECK_QUOTA","mode":"SAVE"}'

echo ""
echo "=== ALL DONE ==="
