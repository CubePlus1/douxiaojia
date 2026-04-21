import { NextRequest, NextResponse } from "next/server";
import { batchExtractInputSchema } from "@/lib/validators/videoInput";
import { runBatchExtract } from "@/lib/batch/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.warn(
      "[batch-extract] failed to parse request body:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "请求格式不正确" },
      { status: 400 }
    );
  }

  const parsed = batchExtractInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "URL 列表校验失败" },
      { status: 422 }
    );
  }

  try {
    const result = await runBatchExtract(parsed.data.urls);
    if (result.successCount === 0) {
      return NextResponse.json(
        { ...result, error: "所有视频都抽取失败" },
        { status: 422 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[batch-extract]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量抽取失败" },
      { status: 500 }
    );
  }
}
