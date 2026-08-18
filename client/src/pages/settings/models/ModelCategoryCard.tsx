import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, KeyRound, Loader2, PlugZap, Save } from "lucide-react";
import type { ModelCategoryStatus } from "@/api/settings";
import { refreshProviderModelList, saveAPIKeySetting, testAudioSpeechConnection, testLLMConnection } from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function formatConnectionTestResult(response: Awaited<ReturnType<typeof testLLMConnection>>): string {
  const latency = response.data?.latency ?? 0;
  const plain = response.data?.plain;
  const structured = response.data?.structured;
  const plainText = plain
    ? plain.ok
      ? `普通文本连通正常${plain.latency != null ? ` (${plain.latency}ms)` : ""}`
      : `普通文本连通失败${plain.error ? `：${plain.error}` : ""}`
    : "普通文本连通未检测";
  const structuredText = structured
    ? structured.ok
      ? `结构化输出正常${structured.strategy ? `，策略 ${structured.strategy}` : ""}`
      : `结构化输出失败${structured.errorCategory ? `，分类 ${structured.errorCategory}` : ""}${structured.error ? `：${structured.error}` : ""}`
    : "结构化输出未检测";
  return `连接成功，总耗时 ${latency}ms · ${plainText} · ${structuredText}`;
}

interface ModelCategoryCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: ModelCategoryStatus | undefined;
  isImageCategory?: boolean;
  isAudioCategory?: boolean;
  onSaved?: () => void | Promise<void>;
}

interface CategoryFormState {
  apiKey: string;
  model: string;
  baseURL: string;
  reasoningEnabled: boolean;
}

export default function ModelCategoryCard(props: ModelCategoryCardProps) {
  const { icon, title, description, status, isImageCategory = false, isAudioCategory = false, onSaved } = props;
  const [form, setForm] = useState<CategoryFormState>({ apiKey: "", model: "", baseURL: "", reasoningEnabled: true });
  const [hydratedFor, setHydratedFor] = useState("");
  const [testResult, setTestResult] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!status || hydratedFor === status.provider) {
      return;
    }
    setHydratedFor(status.provider);
    setForm({
      apiKey: "",
      model: status.currentModel || status.defaultModel,
      baseURL: status.currentBaseURL || status.defaultBaseURL,
      reasoningEnabled: status.reasoningEnabled ?? true,
    });
    setTestResult("");
    setSaveMessage("");
  }, [hydratedFor, status]);

  const modelOptions = (status?.models ?? []).filter((model) => model && model !== form.model);

  const isTextCategory = !isImageCategory && !isAudioCategory;
  const saveMutation = useMutation({
    mutationFn: () => saveAPIKeySetting(status!.provider, {
      key: form.apiKey.trim() || undefined,
      model: form.model.trim(),
      baseURL: form.baseURL.trim(),
      ...(isImageCategory ? { imageModel: form.model.trim() } : {}),
      ...(isTextCategory ? { reasoningEnabled: form.reasoningEnabled } : {}),
    }),
    onSuccess: async (response) => {
      setSaveMessage(response.message ?? "保存成功。");
      setForm((prev) => ({ ...prev, apiKey: "" }));
      await onSaved?.();
    },
    onError: (error) => {
      setSaveMessage(error instanceof Error ? error.message : "保存失败。");
    },
  });

  const testMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (isImageCategory) {
        // 图片通道没有对话接口：测试 = 检查通道可达并拉取可用模型列表。
        const response = await refreshProviderModelList(status!.provider);
        const models = response.data?.models ?? [];
        return `图片通道连接正常${models.length ? `，可用模型：${models.join("、")}` : ""}。`;
      }
      if (isAudioCategory) {
        // 音频通道没有对话接口：测试 = 合成一句固定短语，验证地址、密钥与模型整体可用。
        const response = await testAudioSpeechConnection({
          provider: status!.provider,
          apiKey: form.apiKey.trim() || undefined,
          model: form.model.trim() || undefined,
          baseURL: form.baseURL.trim() || undefined,
        });
        const probe = response.data;
        return `音频通道连接正常，测试语音已生成（${probe?.byteLength ?? 0} 字节，耗时 ${probe?.latencyMs ?? 0}ms）。`;
      }
      const response = await testLLMConnection({
        provider: status!.provider,
        apiKey: form.apiKey.trim() || undefined,
        model: form.model.trim() || undefined,
        baseURL: form.baseURL.trim() || undefined,
        probeMode: "both",
      });
      return formatConnectionTestResult(response);
    },
    onSuccess: (message) => {
      setTestResult(message);
    },
    onError: (error) => {
      setTestResult(error instanceof Error ? error.message : "连接测试失败。");
    },
  });

  const requiresApiKey = status?.requiresApiKey !== false;
  const hasSavedKey = status?.hasApiKey === true;
  // 订阅通道（本机桥 + 已有生效密钥）：不展示密钥输入框，直接说明使用订阅额度。
  const usesLocalSubscription = status?.usesLocalSubscription === true && hasSavedKey;
  const canSubmit = Boolean(
    status
    && form.model.trim()
    && form.baseURL.trim()
    && (usesLocalSubscription || !requiresApiKey || form.apiKey.trim() || hasSavedKey),
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {icon}
          {title}
          {status ? (
            <Badge variant={status.isConfigured ? "default" : "outline"}>
              {status.isConfigured ? `当前模型 ${status.currentModel || "未选择"}` : "未配置"}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usesLocalSubscription ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm leading-6 text-emerald-800">
            <BadgeCheck className="mt-1 h-4 w-4 shrink-0" />
            <div>
              已连接本机订阅通道：直接使用已登录订阅的额度进行生成，不需要填写 API Key。
            </div>
          </div>
        ) : (
          <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" />
              API Key
              {requiresApiKey ? "" : "（可选）"}
            </span>
            <Input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              placeholder={hasSavedKey ? "留空则继续使用已保存的 Key" : requiresApiKey ? "输入 API Key" : "本地接口可以留空"}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">服务地址</span>
          <Input
            value={form.baseURL}
            placeholder="例如 http://127.0.0.1:18762/v1"
            onChange={(event) => setForm((prev) => ({ ...prev, baseURL: event.target.value }))}
          />
        </label>
        {modelOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {[form.model, ...modelOptions].filter(Boolean).map((model) => (
              <button
                key={model}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  form.model === model && "border-primary bg-primary/10 text-primary",
                )}
                onClick={() => setForm((prev) => ({ ...prev, model }))}
              >
                {model}
              </button>
            ))}
          </div>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {isImageCategory ? "图片模型" : isAudioCategory ? "音频模型" : "文本模型"}
          </span>
          <Input
            value={form.model}
            placeholder="选择上方模型，或直接填写模型名称"
            onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
          />
        </label>
        {isTextCategory ? (
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium">思考模式</div>
              <div className="text-xs leading-5 text-muted-foreground">
                开启后模型会先推理再输出，结构更稳但耗时更长；追求生成速度可以关闭。部分模型和本机订阅通道不提供思考模式，关闭后不会影响这些通道。
              </div>
            </div>
            <Switch
              checked={form.reasoningEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, reasoningEnabled: checked }))}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
            {saveMessage ? <div>{saveMessage}</div> : null}
            {testResult ? <div>{testResult}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !status || !form.model.trim() || !form.baseURL.trim()}
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {testMutation.isPending ? "测试中..." : "测试连接"}
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !canSubmit}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
