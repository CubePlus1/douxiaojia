/**
 * 共享的 yt-dlp 调用 + 字幕挑选 + 下载解析逻辑。
 * Bilibili / YouTube 两个 Extractor 都走这里。
 */

import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import youtubedl from "youtube-dl-exec";
import { ExtractError } from "@/lib/extractor/errors";
import { parseSubtitle } from "@/lib/extractor/subtitle";
import type {
  ExtractOptions,
  ExtractPlatform,
  ExtractResult,
  SubtitleFormat,
} from "@/lib/extractor/types";

export const DEFAULT_TIMEOUT_MS = 90_000;
const SOCKET_TIMEOUT_S = 15; // 单次网络请求最多等 15s，避免被 CDN 卡死
const SUBTITLE_EXT_PRIORITY: readonly SubtitleFormat[] = ["srt", "vtt", "json"];

type SubtitleTrack = { ext?: string; name?: string; url?: string };
type SubtitleMap = Record<string, SubtitleTrack[] | undefined>;

export interface YtDlpInfo {
  _type?: string;
  title?: string;
  uploader?: string;
  description?: string;
  duration?: number;
  tags?: string[];
  webpage_url?: string;
  thumbnail?: string;
  subtitles?: SubtitleMap;
  automatic_captions?: SubtitleMap;
  entries?: YtDlpInfo[];
}

interface SelectedSubtitle {
  lang: string;
  ext: SubtitleFormat;
  url: string;
  isAuto: boolean;
}

export interface RunYtDlpOptions {
  platform: ExtractPlatform;
  defaultSubtitleLangs: string[];
  defaultCookiesEnv?: string; // 如 "BILIBILI_COOKIES"
  /** 当用户填的是 cookie 字符串（如 SESSDATA=xxx）时，写 Netscape 文件用的 domain */
  cookieDomain?: string;
  /** 平台对应的代理环境变量名，如 "YOUTUBE_PROXY"。未设或值为空 → 直连。 */
  proxyEnv?: string;
  /** 平台特定：Bilibili 分 P 时传 "1"/"2"... */
  playlistItems?: string;
  /** 多视频响应时（播放列表/分 P）挑第几项，1-based */
  entryIndex?: number;
}

function resolveTimeoutMs(options?: ExtractOptions): number {
  const fromEnv = Number(process.env.VIDEO_EXTRACT_TIMEOUT);
  if (typeof options?.timeoutMs === "number" && options.timeoutMs > 0) {
    return options.timeoutMs;
  }
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_TIMEOUT_MS;
}

function resolveSubtitleLangs(
  options: ExtractOptions | undefined,
  fallback: string[]
): string[] {
  const langs = options?.subtitleLangs?.map((l) => l.trim()).filter(Boolean);
  return langs && langs.length > 0 ? langs : [...fallback];
}

function buildSubLangs(langs: string[]): string {
  // 永远过滤弹幕（Bilibili 才有，但对 YouTube 无害）
  return Array.from(new Set([...langs, "-danmaku"])).join(",");
}

function resolveCookies(
  options: ExtractOptions | undefined,
  envVar: string | undefined
): string | undefined {
  const fromOpt = options?.cookies?.trim();
  if (fromOpt) return fromOpt;
  if (envVar) {
    const fromEnv = process.env[envVar]?.trim();
    if (fromEnv) return fromEnv;
  }
  return undefined;
}

function normalizeSubtitleExt(ext?: string): SubtitleFormat | null {
  const e = ext?.trim().toLowerCase();
  if (!e) return null;
  if (e === "srt") return "srt";
  if (e === "vtt" || e === "webvtt") return "vtt";
  if (e === "json" || e.startsWith("json")) return "json";
  return null;
}

function isDanmakuLang(lang: string): boolean {
  return lang.toLowerCase().includes("danmaku");
}

function matchesPreferredLang(candidate: string, preferred: string): boolean {
  const c = candidate.toLowerCase();
  const p = preferred.toLowerCase();
  return c === p || c.startsWith(`${p}-`) || p.startsWith(`${c}-`);
}

function pickTrack(
  lang: string,
  tracks: SubtitleTrack[] | undefined,
  isAuto: boolean
): SelectedSubtitle | null {
  if (!tracks || tracks.length === 0 || isDanmakuLang(lang)) return null;

  const candidates = tracks
    .map((t) => {
      const ext = normalizeSubtitleExt(t.ext);
      if (!t.url || !ext) return null;
      return { lang, ext, url: t.url, isAuto } satisfies SelectedSubtitle;
    })
    .filter((x): x is SelectedSubtitle => x !== null)
    .sort(
      (l, r) =>
        SUBTITLE_EXT_PRIORITY.indexOf(l.ext) -
        SUBTITLE_EXT_PRIORITY.indexOf(r.ext)
    );

  return candidates[0] ?? null;
}

