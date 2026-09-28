import type { Roadmap, RoadmapEntry, RoadmapProject } from '../domain';

// 读端口契约：定义看板与项目读取接口，底层连接由宿主装配注入。
export type RoadmapBoard = {
  roadmap: Roadmap;
  entries: RoadmapEntry[];
};

export type RoadmapRepository = {
  listProjects(): Promise<RoadmapProject[]>;
  getProject(key: string): Promise<RoadmapProject | null>;
  listRoadmaps(): Promise<Roadmap[]>;
  listBoard(roadmapKey: string): Promise<RoadmapBoard | null>;
};
