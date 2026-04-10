import type {
  ContextRequest,
  ContextResult,
  ContextTokenEmbedding,
  ModelManifest,
  SenseCluster,
  VocabPointMeta,
  Vector,
} from "./types";
import { averageVectors, cosineSimilarity, projectVector } from "./vector-math";

function tokenize(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildOverlay(args: {
  token: string;
  vector: Vector;
  interpretation: string;
  confidence: number;
  nearestStaticWords: string[];
  senseClusterId?: string;
  manifest: ModelManifest;
}): ContextTokenEmbedding {
  return {
    token: args.token,
    word: args.token,
    vector: args.vector,
    nearestStaticWords: args.nearestStaticWords,
    senseClusterId: args.senseClusterId,
    interpretation: args.interpretation,
    confidence: args.confidence,
    ...projectVector(args.vector, args.manifest.projectionBasis),
  };
}

export function scoreSenses(word: string, tokens: string[], senses: SenseCluster[]) {
  const candidates = senses.filter((sense) => sense.word === word);

  return candidates
    .map((sense) => {
      const hits = sense.keywords.reduce((score, keyword) => {
        return score + (tokens.includes(keyword) ? 1 : 0);
      }, 0);

      return {
        sense,
        score: hits,
      };
    })
    .sort((left, right) => right.score - left.score);
}

export function buildContextResult(args: {
  request: ContextRequest;
  manifest: ModelManifest;
  metadata: VocabPointMeta[];
  vectors: Map<number, Vector>;
  senses: SenseCluster[];
}): ContextResult {
  const tokens = tokenize(args.request.sentence);
  const token = tokens[args.request.targetTokenIndex];
  if (!token) {
    throw new Error("Select a valid token from the sentence.");
  }

  const pointMap = new Map(args.metadata.map((point) => [point.word, point] as const));
  const selectedPoint = pointMap.get(token);
  if (!selectedPoint) {
    throw new Error(`"${token}" is not available in the current vocabulary.`);
  }

  const senseRanking = scoreSenses(token, tokens, args.senses);
  const selectedVector = args.vectors.get(selectedPoint.wordId);
  if (!selectedVector) {
    throw new Error(`Vector data for "${token}" is still unavailable.`);
  }

  let overlay: ContextTokenEmbedding;

  if (senseRanking.length > 0 && senseRanking[0].score > 0) {
    const winner = senseRanking[0];
    const runnerUp = senseRanking[1];
    let vector = winner.sense.vector;
    let interpretation = winner.sense.label;
    let confidence = Math.min(0.98, 0.55 + winner.score * 0.12);

    if (runnerUp && runnerUp.score === winner.score && runnerUp.score > 0) {
      vector = averageVectors([winner.sense.vector, runnerUp.sense.vector]);
      interpretation = `${winner.sense.label} / ${runnerUp.sense.label}`;
      confidence = 0.5;
    }

    overlay = buildOverlay({
      token,
      vector,
      interpretation,
      confidence,
      nearestStaticWords: winner.sense.nearestStaticWords,
      senseClusterId: winner.sense.senseId,
      manifest: args.manifest,
    });
  } else {
    const contextVectors = tokens
      .filter((contextToken, index) => index !== args.request.targetTokenIndex)
      .map((contextToken) => pointMap.get(contextToken))
      .filter((point): point is VocabPointMeta => Boolean(point))
      .map((point) => args.vectors.get(point.wordId))
      .filter((vector): vector is Vector => Boolean(vector));

    const contextMean = contextVectors.length > 0 ? averageVectors(contextVectors) : selectedVector;
    const blended = selectedVector.map((value, index) => value * 0.72 + (contextMean[index] ?? 0) * 0.28);

    const ranked = args.metadata
      .map((point) => ({
        word: point.word,
        score: cosineSimilarity(blended, args.vectors.get(point.wordId) ?? []),
      }))
      .filter((entry) => entry.word !== token)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((entry) => entry.word);

    overlay = buildOverlay({
      token,
      vector: blended,
      interpretation: "Context-adjusted token meaning",
      confidence: contextVectors.length > 0 ? 0.62 : 0.38,
      nearestStaticWords: ranked,
      manifest: args.manifest,
    });
  }

  return {
    sentence: args.request.sentence,
    selectedWord: token,
    staticWord: selectedPoint.word,
    overlay,
    senses: args.senses.filter((sense) => sense.word === token),
  };
}

export function tokenizeSentence(sentence: string) {
  return tokenize(sentence);
}
