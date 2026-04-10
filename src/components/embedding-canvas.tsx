"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalogyResult, ContextResult, VocabPointMeta } from "@/lib/types";

type EmbeddingCanvasProps = {
  points: VocabPointMeta[];
  selectedWord: string | null;
  hoveredWord: string | null;
  highlightWords: string[];
  arithmetic: AnalogyResult | null;
  contextResult: ContextResult | null;
  modelName: string;
  onSelectWord: (word: string) => void;
  onHoverWord: (word: string | null) => void;
};

type Viewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type CanvasPoint = VocabPointMeta & {
  screenX: number;
  screenY: number;
};

const CLUSTER_COLORS = ["#57d4ff", "#ffc857", "#79f2c0", "#b9ff66", "#ff7f6e"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function projectToScreen(point: { x: number; y: number }, viewport: Viewport, size: { width: number; height: number }) {
  return {
    screenX: size.width / 2 + point.x * viewport.scale + viewport.offsetX,
    screenY: size.height / 2 + point.y * viewport.scale + viewport.offsetY,
  };
}

export function EmbeddingCanvas({
  points,
  selectedWord,
  hoveredWord,
  highlightWords,
  arithmetic,
  contextResult,
  modelName,
  onSelectWord,
  onHoverWord,
}: EmbeddingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    scale: 1.16,
    offsetX: 0,
    offsetY: 0,
  });
  const [size, setSize] = useState({ width: 960, height: 640 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const nextSize = entries[0]?.contentRect;
      if (!nextSize) {
        return;
      }

      setSize({
        width: nextSize.width,
        height: nextSize.height,
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const screenPoints = useMemo<CanvasPoint[]>(
    () =>
      points.map((point) => ({
        ...point,
        ...projectToScreen(point, viewport, size),
      })),
    [points, size, viewport],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    context.fillStyle = "rgba(255,255,255,0.03)";
    for (let x = 0; x < size.width; x += 24) {
      context.fillRect(x, 0, 1, size.height);
    }
    for (let y = 0; y < size.height; y += 24) {
      context.fillRect(0, y, size.width, 1);
    }

    const highlighted = new Set(highlightWords);

    for (const point of screenPoints) {
      if (
        point.screenX < -12 ||
        point.screenX > size.width + 12 ||
        point.screenY < -12 ||
        point.screenY > size.height + 12
      ) {
        continue;
      }

      const isSelected = point.word === selectedWord;
      const isHovered = point.word === hoveredWord;
      const isHighlighted = highlighted.has(point.word);
      const baseRadius = point.labelPriority > 0.98 ? 2.6 : point.labelPriority > 0.9 ? 2.1 : 1.45;
      const radius = isSelected ? 7 : isHovered ? 5.5 : isHighlighted ? 4.6 : baseRadius;
      const color = CLUSTER_COLORS[point.clusterId] ?? "#79f2c0";

      if (isSelected || isHovered || isHighlighted) {
        context.beginPath();
        context.fillStyle = `${color}1f`;
        context.arc(point.screenX, point.screenY, radius * 3, 0, Math.PI * 2);
        context.fill();
      }

      context.beginPath();
      context.fillStyle = color;
      context.globalAlpha = isSelected || isHovered || isHighlighted ? 0.96 : 0.42;
      context.arc(point.screenX, point.screenY, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
  }, [highlightWords, hoveredWord, screenPoints, selectedWord, size.height, size.width]);

  const labelWords = new Set<string>(
    [
      selectedWord,
      hoveredWord,
      ...(arithmetic?.matches.slice(0, 3).map((match) => match.word) ?? []),
      ...(arithmetic?.positiveWords ?? []),
      ...(arithmetic?.negativeWords ?? []),
      ...(contextResult?.overlay.nearestStaticWords ?? []),
      contextResult?.selectedWord,
    ].filter((word): word is string => Boolean(word)),
  );

  const visibleLabels = screenPoints
    .filter((point) => labelWords.has(point.word) || point.labelPriority > 0.9994)
    .slice(0, 16);

  const screenTrail = (arithmetic?.trail ?? []).map((point) => ({
    ...point,
    ...projectToScreen(point, viewport, size),
  }));

  const contextOverlay = contextResult?.overlay
    ? {
        ...contextResult.overlay,
        ...projectToScreen(contextResult.overlay, viewport, size),
      }
    : null;

  const contextSenses = (contextResult?.senses ?? []).map((sense) => ({
    ...sense,
    ...projectToScreen(sense, viewport, size),
  }));

  function pickWord(clientX: number, clientY: number) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    let nearest: CanvasPoint | null = null;
    let distance = Number.POSITIVE_INFINITY;

    for (const point of screenPoints) {
      const deltaX = point.screenX - localX;
      const deltaY = point.screenY - localY;
      const nextDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = point;
      }
    }

    return distance < 18 ? nearest : null;
  }

  return (
    <div
      ref={wrapperRef}
      className="canvas-shell h-[26rem] w-full md:h-[34rem] xl:h-full"
      onDoubleClick={() =>
        setViewport({
          scale: 1.16,
          offsetX: 0,
          offsetY: 0,
        })
      }
      onPointerDown={(event) => {
        const element = wrapperRef.current;
        if (!element) {
          return;
        }

        dragState.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: viewport.offsetX,
          offsetY: viewport.offsetY,
          moved: false,
        };
        setIsDragging(true);
        element.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const element = wrapperRef.current;
        if (!element) {
          return;
        }

        if (dragState.current.pointerId === event.pointerId && isDragging) {
          const deltaX = event.clientX - dragState.current.startX;
          const deltaY = event.clientY - dragState.current.startY;
          dragState.current.moved = dragState.current.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
          setViewport((current) => ({
            ...current,
            offsetX: dragState.current.offsetX + deltaX,
            offsetY: dragState.current.offsetY + deltaY,
          }));
          return;
        }

        const target = pickWord(event.clientX, event.clientY);
        onHoverWord(target?.word ?? null);
      }}
      onPointerUp={(event) => {
        const element = wrapperRef.current;
        if (!element) {
          return;
        }

        if (dragState.current.pointerId === event.pointerId && !dragState.current.moved) {
          const target = pickWord(event.clientX, event.clientY);
          if (target) {
            onSelectWord(target.word);
          }
        }

        setIsDragging(false);
        dragState.current.pointerId = -1;
        element.releasePointerCapture(event.pointerId);
      }}
      onPointerLeave={() => {
        if (!isDragging) {
          onHoverWord(null);
        }
      }}
      onWheel={(event) => {
        event.preventDefault();
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }

        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const zoom = clamp(viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08), 0.5, 3.4);
        const worldX = (pointerX - size.width / 2 - viewport.offsetX) / viewport.scale;
        const worldY = (pointerY - size.height / 2 - viewport.offsetY) / viewport.scale;

        setViewport({
          scale: zoom,
          offsetX: pointerX - size.width / 2 - worldX * zoom,
          offsetY: pointerY - size.height / 2 - worldY * zoom,
        });
      }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        aria-label={`${modelName} embedding plot`}
      />

      <svg className="pointer-events-none absolute inset-0 h-full w-full" role="presentation">
        <defs>
          <marker
            id="trail-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="7"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,7 L8,3.5 z" fill="#b9ff66" />
          </marker>
        </defs>

        {screenTrail.length > 1 ? (
          <>
            <polyline
              points={screenTrail.map((point) => `${point.screenX},${point.screenY}`).join(" ")}
              fill="none"
              stroke="rgba(185,255,102,0.9)"
              strokeWidth="2.4"
              className="trail-line"
              markerEnd="url(#trail-arrow)"
            />
            {screenTrail.map((point, index) => (
              <g key={`${point.label}-${index}`} transform={`translate(${point.screenX}, ${point.screenY})`}>
                <circle r={index === screenTrail.length - 1 ? 6 : 4.5} fill={index === screenTrail.length - 1 ? "#b9ff66" : "#57d4ff"} />
                <text className="overlay-label" x="10" y="-10" fill="#f7f8fb" fontSize="11" fontFamily="var(--font-mono)">
                  {index === screenTrail.length - 1 ? "result" : point.label}
                </text>
              </g>
            ))}
          </>
        ) : null}

        {contextSenses.map((sense) => (
          <g key={sense.senseId} transform={`translate(${sense.screenX}, ${sense.screenY})`}>
            <circle r="6" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" />
            <text className="overlay-label" x="9" y="-10" fill="#f7f8fb" fontSize="10" fontFamily="var(--font-mono)">
              {sense.label}
            </text>
          </g>
        ))}

        {contextOverlay ? (
          <g transform={`translate(${contextOverlay.screenX}, ${contextOverlay.screenY})`}>
            <circle r="18" fill="rgba(255,127,110,0.16)" className="result-pulse" />
            <circle r="7" fill="#ff7f6e" />
            <text className="overlay-label" x="10" y="-10" fill="#ffffff" fontSize="11" fontFamily="var(--font-mono)">
              contextual {contextOverlay.word}
            </text>
          </g>
        ) : null}

        {visibleLabels.map((point) => (
          <g key={point.word} transform={`translate(${point.screenX + 8}, ${point.screenY - 10})`}>
            <text className="overlay-label" fill="#f7f8fb" fontSize="11" fontWeight="600">
              {point.word}
            </text>
          </g>
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-full border border-white/8 bg-black/40 px-4 py-3 text-xs text-white/64 backdrop-blur">
        <span>Drag to pan, zoom with the wheel, double-click to recenter.</span>
        <span className="font-mono text-white/55">Scale {viewport.scale.toFixed(2)}x</span>
      </div>
    </div>
  );
}
