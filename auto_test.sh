#!/bin/bash
echo "Logging in automatically..."
LOGIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@example.com", "password":"Admin@12345"}')
TOKEN=$(echo $LOGIN_RES | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then echo "Login failed! Check password."; exit 1; fi
echo "Token fetched successfully. Running tests..."
API_URL="http://localhost:3000/api/ai"
HEADERS=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
echo -e "
[TEST 1 & 2: Chat + Prompt + Router]"
curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" -d '{"message": "Who are you?"}' | grep -q "reply" && echo "✅ Chat working (Router/Prompt OK)" || echo "❌ Failed"
echo -e "
[TEST 3: Quota RPM]"
for i in {1..5}; do
  RESP=$(curl -s -X POST "$API_URL/chat" "${HEADERS[@]}" -d '{"message": "spam"}')
  if echo "$RESP" | grep -q "Rate limit"; then echo "✅ Quota triggered at request $i"; break; fi
done
echo "Tests Complete!"
