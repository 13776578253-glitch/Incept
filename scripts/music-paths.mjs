// 音乐镜像目录的唯一定义（验收 C6）：仓库布局知识留宿主/根侧（决策 13），包内不解析布局（决策 5）
// 消费者：Web 装配（apps/web/src/server/music/assembly.ts）与两支 CLI 转发脚本
import path from 'node:path';

export function musicMirrorDirectory(projectRoot) {
  return path.join(projectRoot, 'apps', 'web', 'public', '_music-media');
}
