#!/bin/bash
cd ~/ai-backend

echo "=== 1. Auto-Patching Files ==="
cat > patch_script.js << 'JS'
const fs = require('fs');

// 1. Patch project-guard.ts
let pgPath = 'src/modules/anime/auth/project-guard.ts';
let pgContent = fs.readFileSync(pgPath, 'utf8');
if (!pgContent.includes('(request.user as any)?.sub')) {
    pgContent = pgContent.replace(
        "const authenticatedUserId = request.authContext?.userId;",
        "const authenticatedUserId = request.authContext?.userId || (request.user as any)?.sub || (request.user as any)?.id;"
    );
    fs.writeFileSync(pgPath, pgContent);
    console.log('✅ project-guard.ts fixed');
}

// 2. Patch commands.routes.ts
let crPath = 'src/modules/anime/commands/commands.routes.ts';
let crContent = fs.readFileSync(crPath, 'utf8');
if (!crContent.includes('(request.user as any)?.sub')) {
    // POST route fix
    crContent = crContent.replace(
        "const userId = request.anime?.user_id ?? request.authContext?.userId;",
        "const userId = request.anime?.user_id ?? request.authContext?.userId ?? (request.user as any)?.sub ?? (request.user as any)?.id;"
    );
    // GET route fix
    crContent = crContent.replace(
        "const userId = request.authContext?.userId;",
        "const userId = request.authContext?.userId || (request.user as any)?.sub || (request.user as any)?.id;"
    );
    fs.writeFileSync(crPath, crContent);
    console.log('✅ commands.routes.ts fixed');
}
JS
node patch_script.js
rm patch_script.js

echo ""
echo "=== 2. Docker Rebuild (Wait 15 sec) ==="
sudo docker build -t ec2-user-backend .

echo ""
echo "=== 3. Docker Restart ==="
sudo docker stop ai-backend && sudo docker rm ai-backend
sudo docker run -d --name ai-backend --restart unless-stopped --env-file .env -p 127.0.0.1:3000:3000 ec2-user-backend

echo ""
echo "=== 4. Waiting for server to start... ==="
sleep 5

echo ""
echo "=== 5. Running SSO Test ==="
bash test_sso.sh
