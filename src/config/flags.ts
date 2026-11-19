// Central feature-flag registry. Every flag is env-driven and safe by default:
// turning a flag off must restore the pre-change behaviour.

function boolFlag(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export const flags = {
  /** Capability registry drives Director actions, prompt catalog, risk and roles. */
  directorCapabilitiesV2: boolFlag('DIRECTOR_CAPABILITIES_V2', true),
  /** Readiness matrix exposed to Director, context and Android. */
  directorReadiness: boolFlag('DIRECTOR_READINESS', true),
  /** Production actions fail closed when a required BYOD resource is missing. */
  byodFailClosed: boolFlag('BYOD_FAIL_CLOSED', false),
  /** Direct commands must pass project setup/cast gates before production. */
  projectSetupGate: boolFlag('PROJECT_SETUP_GATE', true),
  /** Curated model catalog + render profiles. */
  modelCatalog: boolFlag('MODEL_CATALOG', false),
  /** Real publishing OAuth channels. */
  publishOauthV2: boolFlag('PUBLISH_OAUTH_V2', false),
  /** SaaS plans, billing and quota enforcement. */
  saasBilling: boolFlag('SAAS_BILLING', false),
} as const;

export type FeatureFlagName = keyof typeof flags;
