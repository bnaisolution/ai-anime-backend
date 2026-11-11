import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export const PROJECT_TABLES = new Set([
  'projects', 'episodes', 'episode_states', 'scenes', 'clips', 'characters',
  'character_status', 'character_status_history', 'character_arcs',
  'character_reference_history', 'character_knowledge', 'character_relationships',
  'power_system', 'locations', 'artifacts', 'story_rules', 'story_timeline',
  'story_state_snapshots', 'canon_facts', 'bible_versions', 'mystery_tracker',
  'scene_library', 'motion_library', 'quota_usage', 'pending_actions',
  'episode_analytics', 'project_analytics_insights', 'audio_usage_log',
  'published_content', 'audit_log',
]);

export const GLOBAL_READ_TABLES = new Set(['voice_catalog', 'bgm_library', 'sfx_library', 'kaggle_sessions']);
export const SYSTEM_TABLES = new Set(['pending_actions', 'episode_states', 'audit_log']);
const PREFER_ALLOWLIST = new Set(['return=minimal', 'return=representation', 'resolution=merge-duplicates', 'resolution=ignore-duplicates']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH']);

function badRequest(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

function extractTable(path: string): string {
  if (!path.startsWith('/rest/v1/')) badRequest('Only /rest/v1/ paths are allowed.');
  if (path.includes('..') || path.includes('//')) badRequest('Invalid database path.');
  const table = path.slice('/rest/v1/'.length).split('?')[0].split('/')[0];
  if (!table || table === 'rpc') badRequest('Invalid database table.');
  return table;
}

function parseQuery(path: string): { base: string; params: URLSearchParams } {
  const question = path.indexOf('?');
  const base = question === -1 ? path : path.slice(0, question);
  const params = new URLSearchParams(question === -1 ? '' : path.slice(question + 1));
  return { base, params };
}

function enforceProjectFilter(params: URLSearchParams, projectId: string): void {
  const values = params.getAll('project_id');
  if (values.length > 1) badRequest('Multiple project_id filters are not allowed.');
  if (values.length === 1) {
    const expected = `eq.${projectId}`;
    if (values[0] !== expected) badRequest('Request project_id does not match the authenticated project.');
  } else {
    params.append('project_id', `eq.${projectId}`);
  }
  for (const compound of ['or', 'and', 'not']) {
    if (params.has(compound) && String(params.get(compound)).includes('project_id')) {
      badRequest('Compound filters may not override project scope.');
    }
  }
}

function injectProjectIntoBody(body: any, projectId: string, userId: string, table: string): any {
  if (body === undefined || body === null) return body;
  const inject = (row: any): any => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) badRequest('Database write body must be an object or array of objects.');
    if (row.project_id !== undefined && String(row.project_id) !== projectId) {
      badRequest('Write body project_id does not match the authenticated project.');
    }
    const next = { ...row, project_id: projectId };
    if (table === 'audit_log') {
      if (next.user_id !== undefined && String(next.user_id) !== userId) badRequest('Audit user_id does not match the authenticated user.');
      next.user_id = userId;
    }
    return next;
  };
  return Array.isArray(body) ? body.map(inject) : inject(body);
}

function validateWriteBody(body: any): any {
  const validate = (row: any): any => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) badRequest('Database write body must be an object or array of objects.');
    return row;
  };
  return Array.isArray(body) ? body.map(validate) : validate(body);
}

function sanitizePrefer(prefer: unknown): string | undefined {
  if (typeof prefer !== 'string' || !prefer.trim()) return undefined;
  const parts = prefer.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !PREFER_ALLOWLIST.has(part))) {
    badRequest('Unsupported Prefer header.');
  }
  return parts.join(', ');
}

export interface ScopedDbRequest {
  path: string;
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  prefer?: string;
  table: string;
}

export function buildScopedDbRequest(input: {
  path: string;
  method: string;
  body?: unknown;
  prefer?: unknown;
  project_id: string;
  user_id: string;
  system?: boolean;
}): ScopedDbRequest {
  const method = String(input.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) badRequest('Unsupported database method.');
  const table = extractTable(input.path);
  const isProject = PROJECT_TABLES.has(table);
  const isGlobal = GLOBAL_READ_TABLES.has(table);
  const isSystem = SYSTEM_TABLES.has(table);
  if (!isProject && !isGlobal && !isSystem) badRequest(`Database table ${table} is not allowed.`);
  if (input.system) {
    if (!isSystem) badRequest(`System workflows may not access ${table}.`);
  } else {
    if (isGlobal && method !== 'GET') badRequest('Global catalog tables are read-only.');
    if (!isProject && !isGlobal) badRequest(`Project workflows may not access ${table}.`);
  }

  const { base, params } = parseQuery(input.path);
  if (!input.system && isProject) enforceProjectFilter(params, input.project_id);
  const prefer = sanitizePrefer(input.prefer);
  let body = input.body;
  if (method !== 'GET') {
    if (body === undefined || body === null) badRequest('Database write body is required.');
    body = isProject ? injectProjectIntoBody(body, input.project_id, input.user_id, table) : validateWriteBody(body);
  } else {
    body = undefined;
  }
  const query = params.toString();
  return { path: query ? `${base}?${query}` : base, method: method as 'GET' | 'POST' | 'PATCH', body, prefer, table };
}
