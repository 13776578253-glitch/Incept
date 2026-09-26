-- RoadmapProject owns the two public project surfaces. Existing projects keep both enabled.
ALTER TABLE "roadmap_projects"
  ADD COLUMN "roadmapEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "atlasEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "roadmap_projects"
  ADD CONSTRAINT "roadmap_projects_at_least_one_surface_ck"
  CHECK ("roadmapEnabled" OR "atlasEnabled");
