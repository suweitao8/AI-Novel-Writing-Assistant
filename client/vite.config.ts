import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

interface DesktopPackageJson {
  version?: unknown;
}

function clearStaleOptimizeCache(rootDir: string): void {
  const cacheDir = path.resolve(rootDir, "node_modules/.vite");
  const depsDir = path.join(cacheDir, "deps");
  const metadataPath = path.join(depsDir, "_metadata.json");
  if (!fs.existsSync(metadataPath)) {
    return;
  }

  try {
    const rawMetadata = fs.readFileSync(metadataPath, "utf8");
    const metadata = JSON.parse(rawMetadata) as {
      optimized?: Record<string, { src?: string }>;
    };
    const hasMissingSource = Object.values(metadata.optimized ?? {}).some((entry) => {
      if (!entry?.src) {
        return false;
      }
      const resolvedSource = path.resolve(depsDir, entry.src);
      return !fs.existsSync(resolvedSource);
    });
    if (!hasMissingSource) {
      return;
    }
  } catch {
    // Broken metadata should be treated the same as stale metadata.
  }

  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.info("[vite] Cleared stale optimize cache because cached dependency sources no longer exist.");
}

// 开发端口固定：服务端端口以 server/.env 的 PORT 为唯一来源（当前 3100），
// 避免代理目标和服务端实际端口漂移导致 ECONNREFUSED。
function resolveDevServerPort(): number {
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0) {
    return envPort;
  }
  try {
    const serverEnv = fs.readFileSync(path.resolve(__dirname, "../server/.env"), "utf8");
    const match = /^\s*PORT=(\d+)\s*$/m.exec(serverEnv);
    if (match) {
      return Number(match[1]);
    }
  } catch {
    // server/.env 缺失时使用固定默认端口。
  }
  return 3100;
}

function resolveDevProxyTarget(): string {
  const configuredHost = process.env.HOST?.trim();
  const port = resolveDevServerPort();
  const targetHost = configuredHost && !["0.0.0.0", "::"].includes(configuredHost)
    ? configuredHost
    : "127.0.0.1";
  return `http://${targetHost}:${port}`;
}

function resolveDesktopAppVersion(): string {
  const desktopPackagePath = path.resolve(__dirname, "../desktop/package.json");
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8")) as DesktopPackageJson;
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`desktop/package.json version must be stable semver like 0.3.19, got ${version || "(empty)"}.`);
  }
  return version;
}

clearStaleOptimizeCache(__dirname);

const isDesktopRelativeBaseBuild = process.env.AI_NOVEL_CLIENT_BASE === "relative";
const appVersion = resolveDesktopAppVersion();

export default defineConfig({
  base: isDesktopRelativeBaseBuild ? "./" : "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ai-novel/shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@assistant-ui") || id.includes("@langchain/langgraph-sdk")) {
            return "assistant-ui";
          }
          if (id.includes("platejs") || id.includes("@platejs")) {
            return "plate-editor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
    // 前端开发端口固定 5173：被占用时报错退出而不是自动切到 5174，
    // 先结束占用进程再重启（见 AGENTS.md Development Ports）。
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: resolveDevProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
