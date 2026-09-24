// API URL 合同（music 决策 10 同款）：管理面板与脚本引用此常量，禁止散写端点路径。
// 列以 (roadmapKey, status) 为身份寻址（与写端口一致；DB 行 id 是实现细节）。
export const roadmapEndpoints = {
  roadmaps: '/api/internal/roadmap/roadmaps',
  roadmap: (key: string) => `/api/internal/roadmap/roadmaps/${encodeURIComponent(key)}`,
  columns: '/api/internal/roadmap/columns',
  column: (roadmapKey: string, status: string) =>
    `/api/internal/roadmap/columns/${encodeURIComponent(roadmapKey)}/${encodeURIComponent(status)}`,
  entries: '/api/internal/roadmap/entries',
  entry: (key: string) => `/api/internal/roadmap/entries/${encodeURIComponent(key)}`,
};
