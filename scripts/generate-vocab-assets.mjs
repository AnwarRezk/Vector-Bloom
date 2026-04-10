import fs from "node:fs/promises";
import path from "node:path";
import wordListPath from "word-list";

const root = process.cwd();
const outDir = path.join(root, "public", "data", "english-core-50k");
const targetSize = 50000;
const vectorDim = 32;
const chunkSize = 5000;

const projectionBasis = {
  x: [1.7, -1.2, 1.05, -1.05, 0.7, -0.28, 0.85, -0.78, 0.72, -0.35, 0.42, -0.18, 0.35, -0.22, 0.5, 0.7, -0.62, 0.58, -0.56, 0.52, -0.5, 0.48, 0.36, -0.32, 0.2, -0.18, 0.16, -0.14, 0.12, -0.1, 0.08, -0.06],
  y: [0.38, 0.58, 1.2, 1.2, 0.92, 0.52, -0.48, -0.78, 0.44, 0.64, -0.36, 0.58, -0.26, 0.44, 0.52, -0.18, 0.66, -0.62, 0.58, -0.54, 0.52, -0.48, 0.28, -0.24, 0.16, -0.15, 0.14, -0.13, 0.12, -0.11, 0.1, -0.09],
};

const analogies = [
  "king - man + woman",
  "paris - france + england",
  "rome - italy + japan",
];

const curatedWords = [
  "king", "queen", "man", "woman", "boy", "girl", "prince", "princess", "father", "mother",
  "duke", "duchess", "emperor", "empress", "england", "france", "italy", "japan", "germany", "spain",
  "london", "paris", "rome", "tokyo", "berlin", "madrid", "capital", "europe", "country", "city",
  "bank", "money", "cash", "deposit", "loan", "river", "shore", "stream", "water",
  "apple", "fruit", "orchard", "pie", "juice", "iphone", "mac", "software", "device",
  "python", "snake", "reptile", "venom", "code", "script", "package", "java", "coffee", "espresso", "latte",
  "spring", "season", "april", "flower", "coil", "metal", "bounce", "bat", "wing", "cave", "baseball",
  "pitch", "music", "tone", "harmony", "sport", "field", "throw", "rock", "guitar", "band", "stone",
  "amazon", "rainforest", "jungle", "delivery", "cloud", "online", "science", "research", "biology", "physics",
  "artist", "painting", "poetry", "song", "market", "trade", "school", "teacher", "student", "doctor",
];

const categoryWords = {
  city: new Set(["london", "paris", "rome", "tokyo", "berlin", "madrid", "capital", "city", "village", "town", "metropolis"]),
  country: new Set(["england", "france", "italy", "japan", "germany", "spain", "country", "nation", "state", "kingdom"]),
  male: new Set(["man", "boy", "father", "king", "prince", "duke", "emperor", "male", "gentleman"]),
  female: new Set(["woman", "girl", "mother", "queen", "princess", "duchess", "empress", "female", "lady"]),
  royal: new Set(["king", "queen", "prince", "princess", "duke", "duchess", "emperor", "empress", "royal", "crown", "palace"]),
  youth: new Set(["boy", "girl", "child", "kid", "teen", "young", "student"]),
  finance: new Set(["bank", "money", "cash", "loan", "deposit", "finance", "market", "trade", "price", "stock", "salary", "credit"]),
  nature: new Set(["river", "water", "shore", "stream", "forest", "tree", "nature", "leaf", "mountain", "stone", "flower", "rain"]),
  company: new Set(["apple", "amazon", "company", "business", "device", "software", "cloud", "online", "platform", "brand"]),
  food: new Set(["apple", "fruit", "pie", "juice", "coffee", "espresso", "latte", "bread", "rice", "meal"]),
  animal: new Set(["python", "snake", "bat", "animal", "bird", "wing", "reptile", "venom", "cave"]),
  science: new Set(["python", "java", "science", "research", "biology", "physics", "code", "script", "package", "algorithm"]),
  art: new Set(["music", "tone", "harmony", "rock", "guitar", "band", "painting", "poetry", "artist", "song"]),
  sport: new Set(["baseball", "pitch", "sport", "field", "throw", "bat", "game", "score", "team"]),
};

const countryIdentity = new Map([
  ["england", 16],
  ["france", 17],
  ["italy", 18],
  ["japan", 19],
  ["germany", 20],
  ["spain", 21],
]);

const cityCountry = new Map([
  ["london", "england"],
  ["paris", "france"],
  ["rome", "italy"],
  ["tokyo", "japan"],
  ["berlin", "germany"],
  ["madrid", "spain"],
]);

