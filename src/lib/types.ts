export type Vector = number[];

export type ProjectionBasis = {
  x: number[];
  y: number[];
};

export type ModelManifest = {
  id: string;
  name: string;
  description: string;
  language: string;
  accent: string;
  vectorDim: number;
  vocabSize: number;
  projectionVersion: string;
  chunkCount: number;
  chunkSize: number;
  hasContextMode: boolean;
  sampleExpressions: string[];
  metadataPath: string;
  vectorsBasePath: string;
  sensesPath: string;
  projectionBasis: ProjectionBasis;
};

export type VocabPointMeta = {
  wordId: number;
  word: string;
  x: number;
  y: number;
  frequency: number;
  clusterId: number;
  labelPriority: number;
};

export type VectorChunk = {
  chunkId: number;
  wordIds: number[];
  vectors: Vector[];
};

export type AnalogyMatch = {
  word: string;
  wordId: number;
  score: number;
};

export type TrailPoint = {
  x: number;
  y: number;
  label: string;
  operator: "+" | "-" | "=";
};

export type AnalogyResult = {
  expression: string;
  positiveWords: string[];
  negativeWords: string[];
  matches: AnalogyMatch[];
  resultVector: Vector;
  resultProjection: Pick<VocabPointMeta, "x" | "y">;
  trail: TrailPoint[];
};

export type ParsedExpression = {
  positiveWords: string[];
  negativeWords: string[];
  tokens: TrailPoint[];
};

export type SenseCluster = {
  word: string;
  senseId: string;
  label: string;
  x: number;
  y: number;
  vector: Vector;
  keywords: string[];
  exampleContexts: string[];
  nearestStaticWords: string[];
};

export type ContextRequest = {
  sentence: string;
  targetTokenIndex: number;
  modelId: string;
};

export type ContextTokenEmbedding = {
  token: string;
  word: string;
  x: number;
  y: number;
  vector?: Vector;
  nearestStaticWords: string[];
  senseClusterId?: string;
  interpretation: string;
  confidence: number;
};

export type ContextResult = {
  sentence: string;
  selectedWord: string;
  staticWord: string;
  overlay: ContextTokenEmbedding;
  senses: SenseCluster[];
};

export type ModelIndex = {
  models: ModelManifest[];
};
