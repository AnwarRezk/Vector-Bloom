"use client";

import { useEffect, useMemo, useState } from "react";
import { EmbeddingCanvas } from "@/components/embedding-canvas";
import { buildContextResult, tokenizeSentence } from "@/lib/contextual-meaning";
import {
  collectAllVectors,
  loadMetadata,
  loadModelIndex,
  loadSenses,
  loadVectorsByWordIds,
} from "@/lib/model-store";
import type {
  AnalogyMatch,
  AnalogyResult,
  ContextResult,
  ModelManifest,
  SenseCluster,
  VocabPointMeta,
} from "@/lib/types";
import {
  addVectors,
  buildAnalogyResult,
  cosineSimilarity,
  parseExpression,
  subtractVectors,
} from "@/lib/vector-math";

type Mode = "static" | "context";

const sampleSentences = [
  "I deposited money in the bank before applying for a loan.",
  "We sat on the river bank and watched the water move downstream.",
  "Apple improved the software on the iPhone and Mac this year.",
  "The python package made the code easier to maintain.",
];

function formatPercent(value: number) {
  return `${Math.max(0, value * 100).toFixed(1)}%`;
}

export function Word2VecApp() {
  const [manifests, setManifests] = useState<ModelManifest[]>([]);
  const [activeModelId, setActiveModelId] = useState("");
  const [metadata, setMetadata] = useState<VocabPointMeta[]>([]);
  const [senses, setSenses] = useState<SenseCluster[]>([]);
  const [mode, setMode] = useState<Mode>("static");
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [expression, setExpression] = useState("king - man + woman");
  const [arithmetic, setArithmetic] = useState<AnalogyResult | null>(null);
  const [neighbors, setNeighbors] = useState<AnalogyMatch[]>([]);
  const [contextSentence, setContextSentence] = useState(sampleSentences[0]);
  const [contextTokenIndex, setContextTokenIndex] = useState(5);
  const [contextResult, setContextResult] = useState<ContextResult | null>(null);
  const [status, setStatus] = useState("Loading model manifest...");
  const [error, setError] = useState<string | null>(null);

  const activeManifest = manifests.find((manifest) => manifest.id === activeModelId) ?? manifests[0] ?? null;

  useEffect(() => {
    async function loadIndex() {
      try {
        const index = await loadModelIndex();
        setManifests(index.models);
        setActiveModelId(index.models[0]?.id ?? "");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load the model index.");
      }
    }

    void loadIndex();
  }, []);

  useEffect(() => {
    if (!activeManifest) {
      return;
    }

    async function loadActiveAssets() {
      setStatus("Loading metadata and sense overlays...");
      setError(null);

      try {
        const [nextMetadata, nextSenses] = await Promise.all([
          loadMetadata(activeManifest),
          loadSenses(activeManifest),
        ]);
        setMetadata(nextMetadata);
        setSenses(nextSenses);
        setSelectedWord(nextMetadata[0]?.word ?? null);
        setHoveredWord(null);
        setArithmetic(null);
        setNeighbors([]);
        setContextResult(null);
        setStatus(`Loaded ${activeManifest.vocabSize.toLocaleString()} words.`);
        setExpression(activeManifest.sampleExpressions[0] ?? "king - man + woman");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load model assets.");
      }
    }

    void loadActiveAssets();
  }, [activeManifest]);

  const pointMap = useMemo(
    () => new Map(metadata.map((point) => [point.word, point] as const)),
    [metadata],
  );

  const focusPoint =
    metadata.find((point) => point.word === hoveredWord) ??
    metadata.find((point) => point.word === selectedWord) ??
    null;

  const tokens = useMemo(() => tokenizeSentence(contextSentence), [contextSentence]);

  useEffect(() => {
    if (!activeManifest || !focusPoint) {
      setNeighbors([]);
      return;
    }

    const stableFocusPoint = focusPoint;

    async function loadNeighborsForWord() {
      try {
        const allVectors = await collectAllVectors(activeManifest);
        const focusVector = allVectors.get(stableFocusPoint.wordId);
        if (!focusVector) {
          return;
        }

        const nextNeighbors = metadata
          .map((point) => {
            const vector = allVectors.get(point.wordId);
            return {
              word: point.word,
              wordId: point.wordId,
              score: point.word === stableFocusPoint.word || !vector ? -1 : cosineSimilarity(focusVector, vector),
            };
          })
          .filter((match) => match.score >= 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 5);

        setNeighbors(nextNeighbors);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to compute nearest neighbors.");
      }
    }

    void loadNeighborsForWord();
  }, [activeManifest, focusPoint, metadata]);

  const highlightWords = Array.from(
    new Set([
      ...(focusPoint ? [focusPoint.word] : []),
      ...neighbors.map((match) => match.word),
      ...(arithmetic?.positiveWords ?? []),
      ...(arithmetic?.negativeWords ?? []),
      ...(arithmetic?.matches.map((match) => match.word) ?? []),
      ...(contextResult?.overlay.nearestStaticWords ?? []),
      ...(contextResult?.selectedWord ? [contextResult.selectedWord] : []),
    ]),
  );

  async function runExpression(nextExpression = expression) {
    if (!activeManifest) {
      return;
    }

    setStatus("Loading vector chunks for arithmetic...");
    setError(null);

    try {
      const parsed = parseExpression(nextExpression);
      const inputWords = [...parsed.positiveWords, ...parsed.negativeWords];
      const inputPoints = inputWords.map((word) => pointMap.get(word)).filter((point): point is VocabPointMeta => Boolean(point));

      if (inputPoints.length !== inputWords.length) {
        const missing = inputWords.filter((word) => !pointMap.has(word));
        throw new Error(`Missing words: ${missing.join(", ")}`);
      }

      const allVectors = await collectAllVectors(activeManifest);
      let resultVector = new Array(activeManifest.vectorDim).fill(0);
      const trailVectors: {
        label: string;
        operator: "+" | "-" | "=";
        vector: number[];
      }[] = [{ label: "origin", operator: "=", vector: [...resultVector] }];

      for (const token of parsed.tokens) {
        const point = pointMap.get(token.label);
        if (!point) {
          continue;
        }
        const vector = allVectors.get(point.wordId);
        if (!vector) {
          continue;
        }

        resultVector =
          token.operator === "-"
            ? subtractVectors(resultVector, vector)
            : addVectors(resultVector, vector);
        trailVectors.push({
          label: token.label,
          operator: token.operator,
          vector: [...resultVector],
        });
      }

      const matches = metadata
        .map((point) => ({
          word: point.word,
          wordId: point.wordId,
          score: inputWords.includes(point.word)
            ? -1
            : cosineSimilarity(resultVector, allVectors.get(point.wordId) ?? []),
        }))
        .filter((match) => match.score >= 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 6);

      const result = buildAnalogyResult({
        manifest: activeManifest,
        expression: nextExpression,
        parsed,
        resultVector,
        matches,
        trailVectors,
      });

      setArithmetic(result);
      setSelectedWord(matches[0]?.word ?? selectedWord);
      setStatus("Arithmetic computed from lazily loaded static vectors.");
      setMode("static");
    } catch (nextError) {
      setArithmetic(null);
      setError(nextError instanceof Error ? nextError.message : "Unable to compute the analogy.");
    }
  }

  async function runContext(nextSentence = contextSentence, nextTokenIndex = contextTokenIndex) {
    if (!activeManifest) {
      return;
    }

    setStatus("Building context-specific token meaning...");
    setError(null);

    try {
      const sentenceTokens = tokenizeSentence(nextSentence);
      const tokenWord = sentenceTokens[nextTokenIndex];
      if (!tokenWord) {
        throw new Error("Pick a token from the sentence first.");
      }

      const tokenWordIds = sentenceTokens
        .map((token) => pointMap.get(token)?.wordId)
        .filter((wordId): wordId is number => wordId !== undefined);
      const allNeeded = Array.from(
        new Set([
          ...tokenWordIds,
          ...(pointMap.get(tokenWord) ? [pointMap.get(tokenWord)!.wordId] : []),
        ]),
      );

      const partialVectors = await loadVectorsByWordIds(activeManifest, allNeeded);
      const allVectors = await collectAllVectors(activeManifest);
      const mergedVectors = new Map([...allVectors, ...partialVectors]);

      const result = buildContextResult({
        request: {
          sentence: nextSentence,
          targetTokenIndex: nextTokenIndex,
          modelId: activeManifest.id,
        },
        manifest: activeManifest,
        metadata,
        vectors: mergedVectors,
        senses,
      });

      setContextResult(result);
      setSelectedWord(result.staticWord);
      setMode("context");
      setStatus("Context overlay projected onto the static vocabulary map.");
    } catch (nextError) {
      setContextResult(null);
      setError(nextError instanceof Error ? nextError.message : "Unable to build the context view.");
    }
  }

  return (
    <main className="mesh-backdrop workspace-shell overflow-hidden px-3 py-3 text-white sm:px-4 lg:px-5">
      <div className="mx-auto flex h-full w-full max-w-[1820px] flex-col panel-enter">
        <section className="workspace-grid grid h-full gap-3 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
          <aside className="glass-panel flex min-h-0 flex-col rounded-[28px] p-4 sm:p-5">
            <div className="mb-4">
              <div className="section-title text-xs text-white/40">Model</div>
              <div className="mt-1 text-lg font-semibold">{activeManifest?.name ?? "Loading..."}</div>
            </div>

            <div className="grid gap-2 rounded-[20px] border border-white/8 bg-white/4 p-2">
              <button
                type="button"
                onClick={() => setMode("static")}
                className={`rounded-2xl px-4 py-3 text-left transition ${
                  mode === "static" ? "bg-cyan-300/12 text-cyan-100" : "hover:bg-white/6 text-white/64"
                }`}
              >
                <div className="font-semibold">Static Vocabulary Map</div>
                <div className="mt-1 text-sm text-white/48">Global words, neighbors, and arithmetic.</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("context")}
                className={`rounded-2xl px-4 py-3 text-left transition ${
                  mode === "context" ? "bg-rose-300/12 text-rose-100" : "hover:bg-white/6 text-white/64"
                }`}
              >
                <div className="font-semibold">Context Inspector</div>
                <div className="mt-1 text-sm text-white/48">Sentence-specific meaning overlays.</div>
              </button>
            </div>

          </aside>

          <section className="glass-panel flex min-h-0 flex-col rounded-[28px] p-3 sm:p-4 lg:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="section-title text-xs text-white/40">Embedding Space</div>
                <h2 className="mt-1 text-2xl font-semibold">{activeManifest?.name ?? "Loading..."}</h2>
              </div>
              <div className="font-mono text-xs text-white/42">{status}</div>
            </div>

            <div className="min-h-0 flex-1">
              <EmbeddingCanvas
                key={activeManifest?.id ?? "empty-model"}
                modelName={activeManifest?.name ?? "Loading"}
                points={metadata}
                selectedWord={selectedWord}
                hoveredWord={hoveredWord}
                highlightWords={highlightWords}
                arithmetic={arithmetic}
                contextResult={contextResult}
                onSelectWord={(word) => {
                  setSelectedWord(word);
                  setHoveredWord(word);
                }}
                onHoverWord={setHoveredWord}
              />
            </div>
          </section>

          <aside className="glass-panel flex min-h-0 flex-col rounded-[28px] p-4 sm:p-5">
            <div className="sidebar-scroll subtle-scroll pr-1">
            {mode === "static" ? (
              <>
                <div className="section-title mb-3 text-xs text-white/40">Static Arithmetic</div>
                <div className="rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <textarea
                    id="expression"
                    value={expression}
                    onChange={(event) => setExpression(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/8 bg-black/30 px-4 py-3 font-mono text-sm outline-none transition placeholder:text-white/24 focus:border-lime-300/30"
                    placeholder="king - man + woman"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(activeManifest?.sampleExpressions ?? []).map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => {
                          setExpression(sample);
                          void runExpression(sample);
                        }}
                        className="rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/66 transition hover:border-white/14 hover:bg-white/8"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void runExpression()}
                    className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-lime-300 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    Run Static Arithmetic
                  </button>
                </div>

                <div className="mt-4 rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <div className="section-title mb-3 text-xs text-white/40">Selection</div>
                  {focusPoint ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold">{focusPoint.word}</h3>
                          <p className="mt-1 text-sm text-white/40">cluster {focusPoint.clusterId}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-right font-mono text-xs text-white/48">
                          freq {focusPoint.frequency}
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {neighbors.map((match) => (
                          <div key={match.word}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                              <span>{match.word}</span>
                              <span className="font-mono text-white/48">{formatPercent(match.score)}</span>
                            </div>
                            <div className="score-bar">
                              <span style={{ width: `${Math.max(8, match.score * 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-6 text-white/58">
                      Click a word on the canvas to inspect its nearest semantic neighbors.
                    </p>
                  )}
                </div>

                <div className="mt-4 rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <div className="section-title mb-3 text-xs text-white/40">Best Matches</div>
                  {arithmetic ? (
                    <div className="space-y-3">
                      {arithmetic.matches.map((match, index) => (
                        <div
                          key={match.word}
                          className={`rounded-2xl border px-4 py-3 ${
                            index === 0 ? "border-lime-300/18 bg-lime-300/8" : "border-white/8 bg-white/4"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold">{match.word}</span>
                            <span className="font-mono text-sm text-white/48">{formatPercent(match.score)}</span>
                          </div>
                          <div className="mt-2 score-bar">
                            <span style={{ width: `${Math.max(10, match.score * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-white/58">
                      Arithmetic loads vector chunks lazily and ranks the closest static words across the full 50K map.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="section-title mb-3 text-xs text-white/40">Context Inspector</div>
                <div className="rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <textarea
                    id="context-sentence"
                    value={contextSentence}
                    onChange={(event) => {
                      setContextSentence(event.target.value);
                      setContextResult(null);
                    }}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm outline-none transition placeholder:text-white/24 focus:border-rose-300/30"
                    placeholder="We sat on the river bank and watched the water move downstream."
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sampleSentences.map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => {
                          setContextSentence(sample);
                          setContextResult(null);
                          setContextTokenIndex(tokenizeSentence(sample).findIndex((token) => pointMap.has(token)));
                        }}
                        className="rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/66 transition hover:border-white/14 hover:bg-white/8"
                      >
                        {sample.split(" ").slice(0, 5).join(" ")}...
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <div className="section-title mb-3 text-xs text-white/40">Pick a Token</div>
                  <div className="flex flex-wrap gap-2">
                    {tokens.map((token, index) => (
                      <button
                        key={`${token}-${index}`}
                        type="button"
                        onClick={() => setContextTokenIndex(index)}
                        className={`rounded-full px-3 py-2 text-sm transition ${
                          index === contextTokenIndex
                            ? "bg-rose-300/14 text-rose-100"
                            : "border border-white/8 bg-white/4 text-white/64 hover:bg-white/7"
                        }`}
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void runContext()}
                    className="mt-4 w-full rounded-2xl bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    Project Context Meaning
                  </button>
                </div>

                <div className="mt-4 rounded-[20px] border border-white/8 bg-white/4 p-4">
                  <div className="section-title mb-3 text-xs text-white/40">Context Output</div>
                  {contextResult ? (
                    <>
                      <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                        <div className="text-lg font-semibold">{contextResult.selectedWord}</div>
                        <p className="mt-1 text-sm text-white/54">{contextResult.overlay.interpretation}</p>
                        <p className="mt-2 font-mono text-xs text-white/45">
                          confidence {formatPercent(contextResult.overlay.confidence)}
                        </p>
                      </div>
                      <div className="mt-4">
                        <div className="mb-2 text-sm font-medium text-white/75">Nearest static words</div>
                        <div className="flex flex-wrap gap-2">
                          {contextResult.overlay.nearestStaticWords.map((word) => (
                            <button
                              key={word}
                              type="button"
                              onClick={() => setSelectedWord(word)}
                              className="rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/66 transition hover:border-white/14 hover:bg-white/8"
                            >
                              {word}
                            </button>
                          ))}
                        </div>
                      </div>
                      {contextResult.senses.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {contextResult.senses.map((sense) => (
                            <div key={sense.senseId} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                              <div className="font-semibold">{sense.label}</div>
                              <div className="mt-1 text-sm text-white/52">{sense.exampleContexts[0]}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm leading-6 text-white/58">
                      Context mode uses precomputed sense centroids when available, then projects the selected token onto the shared map.
                    </p>
                  )}
                </div>
              </>
            )}

            {error ? (
              <div className="mt-4 rounded-[20px] border border-rose-300/16 bg-rose-300/9 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