function pickFromMap(
  subs: SubtitleMap | undefined,
  preferred: string[],
  isAuto: boolean
): SelectedSubtitle | null {
  if (!subs) return null;
  const entries = Object.entries(subs).filter(([l]) => !isDanmakuLang(l));

  for (const pref of preferred) {
    const match = entries.find(([l]) => matchesPreferredLang(l, pref));
    if (match) {
      const sub = pickTrack(match[0], match[1], isAuto);
      if (sub) return sub;
    }
  }

  for (const [lang, tracks] of entries) {
    const sub = pickTrack(lang, tracks, isAuto);
    if (sub) return sub;
  }
  return null;
}

export function pickBestSubtitle(
  info: YtDlpInfo,
  preferredLangs: string[],
  allowAutoSubs: boolean
): SelectedSubtitle | null {
  const manual = pickFromMap(info.subtitles, preferredLangs, false);
  if (manual) return manual;
  if (!allowAutoSubs) return null;
  return pickFromMap(info.automatic_captions, preferredLangs, true);
}

function pickVideoInfo(info: YtDlpInfo, entryIndex?: number): YtDlpInfo | null {
  if (!Array.isArray(info.entries) || info.entries.length === 0) return info;
  if (entryIndex && info.entries[entryIndex - 1]) {
    return info.entries[entryIndex - 1];
  }
  return info.entries[0] ?? null;
}

function trimString(v?: string): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

/**
 * yt-dlp 的 --cookies 只接 Netscape 格式文件路径。
 * 用户在 .env 里填的通常是直接从浏览器拷的 "SESSDATA=xxx; bili_jct=yyy" 形式。
 * 这里把字符串转成临时 cookie 文件，调用完由调用方清理临时目录。
 *
 * 如果用户传的本身就是已存在的文件路径（比如自己导出了 cookies.txt），直接用。
 */
async function materializeCookies(
  raw: string | undefined,
  domain: string | undefined,
  workDir: string
): Promise<string | undefined> {
  if (!raw) return undefined;
  if (existsSync(raw)) return raw; // 已经是文件路径
  if (!domain) return undefined; // 没声明 domain 就转不了，避免乱发 cookie

  const lines: string[] = [
    "# Netscape HTTP Cookie File",
    "# Generated by FavToSkill",
  ];

  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || !value) continue;
    // domain  includeSubdomains  path  secure  expiration  name  value
    // expiration=0 → session cookie；yt-dlp 仍会读取
    lines.push(`${domain}\tTRUE\t/\tFALSE\t0\t${name}\t${value}`);
  }

  const file = path.join(workDir, "cookies.txt");
  await writeFile(file, lines.join("\n"), "utf-8");
  return file;
}

// 找到临时目录里 yt-dlp 写下的字幕文件（只期望一个，因为第二阶段只下选中的那一种语言）。
async function findDownloadedSubtitleFile(
  dir: string
): Promise<{ filePath: string; ext: SubtitleFormat; lang: string } | null> {
  const files = await readdir(dir);
  for (const filename of files) {
    // 典型命名：<videoId>.<lang>.<ext>，例如  BV12345.zh-Hans.srt
    const match = filename.match(/\.([a-zA-Z][\w-]*)\.(srt|vtt|json)$/i);
    if (!match) continue;
    const lang = match[1];
    if (isDanmakuLang(lang)) continue;
    const ext = normalizeSubtitleExt(match[2]);
    if (!ext) continue;
    return { filePath: path.join(dir, filename), ext, lang };
  }
  return null;
}

/**
 * 执行 yt-dlp，挑字幕，下载解析，返回 ExtractResult。
 * 各个平台 Extractor 只负责 URL 识别 + 传平台特定参数（cookies env、分 P 索引）。
 *
 * 两阶段调用：
 *   Phase 1: --dump-single-json 拿元数据（只模拟，不下任何东西）→ 挑选最佳字幕
 *   Phase 2: --skip-download --write-sub 下选中的那一种语言 → 读文件解析
 *
 * 为什么分两步：-J 标志会让 yt-dlp 进入"纯 simulate"模式，连 --write-sub 也不会执行。
 * 把两个需求分到两次调用，既有元数据又有字幕文件。不自己 fetch 字幕 URL——
 * YouTube 字幕走 Google CDN，国内网络直连容易 TLS 重置，靠 yt-dlp 走 impersonate 等机制更稳。
 */
