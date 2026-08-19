import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  AppDialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  analyzeVisualStyle,
  createVisualStyle,
  deleteVisualStyle,
  getVisualStyle,
  listVisualStyles,
  updateVisualStyle,
  type VisualStyleSummary,
  type VisualStyleUpsertPayload,
} from "@/api/visualStyles";
import {
  formatVisualStyleFamilyLabel,
  type VisualStyleAnimationSubtype,
  type VisualStyleFamily,
} from "@ai-novel/shared/types/visualStyle";
import { queryKeys } from "@/api/queryKeys";

interface StyleFormState {
  id: string | null;
  key: string;
  label: string;
  styleTag: string;
  styleInstructions: string;
  avoidInstructions: string;
  styleFamily: VisualStyleFamily;
  animationSubtype: VisualStyleAnimationSubtype | "";
}

const EMPTY_FORM: StyleFormState = {
  id: null,
  key: "",
  label: "",
  styleTag: "",
  styleInstructions: "",
  avoidInstructions: "",
  styleFamily: "live_action",
  animationSubtype: "",
};

function slugifyKey(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "";
}

interface VisualStyleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 新风格创建成功后回调其 key，供选择器直接选中 */
  onStyleSaved?: (key: string) => void;
}

/**
 * 画面风格管理：查看/编辑/删除自定义风格，新建风格（手动填写或参考图 AI 分析）。
 */
