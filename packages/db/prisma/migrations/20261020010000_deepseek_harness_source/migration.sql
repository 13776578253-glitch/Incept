-- Extend supported source capability; existing device authorizations remain unchanged.
ALTER TABLE "agent_devices" DROP CONSTRAINT "agent_devices_sources_check";
ALTER TABLE "agent_devices" ADD CONSTRAINT "agent_devices_sources_check"
  CHECK (cardinality("allowedSources") BETWEEN 1 AND 8
    AND "allowedSources" <@ ARRAY['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode','deepseekHarness']::TEXT[]);
