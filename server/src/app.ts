import "dotenv/config";
import type { Server } from "node:http";
import os from "node:os";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { ensureRuntimeDatabaseReady } from "./db/runtimeMigrations";
import { healInterruptedImageGenerationStates } from "./services/image/runtime/interruptedStateHealer";
import { recoverInterruptedDramaBatchJobs } from "./services/drama/production/batchJobRecovery";
import { errorHandler } from "./middleware/errorHandler";
import { loadProviderApiKeys } from "./llm/factory";
import astrologyRouter from "./modules/astrology/http/astrologyRoutes";
import agentCatalogRouter from "./agents/http/agentCatalogRoutes";
import agentRunsRouter from "./agents/http/agentRunsRoutes";
import autoDirectorChannelCallbacksRouter from "./services/novel/director/http/autoDirectorChannelCallbackRoutes";
import autoDirectorFollowUpsRouter from "./services/novel/director/http/autoDirectorFollowUpRoutes";
import bookAnalysisRouter from "./modules/bookAnalysis/http/bookAnalysisRoutes";
import characterRouter from "./modules/character/http/characterRoutes";
import characterConversationRouter from "./modules/characterConversation/http/characterConversationRoutes";
import chatRouter from "./creativeHub/http/chatRoutes";
import creativeHubRouter from "./creativeHub/http/creativeHubRoutes";
import genreRouter from "./modules/genre/http/genreRoutes";
import healthRouter from "./platform/http/healthRoutes";
import imagesRouter from "./modules/image/http/imageRoutes";
import knowledgeRouter from "./modules/knowledge/http/knowledgeRoutes";
import llmRouter from "./platform/llm/http/llmRoutes";
import llmLiveRouter from "./platform/llm/live/http/llmLiveRoutes";
import novelRouter from "./modules/novel/http/novel";
import creationStudioRouter from "./modules/novel/creation-studio/http/creationStudioRoutes";
import { shortStoryProductionService } from "./modules/novel/short-story/application/ShortStoryProductionService";
import dramaRouter from "./modules/drama/http/dramaRoutes";
import comicRouter from "./modules/comic/http/comicRoutes";
import novelDirectorRouter from "./services/novel/director/http/novelDirector";
import novelExportRouter from "./modules/export/http/novelExport";
import novelWorkflowsRouter from "./services/novel/director/http/novelWorkflows";
import promptWorkbenchRouter from "./prompting/http/promptWorkbenchRoutes";
import ragRouter from "./modules/rag/http/ragRoutes";
import settingsAutoDirectorRouter from "./modules/settings/http/settingsAutoDirectorRoutes";
import settingsRouter from "./modules/settings/http/settingsRoutes";
import styleEngineRouter from "./modules/styleEngine/http/styleEngineRoutes";
import styleEngineExtractionRouter from "./modules/styleEngine/http/styleEngineExtractionRoutes";
import storyModeRouter from "./modules/storyMode/http/storyModeRoutes";
import tasksRouter from "./modules/task/http/taskRoutes";
import titleLibraryRouter from "./modules/titleLibrary/http/titleLibraryRoutes";
import visualStyleRouter from "./modules/visual-style/http/visualStyleRoutes";
import worldRouter from "./modules/setup/world/http";
import writingFormulaRouter from "./modules/writingFormula/http/writingFormulaRoutes";
import { novelEventBus, registerNovelEventHandlers } from "./events";
import { bookAnalysisService } from "./services/bookAnalysis/BookAnalysisService";
import { ragServices } from "./services/rag";
import { getSharedNovelServices } from "./services/novel/application/sharedNovelServices";
import { novelSideEffectWorker } from "./events/sideEffects";
import { NovelPipelineRuntimeService } from "./services/novel/runtime/NovelPipelineRuntimeService";
import { recoveryTaskService } from "./services/task/RecoveryTaskService";
import {
  ensureSystemResourceStarterData,
  hasSystemResourceBootstrapChanges,
} from "./services/bootstrap/SystemResourceBootstrapService";
import { initializeRagSettingsCompatibility } from "./services/settings/RagCompatibilityBootstrapService";
import onboardingRoutes from "./modules/setup/onboarding/http/onboardingRoutes";
import { qualityDebtSettingsService } from "./services/settings/QualityDebtSettingsService";
import { DirectorWorker } from "./workers/directorWorker";
import { cleanupLogDirectory, resolveLogRetentionConfig } from "./platform/logging/logRetention";
import { resolveLogsRoot } from "./runtime/appPaths";

