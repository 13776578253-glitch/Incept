export type DocsImportMediaMode = 'validate' | 'publish';

export type DocsImportMediaOperation = {
  sourcePath: string;
  targetUrl: string;
  status: 'publish' | 'reuse';
  size: number;
};

export type DocsImportMediaResolution = {
  operations: DocsImportMediaOperation[];
};
