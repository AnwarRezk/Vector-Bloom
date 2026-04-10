# Vector Bloom

Vector Bloom is a dark, interactive word embedding explorer built with Next.js 16 and React 19.

It visualizes a large precomputed vocabulary in a 2D semantic space, supports classic word arithmetic such as `king - man + woman`, and adds a context inspector for ambiguous words whose meaning changes with surrounding text.

## Overview

The project is organized around three main ideas:

- `Static vocabulary exploration`: browse a large shared embedding space, inspect words, and run analogy arithmetic.
- `Context-aware overlays`: project sentence-specific meaning for words like `bank`, `apple`, `python`, and `bat`.
- `Offline-first data preparation`: generate heavy vocabulary assets ahead of time so the runtime app stays lightweight.

The current shipped dataset contains:

- `50,000` vocabulary entries
- metadata-first rendering for fast initial load
- lazily loaded vector chunks for arithmetic and nearest-neighbor operations
- precomputed sense clusters for selected ambiguous words

## Tech Stack

- `Next.js 16.2.3`
- `React 19.2.4`
- `TypeScript`
- `Tailwind CSS 4`
- `@fontsource/inter`
- custom `Canvas + SVG` visualization
- dev-time vocabulary generation using `word-list`

## Project Structure

```text
word2vec/
├─ public/
│  └─ data/
│     ├─ model-manifests.json
│     └─ english-core-50k/
│        ├─ metadata.json
│        ├─ senses.json
│        └─ chunks/
│           ├─ chunk-0.json
│           ├─ chunk-1.json
│           └─ ...
├─ scripts/
│  └─ generate-vocab-assets.mjs
├─ src/
│  ├─ app/
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  ├─ embedding-canvas.tsx
│  │  ├─ word2vec-app.tsx
│  │  └─ word2vec-client-shell.tsx
│  └─ lib/
│     ├─ contextual-meaning.ts
│     ├─ model-store.ts
│     ├─ types.ts
│     └─ vector-math.ts
├─ tests/
│  └─ run-tests.ts
├─ package.json
└─ README.md
```

## Application Layers

### 1. App Shell