const senseDefinitions = [
  {
    word: "bank",
    senses: [
      {
        senseId: "finance",
        label: "Financial institution",
        keywords: ["money", "cash", "deposit", "loan", "credit", "finance", "account"],
        exampleContexts: ["I deposited money in the bank.", "The bank approved the loan."],
      },
      {
        senseId: "river",
        label: "Edge of a river",
        keywords: ["river", "shore", "water", "stream", "mud", "flood"],
        exampleContexts: ["We sat on the river bank.", "The flood covered the bank."],
      },
    ],
  },
  {
    word: "apple",
    senses: [
      {
        senseId: "fruit",
        label: "Fruit",
        keywords: ["fruit", "orchard", "juice", "pie", "tree"],
        exampleContexts: ["She sliced an apple for the pie.", "The orchard grew apple trees."],
      },
      {
        senseId: "company",
        label: "Technology company",
        keywords: ["iphone", "mac", "software", "device", "company", "brand"],
        exampleContexts: ["Apple launched a new iPhone.", "The company improved its software."],
      },
    ],
  },
  {
    word: "python",
    senses: [
      {
        senseId: "animal",
        label: "Snake",
        keywords: ["snake", "reptile", "venom", "jungle", "animal"],
        exampleContexts: ["A python moved through the jungle.", "The reptile looked like a python."],
      },
      {
        senseId: "language",
        label: "Programming language",
        keywords: ["code", "script", "package", "python", "software", "algorithm"],
        exampleContexts: ["The script was written in Python.", "Python packages speed up analysis."],
      },
    ],
  },
  {
    word: "bat",
    senses: [
      {
        senseId: "animal",
        label: "Nocturnal animal",
        keywords: ["wing", "cave", "animal", "night"],
        exampleContexts: ["A bat flew out of the cave.", "The bat spread its wings."],
      },
      {
        senseId: "sport",
        label: "Sports equipment",
        keywords: ["baseball", "sport", "pitch", "field", "throw", "hit"],
        exampleContexts: ["The batter grabbed the bat.", "The pitch hit the bat."],
      },
    ],
  },
];

function hashNumber(input, seed = 0) {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize(vector) {
  const size = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (size === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / size).toFixed(6)));
}

function project(vector) {
  const x = Number((vector.reduce((sum, value, index) => sum + value * (projectionBasis.x[index] ?? 0), 0) * 80).toFixed(3));
  const y = Number((vector.reduce((sum, value, index) => sum + value * (projectionBasis.y[index] ?? 0), 0) * -80).toFixed(3));
  return { x, y };
}

function categoryBoost(word, category) {
  if (categoryWords[category]?.has(word)) {
    return 1;
  }

  if (category === "city" && /town|city|burg|ford$/.test(word)) {
    return 0.55;
  }

  if (category === "science" && /(logy|graphy|metric|script|code|data)$/.test(word)) {
    return 0.45;
  }

  if (category === "art" && /(song|tone|band|paint|poem)$/.test(word)) {
    return 0.4;
  }

  if (category === "finance" && /(bank|loan|cash|fund|trade|price)$/.test(word)) {
    return 0.55;
  }

  if (category === "nature" && /(river|water|wood|stone|tree|leaf)$/.test(word)) {
    return 0.5;
  }

  return 0;
}

function dominantCluster(vector) {
  const scores = [
    vector[0] + vector[1] + vector[15],
    vector[2] + vector[3] + vector[4] + vector[5],
    vector[6] + vector[8],
    vector[7] + vector[9] + vector[10],
    vector[11] + vector[12] + vector[13],
  ];

  let bestIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[bestIndex]) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function scoreWord(word, index) {
  let score = 0;
  if (curatedWords.includes(word)) {
    score += 100000;
  }
  score += clamp(18 - word.length, 0, 12) * 200;
  score += /^[a-z]+$/.test(word) ? 120 : 0;
  score += /^[a-z]{3,8}$/.test(word) ? 100 : 0;
  score += Array.from(Object.keys(categoryWords)).reduce((sum, key) => sum + categoryBoost(word, key) * 180, 0);
  score -= index * 0.0001;
  return score;
}

function buildVector(word) {
  const vector = new Array(vectorDim).fill(0);

  vector[0] += categoryBoost(word, "city") * 1.5;
  vector[1] += categoryBoost(word, "country") * 1.5;
  vector[2] += categoryBoost(word, "male") * 1.3;
  vector[3] += categoryBoost(word, "female") * 1.3;
  vector[4] += categoryBoost(word, "royal") * 1.4;
  vector[5] += categoryBoost(word, "youth") * 1.1;
  vector[6] += categoryBoost(word, "finance") * 1.35;
  vector[7] += categoryBoost(word, "nature") * 1.35;
  vector[8] += categoryBoost(word, "company") * 1.25;
  vector[9] += categoryBoost(word, "food") * 1.15;
  vector[10] += categoryBoost(word, "animal") * 1.2;
  vector[11] += categoryBoost(word, "science") * 1.2;
  vector[12] += categoryBoost(word, "art") * 1.15;
  vector[13] += categoryBoost(word, "sport") * 1.15;
  vector[14] += word.length <= 4 ? 0.25 : 0;
  vector[15] += /land|stan|ia$/.test(word) ? 0.55 : 0;

  const ownCountryDim = countryIdentity.get(word);
  if (ownCountryDim) {
    vector[ownCountryDim] += 1.6;
  }

  const homeCountry = cityCountry.get(word);
  if (homeCountry) {
    vector[0] += 1.2;
    vector[countryIdentity.get(homeCountry)] += 1.4;
    vector[15] += 0.6;
  }

  if (word === "capital") {
    vector[0] += 0.95;
    vector[15] += 0.4;
  }

  if (word === "bank") {
    vector[6] += 0.8;
    vector[7] += 0.65;
  }

  if (word === "apple") {
    vector[8] += 0.78;
    vector[9] += 0.78;
  }

  if (word === "python") {
    vector[10] += 0.72;
    vector[11] += 0.84;
  }

  if (word === "bat") {
    vector[10] += 0.6;
    vector[13] += 0.7;
  }

  if (word === "spring") {
    vector[7] += 0.7;
    vector[14] += 0.55;
  }

  for (let index = 22; index < vectorDim; index += 1) {
    vector[index] += (hashNumber(word, index) - 0.5) * 0.55;
  }

  vector[24] += ((word.match(/[aeiou]/g)?.length ?? 0) / Math.max(1, word.length) - 0.4) * 0.4;
  vector[25] += ((word.length - 6) / 10);

  return normalize(vector);
}

