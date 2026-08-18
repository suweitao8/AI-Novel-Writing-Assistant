import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  PlugZap,
  Sparkles,
} from "lucide-react";
import type {
  CompleteQuickSetupRequest,
  QuickSetupStatus,
} from "@ai-novel/shared/types/onboarding";
import { completeQuickSetup } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLLMStore } from "@/store/llmStore";
import { shouldShowFirstNovelHandoff } from "./creationSetupState";

interface QuickSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: QuickSetupStatus | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  forceConfiguration?: boolean;
}

interface SetupForm {
  apiKey: string;
  baseURL: string;
  model: string;
}

const EMPTY_FORM: SetupForm = {
  apiKey: "",
  baseURL: "",
  model: "",
};

// 新手引导只配置文本模型槽：检测通过后，全部创作任务都会使用这个模型。
export default function QuickSetupDialog(props: QuickSetupDialogProps) {
  const queryClient = useQueryClient();
  const llmStore = useLLMStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  useEffect(() => {
    if (props.open && props.forceConfiguration) {
      setStep(1);
    }
  }, [props.forceConfiguration, props.open]);

  useEffect(() => {
    if (!props.open || hasPrefilled || !props.status) {
      return;
    }
    const textOption = props.status.providers[0];
    if (!textOption) {
      return;
    }
    setHasPrefilled(true);
    setForm({
      apiKey: "",
      baseURL: textOption.currentBaseURL || textOption.defaultBaseURL,
      model: textOption.currentModel || textOption.defaultModel,
    });
  }, [hasPrefilled, props.open, props.status]);

  const textOption = props.status?.providers[0] ?? null;
  const modelOptions = textOption?.models ?? [];

  const completeMutation = useMutation({
    mutationFn: (payload: CompleteQuickSetupRequest) => completeQuickSetup(payload),
    onSuccess: async (response) => {
      if (response.data) {
        llmStore.setSelection({
          provider: response.data.provider,
          model: response.data.model,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.quickSetup }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelCategories }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.llmSelection }),
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.firstNovel }),
      ]);
    },
  });

  const requiresApiKey = textOption?.requiresApiKey !== false;
  const hasSavedKey = textOption?.configured === true;
  const canSubmit = Boolean(
    form.model.trim()
    && form.baseURL.trim()
    && textOption
    && (!requiresApiKey || form.apiKey.trim() || hasSavedKey),
  );
  const showFirstNovelHandoff = shouldShowFirstNovelHandoff({
    configurationSucceeded: completeMutation.isSuccess,
    forceConfiguration: props.forceConfiguration === true,
  });

  const submit = () => {
    setStep(2);
    completeMutation.mutate({
      providerKind: "builtin",
      ...(textOption ? { provider: textOption.id } : {}),
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      baseURL: form.baseURL.trim(),
      model: form.model.trim(),
    });
  };

  const footer = props.loading || props.error || (props.status?.readyForCreation && !props.forceConfiguration)
    ? null
    : step === 1
      ? (
          <Button onClick={submit} disabled={!canSubmit}>检测并完成配置 <PlugZap className="h-4 w-4" /></Button>
        )
      : completeMutation.isSuccess
        ? (
            showFirstNovelHandoff
              ? (
                  <>
                    <Button variant="outline" asChild><Link to="/help">查看创作向导</Link></Button>
                    <Button asChild><Link to="/novels/auto-director">用一句话开始第一本小说 <ArrowRight className="h-4 w-4" /></Link></Button>
                  </>
                )
              : (
                  <>
                    <Button variant="outline" asChild><Link to="/settings/models">查看模型设置</Link></Button>
                    <Button onClick={() => props.onOpenChange(false)}>开始创作 <Sparkles className="h-4 w-4" /></Button>
                  </>
                )
          )
        : completeMutation.isError
          ? (
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> 修改配置</Button>
            )
          : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="让 AI 创作环境先跑起来"
        description="只配置一个文本模型，检测通过后系统会自动完成全部创作任务的模型准备。"
        footer={footer}
        footerClassName="gap-2"
      >
        <div className="mb-6 grid grid-cols-2 gap-2">
          {[
            { index: 1, label: "连接文本模型" },
            { index: 2, label: "检测完成" },
          ].map((item) => (
            <div key={item.index} className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              step === item.index ? "border-primary bg-primary/5 text-primary" : step > item.index ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-muted-foreground",
            )}>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border text-[11px]">
                  {step > item.index ? <Check className="h-3 w-3" /> : item.index}
                </span>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {props.loading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在检查创作环境
          </div>
        ) : props.error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CircleAlert className="h-9 w-9 text-amber-600" />
            <div>
              <div className="font-semibold">暂时无法读取模型配置</div>
              <div className="mt-1 text-sm text-muted-foreground">重新加载后，系统会继续判断是否可以开始创作。</div>
            </div>
            <Button variant="outline" onClick={props.onRetry}>重新加载</Button>
          </div>
        ) : props.status?.readyForCreation && !props.forceConfiguration && !completeMutation.isSuccess ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <div>
              <div className="text-lg font-semibold">创作环境可以使用</div>
              <div className="mt-2 text-sm text-muted-foreground">
                文本模型 {props.status.selectedModel}，全部核心任务均已就绪。
              </div>
            </div>
            <Button onClick={() => props.onOpenChange(false)}>继续创作</Button>
          </div>
        ) : step === 1 ? (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold">连接文本模型</h3>
              <p className="mt-1 text-sm text-muted-foreground">API Key 只会保存到本机或服务端密钥存储，不会显示在完成结果中。</p>
            </div>
            <label className="block space-y-1.5">
              <span className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> API Key {requiresApiKey ? "" : "（可选）"}</span>
              <Input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                placeholder={hasSavedKey ? "留空则继续使用已保存的 Key" : requiresApiKey ? "输入 API Key" : "本地接口可以留空"}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">服务地址</span>
              <Input value={form.baseURL} placeholder="例如 http://127.0.0.1:18762/v1" onChange={(event) => setForm((current) => ({ ...current, baseURL: event.target.value }))} />
            </label>
            {modelOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {modelOptions.slice(0, 8).map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={cn("rounded-full border px-3 py-1.5 text-xs", form.model === model && "border-primary bg-primary/10 text-primary")}
                    onClick={() => setForm((current) => ({ ...current, model }))}
                  >
                    {model}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">文本模型</span>
              <Input value={form.model} placeholder="选择上方模型，或直接填写模型名称" onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              完成后，这个模型会用于规划、正文、审核、修复、重规划和摘要等全部核心任务。
            </div>
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
            {completeMutation.isPending ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
                <div>
                  <div className="text-lg font-semibold">正在检测普通文本与结构化输出</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">检测通过后，系统会自动准备全部核心创作任务，不需要逐项配置。</div>
                </div>
              </>
            ) : completeMutation.isSuccess ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-8 w-8 text-emerald-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">创作环境配置完成</div>
                  <div className="mt-2 text-sm text-muted-foreground">{completeMutation.data.data?.model} 已可用于整条小说生产链。</div>
                </div>
                {showFirstNovelHandoff ? (
                  <div className="w-full max-w-xl rounded-2xl border border-primary/15 bg-primary/[0.035] p-5 text-left shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-primary">开始第一本小说</div>
                      <Link to="/settings/models" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">查看模型设置</Link>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight">从一句想写的故事开始</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">告诉 AI 你想写什么，它会先给出可选方向；选定后继续准备故事、世界、角色和首章。</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {["说想法", "选择方向", "阅读首章"].map((label, index) => (
                        <div key={label} className="rounded-xl border bg-background/80 px-3 py-2.5 text-sm font-medium">
                          <span className="mr-2 text-primary">{index + 1}</span>{label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <CircleAlert className="h-8 w-8 text-amber-700" />
                </div>
                <div>
                  <div className="text-lg font-semibold">模型检测没有通过</div>
                  <div className="mt-2 max-w-lg text-sm leading-6 text-destructive">
                    {completeMutation.error instanceof Error ? completeMutation.error.message : "请检查 API Key、地址和模型名称后重试。"}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
