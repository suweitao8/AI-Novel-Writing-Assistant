import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

interface ClientPackageJson {
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

// 开发端口按 checkout 车道解析：服务端端口以 server/.env 的 PORT 为唯一来源
// （主工作区 3100，worktree 由 workflow:worktree 写入独立端口），
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

// 前端 dev 服务自身端口同样按车道解析：优先 DEV_CLIENT_PORT 环境变量，
// 其次 server/.env 的 CLIENT_PORT（worktree 创建时写入），主工作区固定 5174。
function resolveDevClientPort(): number {
  const envPort = Number(process.env.DEV_CLIENT_PORT);
  if (Number.isInteger(envPort) && envPort > 0) {
    return envPort;
  }
  try {
    const serverEnv = fs.readFileSync(path.resolve(__dirname, "../server/.env"), "utf8");
    const match = /^\s*CLIENT_PORT=(\d+)\s*$/m.exec(serverEnv);
    if (match) {
      return Number(match[1]);
    }
  } catch {
    // server/.env 缺失时使用固定默认端口。
  }
  return 5174;
}

function resolveDevProxyTarget(): string {
  const configuredHost = process.env.HOST?.trim();
  const port = resolveDevServerPort();
  const targetHost = configuredHost && !["0.0.0.0", "::"].includes(configuredHost)
    ? configuredHost
    : "127.0.0.1";
  return `http://${targetHost}:${port}`;
}

function resolveAppVersion(): string {
  const packageJsonPath = path.resolve(__dirname, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as ClientPackageJson;
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`client/package.json version must be stable semver like 0.1.0, got ${version || "(empty)"}.`);
  }
  return version;
}

clearStaleOptimizeCache(__dirname);

const appVersion = resolveAppVersion();

export default defineConfig({
  base: "/",
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
    // 前端 dev 端口按车道解析：主工作区固定 5174（5173 被本机其他长驻服务占用），
    // worktree 使用其 server/.env 写入的独立端口；被占用时报错退出而不是自动漂移。
    port: resolveDevClientPort(),
    strictPort: true,
    proxy: {
      "/api": {
        target: resolveDevProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
