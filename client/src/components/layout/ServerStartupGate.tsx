import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { probeStartupHealth } from "./startupHealth";

interface ServerStartupGateProps {
  children: ReactNode;
}

type StartupStatus = "checking" | "ready" | "waiting";

const STARTUP_CHECK_INTERVAL_MS = 1000;
const STARTUP_WAIT_THRESHOLD_MS = 2500;

function shouldUseStartupGate(): boolean {
  return import.meta.env.DEV;
}

function ServerStartupScreen(props: {
  status: StartupStatus;
  diagnostic?: string;
  onRetry: () => void;
}) {
  const { status, diagnostic, onRetry } = props;
  const waiting = status === "waiting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">正在连接本地创作服务</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {waiting ? "本地创作服务尚未响应，系统仍在自动重试。" : "正在等待本地创作服务响应。"}
        </p>
        {waiting && diagnostic ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {diagnostic}
          </p>
        ) : null}
        {waiting ? (
          <div className="mt-6">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              重新检查
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ServerStartupGate({ children }: ServerStartupGateProps) {
  const enabled = useMemo(() => shouldUseStartupGate(), []);
  const [status, setStatus] = useState<StartupStatus>(enabled ? "checking" : "ready");
  const [diagnostic, setDiagnostic] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled || status === "ready") {
      return;
    }

    const abortController = new AbortController();
    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    timeoutId = window.setTimeout(() => {
      setStatus((current) => (current === "ready" ? current : "waiting"));
    }, STARTUP_WAIT_THRESHOLD_MS);

    async function probe() {
      const result = await probeStartupHealth(`${API_BASE_URL}/health`, abortController.signal);
      if (abortController.signal.aborted) {
        return;
      }
      if (result.ready) {
        setStatus("ready");
        setDiagnostic(undefined);
      } else if (result.diagnostic) {
        setDiagnostic(result.diagnostic);
      }
    }

    void probe();
    intervalId = window.setInterval(() => {
      void probe();
    }, STARTUP_CHECK_INTERVAL_MS);

    return () => {
      abortController.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, retryToken, status]);

  if (status === "ready") {
    return <>{children}</>;
  }

  return (
    <ServerStartupScreen
      status={status}
      onRetry={() => {
        setStatus("checking");
        setDiagnostic(undefined);
        setRetryToken((current) => current + 1);
      }}
      diagnostic={diagnostic}
    />
  );
}
