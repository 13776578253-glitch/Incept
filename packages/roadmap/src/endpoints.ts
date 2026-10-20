// 内部 API 端点路由契约：统一收拢路径常量，禁止散落硬编码。
export const roadmapEndpoints = {
  projects: '/api/internal/roadmap/projects',
  project: (key: string) => `/api/internal/roadmap/projects/${encodeURIComponent(key)}`,
  entries: '/api/internal/roadmap/entries',
  entry: (key: string) => `/api/internal/roadmap/entries/${encodeURIComponent(key)}`,
  import: '/api/internal/roadmap/import',
};
