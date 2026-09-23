// 路径装配端口：contentRoot（音频原件根，仓库之外）与 mirrorDirectory（内容寻址镜像）
// 由宿主/CLI 装配注入（决策 5）；包内不再解析仓库布局或读环境变量
export type MusicContentRootPort = {
  contentRoot: string;
};

export type MusicMirrorPort = {
  mirrorDirectory: string;
};

export type MusicPaths = MusicContentRootPort & MusicMirrorPort;
