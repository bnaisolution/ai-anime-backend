-- Curated AI model catalog, per-user model preferences and validated render profiles.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_id text NOT NULL,
  display_name text NOT NULL,
  capabilities text[] NOT NULL DEFAULT ARRAY['text']::text[],
  context_window integer NOT NULL DEFAULT 0,
  input_cost numeric(12,4) NOT NULL DEFAULT 0,
  output_cost numeric(12,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'beta', 'deprecated')),
  validated boolean NOT NULL DEFAULT false,
  min_plan text NOT NULL DEFAULT 'free',
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_model_catalog_provider_model_unique UNIQUE (provider, model_id)
);

CREATE TABLE IF NOT EXISTS public.user_model_preferences (
  user_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('primary', 'fallback', 'vision')),
  provider text NOT NULL,
  model_id text NOT NULL,
  render_profile text CHECK (render_profile IN ('FAST', 'STANDARD', 'HIGH')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS public.render_profiles (
  key text PRIMARY KEY CHECK (key IN ('FAST', 'STANDARD', 'HIGH')),
  label text NOT NULL,
  description text,
  gpu_bundle text[] NOT NULL DEFAULT '{}'::text[],
  cpu_preset text,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_model_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_model_catalog_read_all ON public.ai_model_catalog;
CREATE POLICY ai_model_catalog_read_all ON public.ai_model_catalog
  FOR SELECT USING (true);

DROP POLICY IF EXISTS render_profiles_read_all ON public.render_profiles;
CREATE POLICY render_profiles_read_all ON public.render_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_model_preferences_owner_select ON public.user_model_preferences;
CREATE POLICY user_model_preferences_owner_select ON public.user_model_preferences
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS user_model_preferences_owner_upsert ON public.user_model_preferences;
CREATE POLICY user_model_preferences_owner_upsert ON public.user_model_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS user_model_preferences_owner_update ON public.user_model_preferences;
CREATE POLICY user_model_preferences_owner_update ON public.user_model_preferences
  FOR UPDATE USING (auth.uid()::text = user_id);

REVOKE ALL ON public.ai_model_catalog FROM anon;
REVOKE ALL ON public.render_profiles FROM anon;
REVOKE ALL ON public.user_model_preferences FROM anon;
GRANT SELECT ON public.ai_model_catalog TO authenticated;
GRANT SELECT ON public.render_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_model_preferences TO authenticated;

INSERT INTO public.ai_model_catalog
  (provider, model_id, display_name, capabilities, context_window, input_cost, output_cost, status, validated, min_plan, notes)
VALUES
  ('groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B (Groq)', ARRAY['text','json'], 131072, 0.59, 0.79, 'active', true, 'free', NULL),
  ('groq', 'llama-3.1-8b-instant', 'Llama 3.1 8B Instant (Groq)', ARRAY['text','json'], 131072, 0.05, 0.08, 'active', true, 'free', NULL),
  ('gemini', 'gemini-2.0-flash', 'Gemini 2.0 Flash', ARRAY['text','vision','json'], 1048576, 0.10, 0.40, 'active', true, 'free', NULL),
  ('gemini', 'gemini-1.5-pro', 'Gemini 1.5 Pro', ARRAY['text','vision','json'], 2097152, 1.25, 5.00, 'active', true, 'pro', NULL),
  ('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', ARRAY['text','vision','json'], 1048576, 0.075, 0.30, 'active', true, 'free', NULL),
  ('openai_compatible', 'deepseek-chat', 'DeepSeek Chat (OpenAI-compatible)', ARRAY['text','json'], 65536, 0.27, 1.10, 'beta', false, 'pro', 'Requires your own OpenAI-compatible base URL and key.'),
  ('openai_compatible', 'openrouter/auto', 'OpenRouter Auto Router', ARRAY['text','json'], 131072, 0, 0, 'beta', false, 'pro', 'Routing and cost depend on the OpenRouter account.')
ON CONFLICT (provider, model_id) DO NOTHING;

INSERT INTO public.render_profiles (key, label, description, gpu_bundle, cpu_preset, enabled)
VALUES
  ('FAST', 'Fast Draft', 'Quick storyboard-grade output. SDXL-Lightning with light motion and short clips.', ARRAY['sdxl-lightning','animatediff-lightning'], 'ffmpeg-fast', true),
  ('STANDARD', 'Standard', 'Balanced quality for full episodes. SDXL + PuLID identity lock + AnimateDiff.', ARRAY['sdxl','pulid','animatediff'], 'ffmpeg-standard', true),
  ('HIGH', 'High Quality', 'Best quality. PuLID + AnimateDiff + LivePortrait + MuseTalk lip sync.', ARRAY['sdxl','pulid','animatediff','liveportrait','musetalk'], 'ffmpeg-high', true)
ON CONFLICT (key) DO NOTHING;
