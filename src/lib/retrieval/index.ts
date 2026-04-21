import { chunkTranscript } from "./chunker";
import { scoreAndSelect } from "./bm25";
import { expandIntent } from "./intent";
import { tokenize } from "./tokenizer";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  type Chunk,
  type RetrievalConfig,
  type RetrievalResult,
  type VideoSource,
} from "./types";

const FULL_MODE_TOTAL_CHAR_THRESHOLD = 3000;

export interface RetrieveInputs {
  videos: VideoSource[];
  intent: string;
  config?: Partial<RetrievalConfig>;
}

export async function retrieveForSkill(inputs: RetrieveInputs): Promise<RetrievalResult> {
  const config: RetrievalConfig = { ...DEFAULT_RETRIEVAL_CONFIG, ...(inputs.config ?? {}) };
  const notes: string[] = [];
  const totalChars = inputs.videos.reduce((s, v) => s + v.transcript.length, 0);

  if (totalChars < FULL_MODE_TOTAL_CHAR_THRESHOLD) {
    return {
      strategy: "full",
      chunks: [],
      keywords: [],
      notes: ["under threshold → full mode"],
    };
  }

  const keywordList = await expandIntent({
    intent: inputs.intent,
    titles: inputs.videos.map((v) => v.title),
    tags: inputs.videos.flatMap((v) => v.tags),
  });

  const titleTokens = inputs.videos.flatMap((v) => tokenize(v.title));
  const tagTokens = inputs.videos.flatMap((v) => v.tags.flatMap((t) => tokenize(t)));
  const queryTokens = Array.from(new Set([...keywordList, ...titleTokens, ...tagTokens]));

  if (queryTokens.length === 0) {
    notes.push("no query tokens → fallback full mode");
    return { strategy: "full", chunks: [], keywords: [], notes };
  }

  const allChunks: Chunk[] = [];
  for (const v of inputs.videos) {
    allChunks.push(...chunkTranscript(v.transcript, v.id, config));
  }

  const selected = scoreAndSelect(
    allChunks,
    queryTokens,
    config.topK,
    config.jaccardThreshold
  );
  if (selected.length === 0) {
    notes.push("BM25 zero matches → fallback full mode");
    return { strategy: "full", chunks: [], keywords: queryTokens, notes };
  }

  selected.sort((a, b) =>
    a.sourceId === b.sourceId ? a.index - b.index : a.sourceId.localeCompare(b.sourceId)
  );
  return { strategy: "retrieved", chunks: selected, keywords: queryTokens, notes };
}

export type {
  VideoSource,
  RetrievalResult,
  ScoredChunk,
  Chunk,
  RetrievalConfig,
} from "./types";