Files:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/components/word2vec-client-shell.tsx`

Responsibilities:

- load global styles and typography
- mount the client-side experience safely
- render the main application entrypoint

`word2vec-client-shell.tsx` acts as the hydration-safe client wrapper before the full interactive UI is shown.

### 2. Main UI

File:

- `src/components/word2vec-app.tsx`

Responsibilities:

- load manifests, metadata, senses, and vectors
- manage UI mode switching between static and context views
- orchestrate arithmetic requests
- orchestrate context interpretation
- manage selected and hovered words
- coordinate sidebar, canvas, and result panels

This is the main controller for the product.

### 3. Visualization Layer

File:

- `src/components/embedding-canvas.tsx`

Responsibilities:

- render the 2D semantic space on HTML canvas
- overlay labels, analogy paths, and context markers with SVG
- support pan, zoom, hover, and click selection
- keep the large vocabulary map responsive on screen

The canvas renders the global point cloud, while SVG is used for readable overlays and motion paths.

### 4. Domain Logic

Files:

- `src/lib/vector-math.ts`
- `src/lib/contextual-meaning.ts`
- `src/lib/model-store.ts`
- `src/lib/types.ts`

Responsibilities:

- vector arithmetic and cosine similarity
- analogy parsing and result building
- contextual sense scoring and overlay generation
- manifest, metadata, sense, and chunk loading
- shared type contracts across the app

## Data Model

The runtime architecture is built around a few core contracts.

### `ModelManifest`

Describes an available embedding model and where its assets live.

Important fields:

- `id`
- `name`
- `vectorDim`
- `vocabSize`
- `chunkCount`
- `chunkSize`
- `metadataPath`
- `vectorsBasePath`
- `sensesPath`
- `projectionBasis`

### `VocabPointMeta`

Lightweight data for drawing the global map without loading full vectors.

Important fields:

- `wordId`
- `word`
- `x`
- `y`
- `frequency`
- `clusterId`
- `labelPriority`

### `VectorChunk`

Chunked high-dimensional vectors loaded only when needed.

Important fields:

- `chunkId`
- `wordIds`
- `vectors`

### `SenseCluster`

Precomputed contextual meaning anchors for ambiguous words.

Important fields:

- `word`
- `senseId`
- `label`
- `x`
- `y`
- `vector`
- `keywords`
- `exampleContexts`
- `nearestStaticWords`

## Runtime Flow

### Static Map Flow

1. The app loads `public/data/model-manifests.json`.
2. The selected model loads `metadata.json` and `senses.json`.
3. The canvas renders the full 2D point set using metadata only.
4. When the user runs arithmetic or inspects similarity, vector chunks are loaded on demand.
5. Results are projected back onto the same shared map.

### Context Flow

1. The user enters a sentence.
2. A token is selected.
3. The app looks for precomputed sense clusters for that word.
4. If matching sense clues exist, it projects the best fitting sense.
5. If not, it falls back to a blended context-adjusted meaning based on nearby token vectors.
6. The contextual result is overlaid on the static embedding map.

## Offline Data Pipeline

File:

- `scripts/generate-vocab-assets.mjs`

Responsibilities:

- build the large vocabulary asset set
- assign vectors and projection coordinates
- split vectors into chunks
- emit metadata, senses, and model manifests

Generated files:

- `public/data/model-manifests.json`
- `public/data/english-core-50k/metadata.json`
- `public/data/english-core-50k/senses.json`
- `public/data/english-core-50k/chunks/chunk-*.json`

This is intentionally an offline step so the web app does not need to perform heavy NLP preprocessing in the browser.

## Current UI Modes

### Static Vocabulary Map

Focused on:

- exploring the full vocabulary space
- selecting words directly from the map
- inspecting nearest neighbors
- running arithmetic analogies

Example expressions:

- `king - man + woman`
- `paris - france + england`
- `rome - italy + japan`

### Context Inspector

Focused on:

- sentence-specific interpretation
- meaning shifts for ambiguous tokens
- sense overlays projected onto the global map

Example targets:

- `bank`
- `apple`
- `python`
- `bat`

## Commands

### Development

```bash
pnpm dev
```

Starts the local development server.

### Lint

```bash
pnpm lint
```

Runs ESLint on the project.

### Tests

```bash
pnpm test
```

Runs the lightweight TypeScript and runtime checks in `tests/run-tests.ts`.

### Production Build

```bash
pnpm build
pnpm start
```

Builds and serves the production app.

### Regenerate Data Assets

```bash
pnpm generate:data
```

Rebuilds the vocabulary dataset under `public/data/`.

## Testing Strategy

Current checks cover:

- analogy expression parsing
- manifest generation and expected scale
- classic arithmetic behavior from chunked vectors
- cosine similarity math
- contextual sense separation for ambiguous words

The test entrypoint is:

- `tests/run-tests.ts`

## Design Notes

The UI is intentionally built as a full-screen dark workspace:

- large central visualization area
- compact side panels
- minimal static chrome
- internal panel scrolling instead of excessive page scrolling

The goal is to keep attention on the embedding map rather than on dashboard-style decoration.

## Limitations

The current shipped dataset is precomputed and scalable, but it is still generated rather than coming from a true pretrained GloVe/word2vec checkpoint.

That means:

- the app architecture is production-oriented
- the UI and loading model are ready
- the next major step is replacing the generated vectors with a real pretrained embedding source

## Recommended Next Step

Integrate a real pretrained embedding dataset into the existing manifest/chunk pipeline.

That future step should:

- ingest a real embedding source
- keep the top useful vocabulary
- compute 2D projection offline
- generate chunked vector files
- preserve the current runtime contracts so the UI does not need to be rewritten
