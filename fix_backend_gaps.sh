#!/usr/bin/env bash
set -e

echo "=== Applying GAP #2: Adding 13+ Missing Read Endpoints to ai-anime-backend ==="

# 1. Create src/modules/anime/reads/lore.routes.ts with all 13 required routes + corrected character-status route
cat << 'EOF' > src/modules/anime/reads/lore.routes.ts
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const ProjParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});
const CharRefParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  cid: Type.String({ minLength: 1 }),
});

export async function registerAnimeLoreRoutes(app: FastifyInstance): Promise<void> {
  // 1. GET /v1/anime/projects/:id/quota
  app.get(
    '/v1/anime/projects/:id/quota',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { data, error } = await animeSupabase
        .from('quota_usage')
        .select('*')
        .eq('project_id', projectId)
        .gte('usage_date', yesterday)
        .order('usage_date', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch quota usage', cause: error });
      }
      const rows = data ?? [];
      return {
        data: {
          project_id: projectId,
          since_date: yesterday,
          records_count: rows.length,
          latest: rows[0] ?? null,
          items: rows,
        },
      };
    }
  );

  // 2. GET /v1/anime/projects/:id/continuity
  app.get(
    '/v1/anime/projects/:id/continuity',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('continuity_checks')
        .select('*')
        .eq('project_id', request.params.id)
        .order('checked_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch continuity checks', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 3. GET /v1/anime/projects/:id/retries
  app.get(
    '/v1/anime/projects/:id/retries',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('pending_actions')
        .select('*')
        .eq('project_id', request.params.id)
        .in('status', ['FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER'])
        .order('ready_at', { ascending: true });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch retries', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 4. GET /v1/anime/projects/:id/characters/:cid/reference-history
  app.get(
    '/v1/anime/projects/:id/characters/:cid/reference-history',
    { schema: { params: CharRefParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { id: projectId, cid } = request.params;
      const { data, error } = await animeSupabase
        .from('character_reference_history')
        .select('*')
        .eq('project_id', projectId)
        .eq('character_code', cid)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character reference history', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 5. GET /v1/anime/projects/:id/character-knowledge
  app.get(
    '/v1/anime/projects/:id/character-knowledge',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_knowledge')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character knowledge', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 6. GET /v1/anime/projects/:id/mysteries
  app.get(
    '/v1/anime/projects/:id/mysteries',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('mystery_tracker')
        .select('*')
        .eq('project_id', request.params.id)
        .in('status', ['OPEN', 'PARTIAL', 'ACTIVE']);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch mysteries', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 7. GET /v1/anime/projects/:id/arcs
  app.get(
    '/v1/anime/projects/:id/arcs',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_arcs')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character arcs', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 8. GET /v1/anime/projects/:id/powers
  app.get(
    '/v1/anime/projects/:id/powers',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('power_system')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch power system', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 9. GET /v1/anime/projects/:id/locations
  app.get(
    '/v1/anime/projects/:id/locations',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('locations')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch locations', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 10. GET /v1/anime/projects/:id/artifacts
  app.get(
    '/v1/anime/projects/:id/artifacts',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('artifacts')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch artifacts', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 11. GET /v1/anime/projects/:id/rules
  app.get(
    '/v1/anime/projects/:id/rules',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('story_rules')
        .select('*')
        .eq('project_id', request.params.id)
        .eq('active', true);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch story rules', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 12. GET /v1/anime/projects/:id/voices
  app.get(
    '/v1/anime/projects/:id/voices',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async () => {
      const { data, error } = await animeSupabase
        .from('voice_catalog')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch voice catalog', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 13. GET /v1/anime/projects/:id/foreshadowing
  app.get(
    '/v1/anime/projects/:id/foreshadowing',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('foreshadowing')
        .select('*')
        .eq('project_id', request.params.id)
        .eq('status', 'active');

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch foreshadowing', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 14. GET /v1/anime/projects/:id/character-status
  app.get(
    '/v1/anime/projects/:id/character-status',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_status')
        .select('*')
        .eq('project_id', request.params.id)
        .order('character_code', { ascending: true });

      if (error) {
        throw new AnimeError({
          code: AnimeErrorCode.INTERNAL,
          message: 'Failed to fetch character status',
          cause: error
        });
      }

      return { data: data ?? [] };
    }
  );
}
EOF

# 2. Safety Pre-Check & Append-Only Registration in src/modules/anime/reads/reads.routes.ts
READS_FILE="src/modules/anime/reads/reads.routes.ts"
cp "$READS_FILE" "/tmp/reads.routes.ts.bak.$(date +%s)"

APP_GET_COUNT=$(grep -c "^[[:space:]]*app\.get(" "$READS_FILE" || true)
LORE_ALREADY=$(grep -c "registerAnimeLoreRoutes" "$READS_FILE" || true)

if [ "$APP_GET_COUNT" != "9" ]; then
    echo "ABORT: reads.routes.ts has $APP_GET_COUNT app.get calls,"
    echo "expected 9. Do NOT overwrite. Inspect manually."
    echo "Backup saved to /tmp/reads.routes.ts.bak.*"
    exit 1
fi

if [ "$LORE_ALREADY" != "0" ]; then
    echo "ABORT: registerAnimeLoreRoutes already present in reads.routes.ts."
    echo "The route registration is already done — nothing to append."
    exit 0
fi

echo "SAFE: reads.routes.ts has exactly 9 app.get calls and no lore registration."
echo "Proceeding with append-only modification."

# Step B.1: Add the import line right after the last existing import
sed -i "s|import { listScenes } from './scenes.service';|import { listScenes } from './scenes.service';\nimport { registerAnimeLoreRoutes } from './lore.routes';|" "$READS_FILE"

# Step B.2: Add the registration call just before the closing brace of registerAnimeReadsRoutes
awk '
  { lines[NR] = $0 }
  END {
    for (i = NR; i >= 1; i--) {
      if (lines[i] ~ /^}$/) {
        for (j = 1; j < i; j++) print lines[j];
        print "  await registerAnimeLoreRoutes(app);";
        for (j = i; j <= NR; j++) print lines[j];
        exit;
      }
    }
    # fallback: no closing brace found
    for (j = 1; j <= NR; j++) print lines[j];
  }
' "$READS_FILE" > "$READS_FILE.new" && mv "$READS_FILE.new" "$READS_FILE"

echo "=== Verification ==="
grep -n "registerAnimeLoreRoutes" "$READS_FILE"

APP_GET_COUNT=$(grep -c "^[[:space:]]*app\.get(" "$READS_FILE")
echo "Total app.get calls in reads.routes.ts: $APP_GET_COUNT"

echo "Building backend TypeScript..."
npm run build
echo "✅ GAP #2 Backend build succeeded!"
