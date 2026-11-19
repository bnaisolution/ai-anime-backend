import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const MAX_ENTITY_ITEMS = 200;

export interface BibleEntities {
  characters: Array<Record<string, unknown>>;
  arcs: Array<Record<string, unknown>>;
  powers: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
}

export const EMPTY_BIBLE_ENTITIES: BibleEntities = {
  characters: [],
  arcs: [],
  powers: [],
  relationships: [],
  locations: [],
  artifacts: [],
  rules: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rows(value: unknown, normalize: (row: Record<string, unknown>) => Record<string, unknown> | null): Array<Record<string, unknown>> {
  return asArray(value)
    .slice(0, MAX_ENTITY_ITEMS)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map(normalize)
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

function compact(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

export function hasBibleEntities(entities: BibleEntities): boolean {
  return Object.values(entities).some((value) => Array.isArray(value) && value.length > 0);
}

export function normalizeBibleEntities(raw: unknown): BibleEntities {
  const source = asRecord(raw);
  if (!source) return { ...EMPTY_BIBLE_ENTITIES };
  return {
    characters: rows(source.characters, (row) => {
      const characterCode = asString(row.character_code);
      const name = asString(row.name);
      if (!characterCode || !name) return null;
      return compact({
        character_code: characterCode.toUpperCase(),
        name,
        description: asString(row.description) ?? undefined,
        age_group: asString(row.age) ?? asString(row.age_group) ?? undefined,
        initial_status: asString(row.initial_status) ?? undefined,
        visual_dna: asRecord(row.visual_dna) ?? {},
        voice_config: asRecord(row.voice_config) ?? {},
        powers_and_lore: asRecord(row.powers_and_lore) ?? { powers: [], inventory: [], relationships: [] },
        source: asString(row.source) ?? 'AI_WF01',
        validation_status: asString(row.validation_status) ?? 'PENDING',
        reference_version: asNumber(row.reference_version) ?? 1,
      });
    }),
    arcs: rows(source.arcs, (row) => {
      const characterCode = asString(row.character_code);
      const arcName = asString(row.arc_name);
      if (!characterCode || !arcName) return null;
      return compact({
        character_code: characterCode.toUpperCase(),
        arc_name: arcName,
        arc_type: asString(row.arc_type) ?? undefined,
        start_ep: asNumber(row.start_ep) ?? undefined,
        planned_end_ep: asNumber(row.planned_end_ep) ?? undefined,
        current_stage: asString(row.current_stage) ?? undefined,
        stages: asArray(row.stages),
        flaw: asString(row.flaw) ?? undefined,
        goal: asString(row.goal) ?? undefined,
        internal_conflict: asString(row.internal_conflict) ?? undefined,
        turning_points: asArray(row.turning_points),
        status: asString(row.status) ?? undefined,
      });
    }),
    powers: rows(source.powers, (row) => {
      const powerName = asString(row.power_name);
      if (!powerName) return null;
      return compact({
        character_code: asString(row.character_code)?.toUpperCase() ?? 'GLOBAL',
        power_name: powerName,
        power_level: asNumber(row.power_level) ?? 1,
        max_level: asNumber(row.max_level) ?? undefined,
        source: asString(row.source) ?? undefined,
        abilities: asArray(row.abilities),
        limitations: asArray(row.limitations),
        cost: asString(row.cost) ?? undefined,
        weakness: asString(row.weakness) ?? undefined,
        counter: asString(row.counter) ?? undefined,
        unlock_condition: asString(row.unlock_condition) ?? undefined,
        upgrade_path: asString(row.upgrade_path) ?? undefined,
        current_status: asString(row.current_status) ?? undefined,
        first_unlock_ep: asNumber(row.first_unlock_ep) ?? undefined,
      });
    }),
    relationships: rows(source.relationships, (row) => {
      const charACode = asString(row.char_a_code)?.toUpperCase();
      const charBCode = asString(row.char_b_code)?.toUpperCase();
      if (!charACode || !charBCode) return null;
      return compact({
        char_a_code: charACode,
        char_b_code: charBCode,
        relationship_type: asString(row.relationship_type) ?? undefined,
        relationship_status: asString(row.relationship_status) ?? undefined,
        trust_level: asNumber(row.trust_level) ?? 50,
        strength: asNumber(row.strength) ?? undefined,
        start_ep: asNumber(row.start_ep) ?? undefined,
        end_ep: asNumber(row.end_ep) ?? undefined,
        secret_info: asRecord(row.secret_info) ?? undefined,
        what_a_knows: asArray(row.what_a_knows),
        what_b_knows: asArray(row.what_b_knows),
        history: asArray(row.history),
      });
    }),
    locations: rows(source.locations, (row) => {
      const locationCode = asString(row.location_code);
      const name = asString(row.name);
      if (!locationCode || !name) return null;
      return compact({
        location_code: locationCode.toUpperCase(),
        name,
        parent_world: asString(row.parent_world) ?? undefined,
        location_type: asString(row.location_type) ?? undefined,
        description: asString(row.description) ?? undefined,
        history: asString(row.history) ?? undefined,
        geography: asString(row.geography) ?? undefined,
        climate: asString(row.climate) ?? undefined,
        political_control: asString(row.political_control) ?? undefined,
        landmarks: asArray(row.landmarks),
        rules: asArray(row.rules),
        danger_level: asNumber(row.danger_level) ?? undefined,
        visual_description: asString(row.visual_description) ?? undefined,
        current_status: asString(row.current_status) ?? undefined,
      });
    }),
    artifacts: rows(source.artifacts, (row) => {
      const artifactCode = asString(row.artifact_code);
      const name = asString(row.name);
      if (!artifactCode || !name) return null;
      return compact({
        artifact_code: artifactCode.toUpperCase(),
        name,
        artifact_type: asString(row.artifact_type) ?? undefined,
        origin: asString(row.origin) ?? undefined,
        history: asString(row.history) ?? undefined,
        powers: asArray(row.powers),
        limitations: asArray(row.limitations),
        weakness: asString(row.weakness) ?? undefined,
        current_owner_code: asString(row.current_owner_code) ?? asString(row.owner)?.toUpperCase() ?? undefined,
        current_location: asString(row.current_location) ?? undefined,
        current_status: asString(row.current_status) ?? undefined,
        visual_reference: asString(row.visual_reference) ?? undefined,
      });
    }),
    rules: rows(source.rules, (row) => {
      const ruleCode = asString(row.rule_code);
      const ruleText = asString(row.rule_text);
      if (!ruleCode || !ruleText) return null;
      return compact({
        rule_code: ruleCode.toUpperCase(),
        rule_text: ruleText,
        rule_type: asString(row.rule_type) ?? undefined,
        priority: row.priority === undefined || row.priority === null ? 'high' : String(row.priority),
        tags: asArray(row.tags),
        active: row.active === undefined ? true : Boolean(row.active),
      });
    }),
  };
}

async function upsertRows(table: string, rowsToWrite: Array<Record<string, unknown>>, onConflict: string): Promise<number> {
  if (rowsToWrite.length === 0) return 0;
  const { error } = await animeSupabase.from(table).upsert(rowsToWrite, { onConflict });
  if (error) {
    throw new AnimeError({
      code: AnimeErrorCode.INTERNAL,
      message: `Failed to persist Bible entities in ${table}.`,
      cause: error,
    });
  }
  return rowsToWrite.length;
}

async function existingCodes(table: string, projectId: string, column: string, codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const { data, error } = await animeSupabase
    .from(table)
    .select(column)
    .eq('project_id', projectId)
    .in(column, codes);
  if (error) {
    throw new AnimeError({
      code: AnimeErrorCode.INTERNAL,
      message: `Failed to validate Bible references in ${table}.`,
      cause: error,
    });
  }
  return new Set(((data || []) as unknown as Record<string, unknown>[])
    .map((row) => asString(row[column])?.toUpperCase())
    .filter((code): code is string => Boolean(code)));
}

export async function validateBibleEntities(projectId: string, entities: BibleEntities): Promise<void> {
  const duplicateGroups = [
    ['characters', 'character_code'],
    ['arcs', 'character_code,arc_name'],
    ['powers', 'character_code,power_name'],
    ['relationships', 'char_a_code,char_b_code'],
    ['locations', 'location_code'],
    ['artifacts', 'artifact_code'],
    ['rules', 'rule_code'],
  ] as const;
  for (const [group, keyList] of duplicateGroups) {
    const keys = keyList.split(',');
    const composite = entities[group].map((row) => keys.map((key) => asString(row[key])?.toUpperCase() || '').join('|'));
    const seen = new Set<string>();
    const duplicate = composite.find((value) => {
      if (!value.replaceAll('|', '')) return false;
      if (seen.has(value)) return true;
      seen.add(value);
      return false;
    });
    if (duplicate) {
      throw new AnimeError({
        code: AnimeErrorCode.OUTPUT_INVALID,
        message: `Duplicate Bible entity in ${group}: ${duplicate.replaceAll('|', ' / ')}`,
      });
    }
  }

  const patchCharacters = new Set(entities.characters
    .map((row) => asString(row.character_code)?.toUpperCase())
    .filter((code): code is string => Boolean(code)));
  const referencedCharacters = new Set<string>();
  for (const row of [...entities.arcs, ...entities.powers]) {
    const code = asString(row.character_code)?.toUpperCase();
    if (code && code !== 'GLOBAL') referencedCharacters.add(code);
  }
  for (const row of entities.relationships) {
    const a = asString(row.char_a_code)?.toUpperCase();
    const b = asString(row.char_b_code)?.toUpperCase();
    if (a) referencedCharacters.add(a);
    if (b) referencedCharacters.add(b);
  }
  const existingCharacters = await existingCodes(
    'characters',
    projectId,
    'character_code',
    [...referencedCharacters].filter((code) => !patchCharacters.has(code))
  );
  const missingCharacters = [...referencedCharacters]
    .filter((code) => !patchCharacters.has(code) && !existingCharacters.has(code));
  if (missingCharacters.length > 0) {
    throw new AnimeError({
      code: AnimeErrorCode.OUTPUT_INVALID,
      message: `Bible references unknown characters: ${missingCharacters.join(', ')}`,
    });
  }

  const patchLocations = new Set(entities.locations
    .map((row) => asString(row.location_code)?.toUpperCase())
    .filter((code): code is string => Boolean(code)));
  const referencedLocations = new Set(entities.artifacts
    .map((row) => asString(row.current_location)?.toUpperCase())
    .filter((code): code is string => Boolean(code) && /^LOC_[A-Z0-9_]+$/.test(code!)));
  const existingLocations = await existingCodes(
    'locations',
    projectId,
    'location_code',
    [...referencedLocations].filter((code) => !patchLocations.has(code))
  );
  const missingLocations = [...referencedLocations]
    .filter((code) => !patchLocations.has(code) && !existingLocations.has(code));
  if (missingLocations.length > 0) {
    throw new AnimeError({
      code: AnimeErrorCode.OUTPUT_INVALID,
      message: `Bible artifacts reference unknown locations: ${missingLocations.join(', ')}`,
    });
  }
}

export async function applyBibleEntities(projectId: string, entities: BibleEntities): Promise<Record<string, number>> {
  const withProject = (rowsToWrite: Array<Record<string, unknown>>) => rowsToWrite.map((row) => ({ ...row, project_id: projectId }));
  const counts: Record<string, number> = {};
  counts.characters = await upsertRows('characters', withProject(entities.characters), 'project_id,character_code');
  counts.arcs = await upsertRows('character_arcs', withProject(entities.arcs), 'project_id,character_code,arc_name');
  counts.powers = await upsertRows('power_system', withProject(entities.powers), 'project_id,character_code,power_name');
  counts.relationships = await upsertRows('character_relationships', withProject(entities.relationships), 'project_id,char_a_code,char_b_code');
  counts.locations = await upsertRows('locations', withProject(entities.locations), 'project_id,location_code');
  counts.artifacts = await upsertRows('artifacts', withProject(entities.artifacts), 'project_id,artifact_code');
  counts.rules = await upsertRows('story_rules', withProject(entities.rules), 'project_id,rule_code');
  return counts;
}