function average(vectors) {
  const next = new Array(vectorDim).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      next[index] += vector[index];
    }
  }

  return normalize(next.map((value) => value / vectors.length));
}

async function main() {
  const wordsFile = await fs.readFile(wordListPath, "utf8");
  const rawWords = wordsFile
    .split("\n")
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]+$/.test(word))
    .filter((word) => word.length >= 2 && word.length <= 16);

  const rankedWords = Array.from(new Set([...curatedWords, ...rawWords]))
    .map((word, index) => ({ word, score: scoreWord(word, index) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, targetSize)
    .map((entry) => entry.word);

  const wordToVector = new Map();
  rankedWords.forEach((word) => {
    wordToVector.set(word, buildVector(word));
  });

  const metadata = rankedWords.map((word, index) => {
    const vector = wordToVector.get(word);
    const projected = project(vector);
    const frequencyBase = targetSize - index;
    const frequency = Math.max(1, frequencyBase + Math.round(scoreWord(word, index) / 100));

    return {
      wordId: index,
      word,
      x: projected.x,
      y: projected.y,
      frequency,
      clusterId: dominantCluster(vector),
      labelPriority: Number((clamp((targetSize - index) / targetSize, 0, 1)).toFixed(4)),
    };
  });

  const metadataByWord = new Map(metadata.map((point) => [point.word, point]));
  const senses = senseDefinitions.flatMap((definition) =>
    definition.senses.map((sense) => {
      const vectors = [wordToVector.get(definition.word), ...sense.keywords.map((keyword) => wordToVector.get(keyword))].filter(Boolean);
      const vector = average(vectors);
      const nearestStaticWords = sense.keywords.filter((keyword) => metadataByWord.has(keyword)).slice(0, 5);
      const projected = project(vector);

      return {
        word: definition.word,
        senseId: `${definition.word}:${sense.senseId}`,
        label: sense.label,
        keywords: sense.keywords,
        exampleContexts: sense.exampleContexts,
        nearestStaticWords,
        vector,
        x: projected.x,
        y: projected.y,
      };
    }),
  );

  const chunkCount = Math.ceil(metadata.length / chunkSize);
  const chunks = Array.from({ length: chunkCount }, (_, chunkId) => {
    const slice = metadata.slice(chunkId * chunkSize, (chunkId + 1) * chunkSize);
    return {
      chunkId,
      wordIds: slice.map((point) => point.wordId),
      vectors: slice.map((point) => wordToVector.get(point.word)),
    };
  });

  const manifest = {
    models: [
      {
        id: "english-core-50k",
        name: "English Core 50K",
        description: "A precomputed large-vocabulary semantic map with lazy-loaded vectors and context-aware sense overlays.",
        language: "English",
        accent: "from-cyan-300 via-emerald-300 to-lime-300",
        vectorDim,
        vocabSize: metadata.length,
        projectionVersion: "semantic-heuristic-1",
        chunkCount,
        chunkSize,
        hasContextMode: true,
        sampleExpressions: analogies,
        metadataPath: "/data/english-core-50k/metadata.json",
        vectorsBasePath: "/data/english-core-50k/chunks",
        sensesPath: "/data/english-core-50k/senses.json",
        projectionBasis,
      },
    ],
  };

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, "chunks"), { recursive: true });
  await fs.writeFile(
    path.join(root, "public", "data", "model-manifests.json"),
    `${JSON.stringify(manifest)}\n`,
  );
  await fs.writeFile(path.join(outDir, "metadata.json"), `${JSON.stringify(metadata)}\n`);
  await fs.writeFile(path.join(outDir, "senses.json"), `${JSON.stringify(senses)}\n`);
  await Promise.all(
    chunks.map((chunk) =>
      fs.writeFile(
        path.join(outDir, "chunks", `chunk-${chunk.chunkId}.json`),
        `${JSON.stringify(chunk)}\n`,
      ),
    ),
  );

  console.log(`Generated ${metadata.length} vocabulary entries across ${chunkCount} chunks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
