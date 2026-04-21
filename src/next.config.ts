import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 不让 Turbopack 打包 youtube-dl-exec——它内部用 __dirname 找 yt-dlp 二进制，
  // 打包后路径会指向 .next/chunks 导致二进制找不到、进程立即失败、stderr 为空。
  serverExternalPackages: ["youtube-dl-exec"],

  // 锁定 Turbopack 的工作区根，避免它把 ~/ 下误落的 package-lock.json 当成根。
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
