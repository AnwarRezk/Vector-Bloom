import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scoreSenses } from "../src/lib/contextual-meaning";
import type { ModelIndex, SenseCluster, VectorChunk, VocabPointMeta } from "../src/lib/types";
import { addVectors, cosineSimilarity, parseExpression, subtractVectors } from "../src/lib/vector-math";

const root = process.cwd();

function run(name: string, callback: () => void) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function readJson<T>(...segments: string[]): T {
  const file = path.join(root, ...segments);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function loadVectorMap() {
  const modelIndex = readJson<ModelIndex>("public", "data", "model-manifests.json");
  const manifest = modelIndex.models[0];
  const metadata = readJson<VocabPointMeta[]>("public", "data", "english-core-50k", "metadata.json");
  const vectorMap = new Map<number, number[]>();

  for (let chunkId = 0; chunkId < manifest.chunkCount; chunkId += 1) {
    const chunk = readJson<VectorChunk>(
      "public",
      "data",
      "english-core-50k",
      "chunks",
      `chunk-${chunkId}.json`,
    );
    chunk.wordIds.forEach((wordId, index) => {
      vectorMap.set(wordId, chunk.vectors[index]);
    });
  }

  return { manifest, metadata, vectorMap };
}

function computeTopWord(expression: string) {
  const { metadata, vectorMap } = loadVectorMap();
  const parsed = parseExpression(expression);
  const pointMap = new Map(metadata.map((point) => [point.word, point] as const));
  let result = new Array(vectorMap.get(0)!.length).fill(0);

  for (const token of parsed.tokens) {
    const point = pointMap.get(token.label)!;
    const vector = vectorMap.get(point.wordId)!;
    result = token.operator === "-" ? subtractVectors(result, vector) : addVectors(result, vector);
  }

  return metadata
    .map((point) => ({
      word: point.word,
      score: [...parsed.positiveWords, ...parsed.negativeWords].includes(point.word)
        ? -1
        : cosineSimilarity(result, vectorMap.get(point.wordId)!),
    }))
    .sort((left, right) => right.score - left.score)[0];
}

run("parses analogy expressions with plus and minus operators", () => {
  const parsed = parseExpression("king - man + woman");

  assert.deepEqual(parsed.positiveWords, ["king", "woman"]);
  assert.deepEqual(parsed.negativeWords, ["man"]);
});

run("ships a scaled 50k manifest", () => {
  const modelIndex = readJson<ModelIndex>("public", "data", "model-manifests.json");
  assert.equal(modelIndex.models[0]?.id, "english-core-50k");
  assert.equal(modelIndex.models[0]?.vocabSize, 50000);
  assert.equal(modelIndex.models[0]?.chunkCount, 10);
});

run("computes the classic royalty analogy from chunked vectors", () => {
  const result = computeTopWord("king - man + woman");
  assert.equal(result.word, "queen");
});

run("computes the geography analogy from chunked vectors", () => {
  const result = computeTopWord("paris - france + england");
  assert.equal(result.word, "london");
});

run("cosine similarity is 1 for identical vectors", () => {
  const score = cosineSimilarity([1, 2, 3], [1, 2, 3]);
  assert.equal(score, 1);
});

run("context scoring separates bank meanings by sentence clues", () => {
  const senses = readJson<SenseCluster[]>("public", "data", "english-core-50k", "senses.json");
  const financeRanking = scoreSenses("bank", ["deposit", "money", "loan", "bank"], senses);
  const riverRanking = scoreSenses("bank", ["river", "shore", "water", "bank"], senses);

  assert.equal(financeRanking[0]?.sense.senseId, "bank:finance");
  assert.equal(riverRanking[0]?.sense.senseId, "bank:river");
});

console.log("All scaled vocabulary checks passed.");
