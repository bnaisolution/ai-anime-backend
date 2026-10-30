#!/bin/bash
cd ~/ai-backend
export $(grep -v '^#' .env | grep -E '^ANIME_' | xargs)

echo "=== 1. Creating Test User ==="
USER_RESP=$(curl -s -X POST "$ANIME_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@bnai.com","password":"Test@1234","email_confirm":true}')

USER_ID=$(echo "$USER_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$USER_ID" ]; then
    echo "User already exists. Fetching ID..."
    USER_ID=$(curl -s "$ANIME_SUPABASE_URL/auth/v1/admin/users" -H "apikey: $ANIME_SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $ANIME_SUPABASE_SERVICE_ROLE_KEY" | grep -o '"id":"[^"]*","aud":"authenticated","role":"authenticated","email":"test@bnai.com"' | cut -d'"' -f4)
fi
echo "User ID: $USER_ID"

echo "=== 2. Creating Test Project ==="
curl -s -X POST "$ANIME_SUPABASE_URL/rest/v1/projects" \
  -H "apikey: $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $ANIME_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=ignore-duplicates,return=minimal" \
  -d "{\"id\":\"11111111-1111-4111-8111-111111111111\",\"user_id\":\"$USER_ID\",\"name\":\"Test Project\",\"is_active\":true,\"current_season\":1,\"current_episode\":1}"
echo " Project Inserted (or already existed)"

echo "=== 3. Logging in to Backend ==="
LOGIN_RESP=$(curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@bnai.com","password":"Test@1234"}')

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
    TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed! Response: $LOGIN_RESP"
    exit 1
fi
echo "✅ Login Successful."

echo "=== 4. Dispatching Anime Command ==="
curl -s -X POST http://127.0.0.1:3000/v1/anime/commands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: test-cmd-$(date +%s)" \
  -d '{"project_id":"11111111-1111-4111-8111-111111111111","intent":"CHECK_QUOTA","mode":"SAVE"}'
echo ""
echo "=== ALL DONE ==="
