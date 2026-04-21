export interface VideoSource {
  id: string;              // stable id within a batch (e.g. "v1", "v2")
  title: string;
  tags: string[];
  transcript: string;
}

export interface Chunk {
  id: string;              // "{sourceId}:c{idx}" e.g. "v1:c3"
  sourceId: string;
  index: number;           // within source
  text: string;
  startRatio: number;      // 0..1 position in source transcript
  endRatio: number;
}

export interface ScoredChunk extends Chunk {
  score: number;
  matchedTokens: string[];
}

export interface IntentContext {
  intent: string;
  titles: string[];
  tags: string[];
}

export interface RetrievalConfig {
  chunkMinChars: number;   // default 500
  chunkMaxChars: number;   // default 1000
  topK: number;            // default 8
  jaccardThreshold: number; // default 0.7
}

export interface RetrievalResult {
  strategy: "full" | "retrieved";
  chunks: ScoredChunk[];
  keywords: string[];
  notes: string[];         // debug breadcrumbs: "intent expansion failed → fallback"
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  chunkMinChars: 500,
  chunkMaxChars: 1000,
  topK: 8,
  jaccardThreshold: 0.7,
};