export function VisualStyleManageDialog({ open, onOpenChange, onStyleSaved }: VisualStyleManageDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StyleFormState>(EMPTY_FORM);
  const [analyzeHint, setAnalyzeHint] = useState("");
  const [analyzeImage, setAnalyzeImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);

  const { data: styles = [] } = useQuery({
    queryKey: queryKeys.visualStyles.all,
    queryFn: listVisualStyles,
    enabled: open,
  });
  const customStyles = useMemo(() => styles.filter((style) => !style.isPreset), [styles]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.visualStyles.all });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: VisualStyleUpsertPayload = {
        key: form.key.trim(),
        label: form.label.trim(),
        styleInstructions: form.styleInstructions.trim(),
        avoidInstructions: form.avoidInstructions.trim(),
        styleTag: form.styleTag.trim(),
        styleFamily: form.styleFamily,
        animationSubtype: form.styleFamily === "animation" && form.animationSubtype
          ? form.animationSubtype
          : null,
      };
      return form.id
        ? updateVisualStyle(form.id, payload)
        : createVisualStyle(payload);
    },
    onSuccess: (saved) => {
      toast.success(form.id ? "画面风格已更新" : "画面风格已创建");
      invalidate();
      onStyleSaved?.(saved.key);
      setForm(EMPTY_FORM);
    },
    onError: (error: Error) => {
      toast.error("保存画面风格失败", { description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (style: VisualStyleSummary) => {
      if (!style.id) {
        throw new Error("内置风格不能删除。");
      }
      return deleteVisualStyle(style.id);
    },
    onSuccess: () => {
      toast.success("画面风格已删除");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error("删除画面风格失败", { description: error.message });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!analyzeImage) {
        throw new Error("请先选择一张参考图。");
      }
      return analyzeVisualStyle({
        imageBase64: analyzeImage.base64,
        mimeType: analyzeImage.mimeType,
        userHint: analyzeHint.trim() || undefined,
      });
    },
    onSuccess: (draft) => {
      setForm((prev) => ({
        ...prev,
        label: draft.suggestedLabel || prev.label,
        key: prev.key || slugifyKey(draft.suggestedName) || `analyzed-${Date.now()}`,
        styleTag: draft.styleTag,
        styleInstructions: draft.styleInstructions,
        avoidInstructions: draft.avoidInstructions,
      }));
      toast.success("已根据参考图生成风格草稿", { description: "确认内容后点击保存。" });
    },
    onError: (error: Error) => {
      toast.error("参考图风格分析失败", { description: error.message });
    },
  });

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setAnalyzeImage(null);
      return;
    }
    const mimeType = file.type || "image/png";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)) {
      toast.error("参考图仅支持 PNG / JPEG / WebP / GIF");
      setAnalyzeImage(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setAnalyzeImage({ base64, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const startEdit = async (style: VisualStyleSummary) => {
    try {
      const detail = await getVisualStyle(style.key);
      if (!detail) {
        toast.error("读取画面风格失败", { description: "风格不存在或已被删除。" });
        return;
      }
      setForm({
        id: detail.id,
        key: detail.key,
        label: detail.label,
        styleTag: detail.styleTag,
        styleInstructions: detail.styleInstructions,
        avoidInstructions: detail.avoidInstructions,
        styleFamily: detail.styleFamily,
        animationSubtype: detail.animationSubtype ?? "",
      });
    } catch (error) {
      toast.error("读取画面风格失败", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="画面风格"
        description="画面风格用于封面、角色立绘、漫画等所有图片生成，统一整本作品的画面质感；风格只决定媒介与质感，不会改变你的角色与场景设定。"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.label.trim() || !form.key.trim()}
            >
              {saveMutation.isPending ? "保存中..." : form.id ? "保存修改" : "创建风格"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {customStyles.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">我的风格</h3>
              <ul className="space-y-1.5">
                {customStyles.map((style) => (
                  <li
                    key={style.id ?? style.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{style.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {style.key} · {formatVisualStyleFamilyLabel(style.styleFamily, style.animationSubtype)}
                        {style.origin === "analyzed" ? " · 参考图生成" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { void startEdit(style); }}>编辑</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label={`删除风格 ${style.label}`}
                        onClick={() => deleteMutation.mutate(style)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {form.id ? "编辑风格" : "新建风格"}
            </h3>

            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                上传一张喜欢的图，AI 会提炼出它的画面质感（媒介、光影、调色），自动填到下方表单。
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:text-primary-foreground"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="h-8 flex-1 text-xs"
                  placeholder="补充说明（可选），例如：想要更接近海报质感"
                  value={analyzeHint}
                  onChange={(event) => setAnalyzeHint(event.target.value)}
                />
                <AiButton
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending || !analyzeImage}
                >
                  {analyzeMutation.isPending ? "分析中..." : "AI 分析参考图"}
                </AiButton>
              </div>
              {analyzeImage && (
                <p className="text-xs text-muted-foreground">已选择：{analyzeImage.name}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground">风格名称</span>
                <Input
                  className="h-9"
                  placeholder="例如：水墨悬疑"
                  value={form.label}
                  onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground">风格标识（小写英文/数字）</span>
                <Input
                  className="h-9"
                  placeholder="例如：ink-mystery"
                  value={form.key}
                  onChange={(event) => setForm((prev) => ({ ...prev, key: slugifyKey(event.target.value) }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground">画面媒介</span>
                <SelectControl
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={form.styleFamily}
                  onChange={(event) => {
                    const nextFamily = event.target.value as VisualStyleFamily;
                    setForm((prev) => ({
                      ...prev,
                      styleFamily: nextFamily,
                      animationSubtype: nextFamily === "animation" ? prev.animationSubtype || "2d" : "",
                    }));
                  }}
                >
                  <option value="live_action">真人写实</option>
                  <option value="animation">动画</option>
                </SelectControl>
              </label>
              {form.styleFamily === "animation" && (
                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">动画类型</span>
                  <SelectControl
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={form.animationSubtype || "2d"}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      animationSubtype: event.target.value as VisualStyleAnimationSubtype,
                    }))}
                  >
                    <option value="2d">2D</option>
                    <option value="3d">3D</option>
                    <option value="hybrid">混合媒介</option>
                  </SelectControl>
                </label>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">风格锚点（画面质感关键词）</span>
              <Input
                className="h-9"
                placeholder="例如：SOFT WATERCOLOR, MUTED TONES；不要写年代或题材词"
                value={form.styleTag}
                onChange={(event) => setForm((prev) => ({ ...prev, styleTag: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">渲染说明（这个风格怎么画）</span>
              <textarea
                className="min-h-[90px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="描述媒介、线条、上色、光影、镜头感、调色；只描述质感，不写角色、服装、年代等具体内容。"
                value={form.styleInstructions}
                onChange={(event) => setForm((prev) => ({ ...prev, styleInstructions: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">守护约束（禁止出现什么）</span>
              <textarea
                className="min-h-[70px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="以 FORBIDDEN: 开头，限制错误媒介与质量问题（水印、文字、畸形、塑料皮肤等）。"
                value={form.avoidInstructions}
                onChange={(event) => setForm((prev) => ({ ...prev, avoidInstructions: event.target.value }))}
              />
            </label>
          </section>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}

interface VisualStylePickerProps {
  value: string;
  onChange: (styleKey: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  emptyLabel?: string;
}

const MANAGE_VALUE = "__manage_styles__";

/**
 * 画面风格选择器：内置预设 + 自定义风格 + 管理入口。
 * value 为风格 key；空串表示不使用预设（沿用各自的自由文本风格描述）。
 */
export default function VisualStylePicker({
  value,
  onChange,
  className,
  disabled,
  id,
  emptyLabel = "不使用预设（自由描述）",
}: VisualStylePickerProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const { data: styles = [] } = useQuery({
    queryKey: queryKeys.visualStyles.all,
    queryFn: listVisualStyles,
  });
  const builtinStyles = styles.filter((style) => style.isPreset);
  const customStyles = styles.filter((style) => !style.isPreset);

  const handleChange = (next: string) => {
    if (next === MANAGE_VALUE) {
      setManageOpen(true);
      return;
    }
    onChange(next);
  };

  return (
    <>
      <SelectControl
        id={id}
        className={cn("h-9 rounded-md border bg-background px-2 text-sm", className)}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{emptyLabel}</option>
        {builtinStyles.map((style) => (
          <option key={style.key} value={style.key}>
            内置 · {style.label}（{formatVisualStyleFamilyLabel(style.styleFamily, style.animationSubtype)}）
          </option>
        ))}
        {customStyles.map((style) => (
          <option key={style.id ?? style.key} value={style.key}>
            自定义 · {style.label}
          </option>
        ))}
        <option value={MANAGE_VALUE}>管理画面风格…</option>
      </SelectControl>
      <VisualStyleManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onStyleSaved={(key) => onChange(key)}
      />
    </>
  );
}
