import type { Roadmap, RoadmapEntry } from '../domain';

// 读端口。写端口随著述决策（Gate 开放问题 2）落地；路径与连接由宿主装配注入。
export type RoadmapBoard = {
  roadmap: Roadmap;
  entries: RoadmapEntry[];
};

export type RoadmapRepository = {
  listRoadmaps(): Promise<Roadmap[]>;
  listBoard(roadmapKey: string): Promise<RoadmapBoard | null>;
};