getSharedNovelServices();
registerNovelEventHandlers(novelEventBus);
const novelPipelineRuntimeService = new NovelPipelineRuntimeService();

morgan.token("error-message", (_req, res) => {
  const response = res as typeof res & {
    locals?: {
      requestErrorMessage?: unknown;
    };
  };
  const errorMessage = response.locals?.requestErrorMessage;
  return typeof errorMessage === "string" ? errorMessage.trim() : "";
});

function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

export function createApp() {
  getSharedNovelServices();
  const app = express();
  const jsonBodyLimit = process.env.API_JSON_LIMIT ?? "20mb";
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsAllowList = corsOriginEnv
    ? corsOriginEnv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

  const allowLan = parseEnvFlag(process.env.ALLOW_LAN, process.env.NODE_ENV !== "production");
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const isListedOrigin = corsAllowList.includes(origin);
        const isLocalhostDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
        const isLanOrigin = allowLan && /^https?:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d+$/.test(origin);
        callback(null, isListedOrigin || isLocalhostDevOrigin || isLanOrigin);
      },
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(morgan((tokens, req, res) => {
    const method = tokens.method(req, res) ?? "-";
    const url = tokens.url(req, res) ?? "-";
    const status = tokens.status(req, res) ?? "-";
    const responseTime = tokens["response-time"](req, res) ?? "0";
    const contentLength = tokens.res(req, res, "content-length") ?? "0";
    const errorMessage = tokens["error-message"](req, res);
    const errorSuffix = errorMessage ? ` | error: ${errorMessage}` : "";
    return `${method} ${url} ${status} ${responseTime} ms - ${contentLength}${errorSuffix}`;
  }));
  app.use(express.json({ limit: jsonBodyLimit }));

  app.use("/api/health", healthRouter);
  app.use("/api/agent-catalog", agentCatalogRouter);
  app.use("/api/agent-runs", agentRunsRouter);
  app.use("/api/book-analysis", bookAnalysisRouter);
  app.use("/api/genres", genreRouter);
  app.use("/api/story-modes", storyModeRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/llm-live", llmLiveRouter);
  app.use("/api/title-library", titleLibraryRouter);
  app.use("/api", styleEngineRouter);
  app.use("/api", styleEngineExtractionRouter);
  app.use("/api/novels", novelRouter);
  app.use("/api/creation-studio", creationStudioRouter);
  app.use("/api/novels/director", novelDirectorRouter);
  app.use("/api/novel-workflows", novelWorkflowsRouter);
  app.use("/api/novels", novelExportRouter);
  app.use("/api/drama", dramaRouter);
  app.use("/api/comic", comicRouter);
  app.use("/api/worlds", worldRouter);
  app.use("/api/rag", ragRouter);
  app.use("/api/base-characters", characterRouter);
  app.use("/api/character-conversations", characterConversationRouter);
  app.use("/api/writing-formula", writingFormulaRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/creative-hub", creativeHubRouter);
  app.use("/api/prompt-workbench", promptWorkbenchRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/visual-styles", visualStyleRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/auto-director/follow-ups", autoDirectorFollowUpsRouter);
  app.use("/api/settings/auto-director", settingsAutoDirectorRouter);
  app.use("/api/auto-director/channel-callbacks", autoDirectorChannelCallbacksRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api", onboardingRoutes);
  app.use("/api/astrology", astrologyRouter);

  app.use((_req, res) => {
    const response: ApiResponse<null> = {
      success: false,
      error: "接口不存在。",
    };
    res.status(404).json(response);
  });

  app.use(errorHandler);

  return app;
}

function getLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return null;
}

function createServerUrl(host: string, port: number): string {
  if (host === "0.0.0.0" || host === "::") {
    return `http://localhost:${port}`;
  }
  return host.includes(":") ? `http://[${host}]:${port}` : `http://${host}:${port}`;
}

export interface ServerStartOptions {
  host?: string;
  port?: number;
  allowLan?: boolean;
}

export interface StartedServer {
  app: express.Express;
  server: Server;
  host: string;
  port: number;
  allowLan: boolean;
  url: string;
  close: () => Promise<void>;
}

interface BackgroundServicesHandle {
  stop: () => Promise<void>;
}

function resolveServerStartOptions(options?: ServerStartOptions): {
  host: string;
  port: number;
  allowLan: boolean;
} {
  const allowLan = options?.allowLan ?? parseEnvFlag(process.env.ALLOW_LAN, process.env.NODE_ENV !== "production");
  return {
    allowLan,
    port: options?.port ?? Number(process.env.PORT ?? 3000),
    host: options?.host ?? process.env.HOST ?? (allowLan ? "0.0.0.0" : "localhost"),
  };
}

function logServerReady(host: string, port: number): void {
  console.log(`[server] listening on http://localhost:${port}`);
  if (host === "0.0.0.0" || host === "::") {
    const lanIp = getLanIp();
    if (lanIp) {
      console.log(`[server] LAN: http://${lanIp}:${port}`);
    }
  }
}

function scheduleLogRetentionCleanup(): void {
  setImmediate(() => {
    try {
      const summary = cleanupLogDirectory(resolveLogsRoot(), resolveLogRetentionConfig());
      if (summary.deletedFiles > 0 || summary.failedFiles > 0) {
        console.info("[server.logs] cleanup completed.", {
          deletedFiles: summary.deletedFiles,
          deletedBytes: summary.deletedBytes,
          failedFiles: summary.failedFiles,
        });
      }
      for (const failure of summary.failures.slice(0, 5)) {
        console.warn("[server.logs] cleanup failed for file.", failure);
      }
    } catch (error) {
      console.warn("[server.logs] cleanup skipped.", error);
    }
  });
}

function initializeBackgroundServices(): BackgroundServicesHandle {
  ragServices.ragWorker.start();
  ragServices.ragRetrievalTraceRetention.start();
  novelSideEffectWorker.start();
  const directorWorker = new DirectorWorker();
  void directorWorker.start().catch((error) => {
    console.error("[director.worker] unexpected stop", error);
  });
  const recoveryInitialization = recoveryTaskService.initializePendingRecoveries();
  void shortStoryProductionService.recoverPending().catch((error) => {
    console.warn("[short-story] failed to resume pending production.", error);
  });

  void loadProviderApiKeys().catch((error) => {
    console.warn("数据库中的模型密钥加载失败，已回退到环境变量。", error);
  });

  void ensureSystemResourceStarterData()
    .then((systemResourceReport) => {
      if (hasSystemResourceBootstrapChanges(systemResourceReport)) {
        console.log("[server] built-in creative resources bootstrapped.", systemResourceReport);
      }
    })
    .catch((error) => {
      console.warn("Failed to bootstrap built-in creative resources.", error);
    });

  void recoveryInitialization
    .then(() => {
      bookAnalysisService.startWatchdog();
      novelPipelineRuntimeService.startWatchdog();
    })
    .catch((error) => {
      console.warn("Failed to prepare pending recovery candidates.", error);
      bookAnalysisService.startWatchdog();
      novelPipelineRuntimeService.startWatchdog();
    });

  return {
    stop: async () => {
      directorWorker.stop();
      novelSideEffectWorker.stop();
      ragServices.ragWorker.stop();
      ragServices.ragRetrievalTraceRetention.stop();
      bookAnalysisService.stopWatchdog();
      novelPipelineRuntimeService.stopWatchdog();
    },
  };
}

export async function startServer(options?: ServerStartOptions): Promise<StartedServer> {
  scheduleLogRetentionCleanup();
  await ensureRuntimeDatabaseReady();
  void healInterruptedImageGenerationStates().catch((error) => {
    console.warn("[server] failed to heal interrupted image generation states.", error);
  });
  try {
    // 恢复必须在开始监听端口前完成：否则新请求创建的任务可能被启动清理误判为上一进程遗留任务。
    await recoverInterruptedDramaBatchJobs();
  } catch (error) {
    console.warn("[server] failed to recover interrupted drama batch jobs.", error);
  }

  const ragCompatibilityReport = await initializeRagSettingsCompatibility();
  if (
    ragCompatibilityReport.importedSettingKeys.length > 0
    || ragCompatibilityReport.importedProviderRecords.length > 0
  ) {
    console.log("[server] imported legacy RAG env settings.", ragCompatibilityReport);
  }
  await qualityDebtSettingsService.warnIfAutoPromotionEnabled().catch((error) => {
    console.warn("[server] failed to inspect pending review auto-promotion settings.", error);
  });

  const app = createApp();
  const { host, port, allowLan } = resolveServerStartOptions(options);

  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = app.listen(port, host, () => resolve(listeningServer));
    listeningServer.once("error", reject);
  });
  const backgroundServices = initializeBackgroundServices();

  logServerReady(host, port);

  return {
    app,
    server,
    host,
    port,
    allowLan,
    url: createServerUrl(host, port),
    close: async () => {
      await backgroundServices.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function bootstrap(): Promise<void> {
  await startServer();
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    console.error("[server] bootstrap failed.", error);
    process.exit(1);
  });
}