export async function runExtract(
  url: string,
  userOptions: ExtractOptions | undefined,
  cfg: RunYtDlpOptions
): Promise<ExtractResult> {
  const timeoutMs = resolveTimeoutMs(userOptions);
  const subtitleLangs = resolveSubtitleLangs(userOptions, cfg.defaultSubtitleLangs);
  const allowAutoSubs = userOptions?.allowAutoSubs ?? true;
  const rawCookies = resolveCookies(userOptions, cfg.defaultCookiesEnv);
  const proxy = cfg.proxyEnv ? process.env[cfg.proxyEnv]?.trim() || undefined : undefined;

  // 临时目录：cookie 文件 + Phase 2 下载的字幕都落这里
  const workDir = await mkdtemp(path.join(tmpdir(), "fts-extract-"));
  try {
    // 把 cookie 字符串转成 Netscape 文件（yt-dlp --cookies 只接文件路径）
    const cookies = await materializeCookies(
      rawCookies,
      cfg.cookieDomain,
      workDir
    );

    // ─── Phase 1: 取元数据 ────────────────────────────
    // --ignore-no-formats-error：B 站某些视频对当前 yt-dlp 抽不到 video format
    // （编码 / DRM / WBI），但元数据和字幕清单仍可拿到。我们只关心字幕，
    // 不下载视频本体，所以跳过这个错误继续走。
    const info = (await youtubedl(
      url,
      {
        dumpSingleJson: true,
        skipDownload: true,
        writeSub: true,
        writeAutoSub: allowAutoSubs,
        subLang: buildSubLangs(subtitleLangs),
        subFormat: "srt/vtt/json/best",
        noWarnings: true,
        // dargs camelCase → --ignore-no-formats-error
        ["ignore-no-formats-error" as never]: true,
        socketTimeout: SOCKET_TIMEOUT_S,
        retries: 2,
        playlistItems: cfg.playlistItems,
        cookies,
        proxy,
      },
      { timeout: timeoutMs, killSignal: "SIGKILL" }
    )) as YtDlpInfo;

    const videoInfo = pickVideoInfo(info, cfg.entryIndex);

    // entries: [null] —— 例如某些合订视频元数据解析失败
    if (!videoInfo) {
      throw new ExtractError("NO_SUBTITLE");
    }

    const subtitle = pickBestSubtitle(videoInfo, subtitleLangs, allowAutoSubs);
    if (!subtitle) {
      throw new ExtractError("NO_SUBTITLE");
    }

    // ─── Phase 2: 下载选中的字幕 ─────────────────────
    await youtubedl(
      url,
      {
        skipDownload: true,
        // 只开对应类型，避免不必要的请求 / 429
        writeSub: !subtitle.isAuto,
        writeAutoSub: subtitle.isAuto,
        subLang: subtitle.lang,
        subFormat: subtitle.ext,
        noWarnings: true,
        ["ignore-no-formats-error" as never]: true,
        socketTimeout: SOCKET_TIMEOUT_S,
        retries: 2,
        output: "%(id)s.%(ext)s",
        paths: workDir,
        playlistItems: cfg.playlistItems,
        cookies,
        proxy,
      },
      { timeout: timeoutMs, killSignal: "SIGKILL" }
    );

    const downloaded = await findDownloadedSubtitleFile(workDir);
    if (!downloaded) {
      throw new ExtractError("EXTRACTOR_FAILED");
    }

    const raw = await readFile(downloaded.filePath, "utf-8");
    const transcript = parseSubtitle(raw, downloaded.ext);
    if (!transcript.trim()) {
      throw new ExtractError("NO_SUBTITLE");
    }

    return {
      title: trimString(videoInfo.title) ?? "未命名视频",
      author: trimString(videoInfo.uploader),
      description: trimString(videoInfo.description),
      duration:
        typeof videoInfo.duration === "number" && videoInfo.duration > 0
          ? Math.round(videoInfo.duration)
          : undefined,
      tags: Array.isArray(videoInfo.tags)
        ? videoInfo.tags.map((t) => t.trim()).filter(Boolean)
        : [],
      url: trimString(videoInfo.webpage_url) ?? url,
      platform: cfg.platform,
      transcript,
      thumbnailUrl: trimString(videoInfo.thumbnail),
      subtitleMeta: {
        lang: subtitle.lang,
        source: subtitle.isAuto ? "auto" : "manual",
        format: subtitle.ext,
        isAuto: subtitle.isAuto,
      },
      raw: process.env.NODE_ENV === "development" ? info : undefined,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {
      /* 清理失败不影响主流程 */
    });
  }
}
