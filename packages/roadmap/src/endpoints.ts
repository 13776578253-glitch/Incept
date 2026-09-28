// 内部 API 端点路由契约：统一收拢路径常量，禁止散落硬编码。
// 列以 (roadmapKey, status) 为唯一定位凭据。
export const roadmapEndpoints = {
  projects: '/api/internal/roadmap/projects',
  project: (key: string) => `/api/internal/roadmap/projects/${encodeURIComponent(key)}`,
  roadmaps: '/api/internal/roadmap/roadmaps',
  roadmap: (key: string) => `/api/internal/roadmap/roadmaps/${encodeURIComponent(key)}`,
  columns: '/api/internal/roadmap/columns',
  column: (roadmapKey: string, status: string) =>
    `/api/internal/roadmap/columns/${encodeURIComponent(roadmapKey)}/${encodeURIComponent(status)}`,
  entries: '/api/internal/roadmap/entries',
  entry: (key: string) => `/api/internal/roadmap/entries/${encodeURIComponent(key)}`,
  import: '/api/internal/roadmap/import',
};
