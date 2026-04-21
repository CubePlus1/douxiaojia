import type { BatchItem, BatchResult } from "./types";

export async function runBatchExtract(
  urls: string[],
  onProgress?: (item: BatchItem) => void
): Promise<BatchResult> {
  const { extractFromUrl } = await import("@/lib/extractor/registry");
  const items: BatchItem[] = urls.map((url) => ({ url, status: "pending" }));
  let success = 0;
  let failure = 0;

  for (let i = 0; i < items.length; i++) {
    items[i] = { ...items[i], status: "extracting" };
    onProgress?.(items[i]);
    try {
      const result = await extractFromUrl(items[i].url);
      items[i] = { url: items[i].url, status: "done", result };
      success++;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "EXTRACTOR_FAILED";
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[batch/runner] item[${i}] failed url=${items[i].url} code=${code}`,
        err
      );
      items[i] = { url: items[i].url, status: "failed", error: { code, message } };
      failure++;
    }
    onProgress?.(items[i]);
  }

  return { items, successCount: success, failureCount: failure };
}
