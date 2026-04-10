import type {
  AnalogyMatch,
  AnalogyResult,
  ModelManifest,
  ParsedExpression,
  ProjectionBasis,
  TrailPoint,
  VocabPointMeta,
  Vector,
} from "./types";

export function magnitude(vector: Vector): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity(left: Vector, right: Vector): number {
  const denominator = magnitude(left) * magnitude(right);
  if (denominator === 0) {
    return 0;
  }

  const dotProduct = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return dotProduct / denominator;
}

export function addVectors(left: Vector, right: Vector): Vector {
  return left.map((value, index) => value + right[index]);
}

export function subtractVectors(left: Vector, right: Vector): Vector {
  return left.map((value, index) => value - right[index]);
}

export function averageVectors(vectors: Vector[]): Vector {
  if (vectors.length === 0) {
    return [];
  }

  const next = new Array(vectors[0].length).fill(0) as Vector;
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      next[index] += vector[index];
    }
  }

  return next.map((value) => value / vectors.length);
}

export function projectVector(vector: Vector, basis: ProjectionBasis): Pick<VocabPointMeta, "x" | "y"> {
  const x = vector.reduce((sum, value, index) => sum + value * (basis.x[index] ?? 0), 0) * 80;
  const y = vector.reduce((sum, value, index) => sum + value * (basis.y[index] ?? 0), 0) * -80;
  return { x, y };
}

export function parseExpression(expression: string): ParsedExpression {
  const compact = expression.trim().replace(/\s+/g, " ");
  if (!compact) {
    throw new Error("Enter an expression such as king - man + woman.");
  }

  const parts = compact.match(/[+-]?[^+-]+/g);
  if (!parts) {
    throw new Error("The expression could not be parsed.");
  }

  const positiveWords: string[] = [];
  const negativeWords: string[] = [];
  const tokens: TrailPoint[] = [];

  for (const rawPart of parts) {
    const operator = rawPart.startsWith("-") ? "-" : "+";
    const word = rawPart.replace(/^[+-]/, "").trim().toLowerCase();

    if (!word) {
      continue;
    }

    if (operator === "-") {
      negativeWords.push(word);
    } else {
      positiveWords.push(word);
    }

    tokens.push({
      x: 0,
      y: 0,
      label: word,
      operator: tokens.length === 0 ? "+" : operator,
    });
  }

  if (positiveWords.length === 0) {
    throw new Error("Add at least one positive word to compute the result.");
  }

  return { positiveWords, negativeWords, tokens };
}

export function buildAnalogyResult(args: {
  manifest: ModelManifest;
  expression: string;
  parsed: ParsedExpression;
  resultVector: Vector;
  matches: AnalogyMatch[];
  trailVectors: { label: string; operator: TrailPoint["operator"]; vector: Vector }[];
}): AnalogyResult {
  const trail: TrailPoint[] = args.trailVectors.map((entry) => ({
    ...projectVector(entry.vector, args.manifest.projectionBasis),
    label: entry.label,
    operator: entry.operator,
  }));

  return {
    expression: args.expression,
    positiveWords: args.parsed.positiveWords,
    negativeWords: args.parsed.negativeWords,
    matches: args.matches,
    resultVector: args.resultVector,
    resultProjection: projectVector(args.resultVector, args.manifest.projectionBasis),
    trail,
  };
}
