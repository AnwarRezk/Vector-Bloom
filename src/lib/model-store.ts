import type {
  ModelIndex,
  ModelManifest,
  SenseCluster,
  Vector,
  VectorChunk,
  VocabPointMeta,
} from "./types";

const indexUrl = "/data/model-manifests.json";

let indexPromise: Promise<ModelIndex> | null = null;
const metadataCache = new Map<string, Promise<VocabPointMeta[]>>();
const sensesCache = new Map<string, Promise<SenseCluster[]>>();
const chunkCache = new Map<string, Promise<VectorChunk>>();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }

  return (await response.json()) as T;
}

export function loadModelIndex(): Promise<ModelIndex> {
  indexPromise ??= fetchJson<ModelIndex>(indexUrl);
  return indexPromise;
}

export function loadMetadata(manifest: ModelManifest): Promise<VocabPointMeta[]> {
  const cacheKey = manifest.id;
  if (!metadataCache.has(cacheKey)) {
    metadataCache.set(cacheKey, fetchJson<VocabPointMeta[]>(manifest.metadataPath));
  }

  return metadataCache.get(cacheKey)!;
}

export function loadSenses(manifest: ModelManifest): Promise<SenseCluster[]> {
  const cacheKey = manifest.id;
  if (!sensesCache.has(cacheKey)) {
    sensesCache.set(cacheKey, fetchJson<SenseCluster[]>(manifest.sensesPath));
  }

  return sensesCache.get(cacheKey)!;
}

export function getChunkId(manifest: ModelManifest, wordId: number): number {
  return Math.floor(wordId / manifest.chunkSize);
}

export function loadChunk(manifest: ModelManifest, chunkId: number): Promise<VectorChunk> {
  const cacheKey = `${manifest.id}:${chunkId}`;
  if (!chunkCache.has(cacheKey)) {
    chunkCache.set(
      cacheKey,
      fetchJson<VectorChunk>(`${manifest.vectorsBasePath}/chunk-${chunkId}.json`),
    );
  }

  return chunkCache.get(cacheKey)!;
}

export async function loadVectorsByWordIds(
  manifest: ModelManifest,
  wordIds: number[],
): Promise<Map<number, Vector>> {
  const uniqueIds = Array.from(new Set(wordIds));
  const chunkIds = Array.from(new Set(uniqueIds.map((wordId) => getChunkId(manifest, wordId))));
  const chunks = await Promise.all(chunkIds.map((chunkId) => loadChunk(manifest, chunkId)));
  const vectorMap = new Map<number, Vector>();

  for (const chunk of chunks) {
    chunk.wordIds.forEach((wordId, index) => {
      vectorMap.set(wordId, chunk.vectors[index]);
    });
  }

  return vectorMap;
}

export async function collectAllVectors(manifest: ModelManifest): Promise<Map<number, Vector>> {
  const chunkIds = Array.from({ length: manifest.chunkCount }, (_, index) => index);
  const chunks = await Promise.all(chunkIds.map((chunkId) => loadChunk(manifest, chunkId)));
  const vectorMap = new Map<number, Vector>();

  for (const chunk of chunks) {
    chunk.wordIds.forEach((wordId, index) => {
      vectorMap.set(wordId, chunk.vectors[index]);
    });
  }

  return vectorMap;
}
