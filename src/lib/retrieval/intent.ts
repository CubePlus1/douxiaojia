import { tokenize } from "./tokenizer";
import type { IntentContext } from "./types";

interface CacheEntry {
  keywords: string[];
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

export function _resetIntentCacheForTests() {
  CACHE.clear();
}

function cacheKey(ctx: IntentContext): string {
  const tagKey = [...ctx.tags].sort().join(",").toLowerCase();
  return `${ctx.intent.trim().toLowerCase()}|${ctx.titles.join("|").toLowerCase()}|${tagKey}`;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of CACHE.entries()) {
    if (v.expiresAt < now) CACHE.delete(k);
  }
  if (CACHE.size > MAX_ENTRIES) {
    const sorted = [...CACHE.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const excess = sorted.length - MAX_ENTRIES;
    for (let i = 0; i < excess; i++) CACHE.delete(sorted[i][0]);
  }
}

export async function expandIntent(ctx: IntentContext): Promise<string[]> {
  if (!ctx.intent.trim()) return [];
  const baseTokens = tokenize(ctx.intent);

  const key = cacheKey(ctx);
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Array.from(
      new Set([...baseTokens, ...cached.keywords.flatMap((k) => tokenize(k))])
    );
  }

  try {
    const { hasAIKey, getAIModel } = await import("@/lib/ai-client");
    if (!hasAIKey()) {
      console.warn("[intent] hasAIKey=false — skipping LLM expansion, using raw tokens");
      return baseTokens;
    }
    const { generateObject } = await import("ai");
    const { z } = await import("zod");
    const Schema = z.object({ keywords: z.array(z.string()).min(1).max(20) });

    const prompt = `你是关键词扩展助手。把用户意图扩展成 5-15 个同义词/相关关键词（中英文都给），用于在视频字幕中做关键词检索。

用户意图：${ctx.intent}
相关视频标题：${ctx.titles.join("; ")}
相关标签：${ctx.tags.join(", ")}

输出 JSON：{"keywords": ["...", "..."]}
- 给原词的同义词、变体、英中互译
- 给领域相关的核心术语（如"attention" → "self-attention", "Q K V"）
- 不要太泛（避免"机器学习"这种无意义宽词）`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { object } = await (generateObject as any)({
      model: await getAIModel(),
      schema: Schema,
      mode: "json",
      prompt,
    });

    const keywords = object.keywords as string[];
    CACHE.set(key, { keywords, expiresAt: Date.now() + TTL_MS });
    prune();

    const expanded = keywords.flatMap((k: string) => tokenize(k));
    return Array.from(new Set([...baseTokens, ...expanded]));
  } catch (err) {
    console.warn("[intent] LLM expansion failed, falling back to raw tokens:", err);
    return baseTokens;
  }
}
