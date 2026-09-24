// API URL 合同（决策 10）：组件与脚本引用此常量，禁止散写端点路径
export const musicEndpoints = {
  catalog: '/api/music/tracks',
  tracks: '/api/internal/music/tracks',
  track: (trackKey: string) => `/api/internal/music/tracks/${encodeURIComponent(trackKey)}`,
  libraries: '/api/internal/music/libraries',
  library: (key: string) => `/api/internal/music/libraries/${encodeURIComponent(key)}`,
};
