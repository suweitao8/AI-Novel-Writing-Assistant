import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

// 设定资产的共用表单：设定中心三个资产页签的编辑弹窗与漫剧「提取」的应用弹窗
// 复用同一套字段组件——两边字段、文案、占位完全一致，提取出来的资产和手动建的
// 资产是同一种东西，编辑体验也必须一致。
// 角色表单只保留做视频要用的属性（2026-08-20 起属性从简：姓名/性别/年龄段/外貌体型
// + 图片提示词 + 音色提示词；2026-08-21 起身份定位移除——参考小说只处理成脚本，
// 不判断男主女主，随剧情变化的外观走「状态」）。

export interface CharacterAssetFormState {
  name: string;
  gender: string;
  ageGroup: string;
  appearance: string;
  facePrompt: string;
  voiceTexture: string;
}

export const EMPTY_CHARACTER_FORM: CharacterAssetFormState = {
  name: "",
  gender: "unknown",
  ageGroup: "",
  appearance: "",
  facePrompt: "",
  voiceTexture: "",
};

export function CharacterAssetFormFields(props: {
  value: CharacterAssetFormState;
  onChange: (patch: Partial<CharacterAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">姓名</span>
          <Input value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">性别</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.gender}
            onChange={(event) => onChange({ gender: event.target.value })}
          >
            <option value="unknown">未设定</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">年龄段</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.ageGroup}
            onChange={(event) => onChange({ ageGroup: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="child">少年/儿童</option>
            <option value="youth">青年</option>
            <option value="middle">中年</option>
            <option value="elder">老年</option>
          </SelectControl>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">外貌体型</span>
        <Input
          value={value.appearance}
          placeholder="体型、发型发色、五官、穿着、标志性特征，一句话"
          onChange={(event) => onChange({ appearance: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">图片提示词（生成角色图时使用）</span>
        <Input
          value={value.facePrompt}
          placeholder="性别、年龄段、发型发色、眼睛、肤色、体型、服装"
          onChange={(event) => onChange({ facePrompt: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">音色提示词（配音时使用）</span>
        <Input
          value={value.voiceTexture}
          placeholder="例如：低沉沙哑的青年男声 / 清脆的少女音"
          onChange={(event) => onChange({ voiceTexture: event.target.value })}
        />
      </label>
    </div>
  );
}

export function newStateId(): string {
  return `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 外观状态编辑器（角色/场景/道具编辑弹窗共用）：同一资产随剧情变化的外观形态
// （换装/受伤/昼夜/损坏…）。每个状态可配置生图参考方式——参考同一资产的另一个
// 状态的图（典型：新状态参考上一状态，保持长相一致只换装/加伤），或不参考直接
// 生成全新形象；后续生成状态图片时按这个配置取参考图（2026-08-20 用户要求的灵活配置）。
export function AssetStatesEditor(props: {
  states: StoryAssetState[];
  onChange: (states: StoryAssetState[]) => void;
  kind: "character" | "scene" | "prop";
}) {
  const { states, onChange, kind } = props;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<StoryAssetState | null>(null);
  const showVoice = kind === "character";

  const startCreate = () => {
    setEditingIndex(null);
    setDraft({ id: newStateId(), label: "", description: "", imagePrompt: "" });
  };
  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...states[index] });
  };
  const cancelDraft = () => {
    setDraft(null);
    setEditingIndex(null);
  };
  const draftValid = Boolean(draft?.label.trim() && draft?.description.trim() && draft?.imagePrompt.trim());
  const commit = () => {
    if (!draft || !draftValid) {
      return;
    }
    const cleaned: StoryAssetState = {
      id: draft.id,
      label: draft.label.trim(),
      description: draft.description.trim(),
      imagePrompt: draft.imagePrompt.trim(),
      ...(showVoice && draft.voicePrompt?.trim() ? { voicePrompt: draft.voicePrompt.trim() } : {}),
      ...(draft.referenceStateId ? { referenceStateId: draft.referenceStateId } : {}),
      ...(draft.chapterOrder ? { chapterOrder: draft.chapterOrder } : {}),
    };
    onChange(editingIndex === null
      ? [...states, cleaned]
      : states.map((state, index) => (index === editingIndex ? cleaned : state)));
    cancelDraft();
  };
  const remove = (index: number) => {
    const removedId = states[index]?.id;
    onChange(states
      .filter((_state, position) => position !== index)
      .map((state) => (state.referenceStateId === removedId ? { ...state, referenceStateId: undefined } : state)));
  };

  const referenceOptions = states.filter((state) => state.id !== draft?.id);

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">外观状态</span>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={startCreate} disabled={draft !== null}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />添加状态
        </Button>
      </div>
      {states.length === 0 && draft === null ? (
        <p className="text-xs leading-5 text-muted-foreground">还没有状态。</p>
      ) : null}
      <div className="space-y-1.5">
        {states.map((state) => (
          <div key={state.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                {state.label}
                {state.chapterOrder ? <span className="text-[11px] text-muted-foreground">第{state.chapterOrder}章</span> : null}
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                  {state.referenceStateId
                    ? `参考：${states.find((item) => item.id === state.referenceStateId)?.label ?? "已删除"}`
                    : "不参考"}
                </span>
              </p>
              <p className="truncate text-xs leading-5 text-muted-foreground" title={[state.description, state.imagePrompt].filter(Boolean).join("\n")}>
                {state.description}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="编辑状态" disabled={draft !== null} onClick={() => startEdit(states.indexOf(state))}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label="删除状态" disabled={draft !== null} onClick={() => remove(states.indexOf(state))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {draft ? (
        <div className="space-y-2.5 rounded-md border border-dashed border-border bg-background p-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block space-y-1">
              <span className="text-sm font-medium">状态名</span>
              <Input
                value={draft.label}
                placeholder="例如：警察制服 / 重伤 / 黑夜"
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">生图参考</span>
              <SelectControl
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label="生图参考"
                value={draft.referenceStateId ?? ""}
                onChange={(event) => setDraft({ ...draft, referenceStateId: event.target.value || undefined })}
              >
                <option value="">不参考，直接生成新形象</option>
                {referenceOptions.map((state) => (
                  <option key={state.id} value={state.id}>参考「{state.label}」</option>
                ))}
              </SelectControl>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">说明</span>
            <Input
              value={draft.description}
              placeholder="这个状态下外观发生了什么，例如 换上警服 / 左臂受伤流血"
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">图片提示词（生成该状态图片时使用）</span>
            <Input
              value={draft.imagePrompt}
              onChange={(event) => setDraft({ ...draft, imagePrompt: event.target.value })}
            />
          </label>
          {showVoice ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium">音色提示词（该状态配音时使用）</span>
              <Input
                value={draft.voicePrompt ?? ""}
                placeholder="留空则用角色默认音色"
                onChange={(event) => setDraft({ ...draft, voicePrompt: event.target.value })}
              />
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelDraft}>取消</Button>
            <Button type="button" size="sm" onClick={commit} disabled={!draftValid}>确定</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface SceneAssetFormState {
  name: string;
  sceneType: string;
  timeOfDay: string;
  weather: string;
  environmentPrompt: string;
}

export const EMPTY_SCENE_FORM: SceneAssetFormState = {
  name: "",
  sceneType: "",
  timeOfDay: "",
  weather: "",
  environmentPrompt: "",
};

export function SceneAssetFormFields(props: {
  value: SceneAssetFormState;
  onChange: (patch: Partial<SceneAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">场景名</span>
          <Input
            value={value.name}
            placeholder="例如：废弃地铁站"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">场景类型</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.sceneType}
            onChange={(event) => onChange({ sceneType: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="interior">室内</option>
            <option value="exterior">室外</option>
            <option value="nature">自然</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">时间</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.timeOfDay}
            onChange={(event) => onChange({ timeOfDay: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="morning">早上</option>
            <option value="noon">中午</option>
            <option value="night">晚上</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">天气</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.weather}
            onChange={(event) => onChange({ weather: event.target.value })}
          >
            <option value="">未设定</option>
            <option value="sunny">晴天</option>
            <option value="cloudy">阴天</option>
            <option value="rainy">雨天</option>
          </SelectControl>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">图片提示词（生成场景图时使用）</span>
        <Input
          value={value.environmentPrompt}
          placeholder="光线、空间布局、材质风格；时间与天气用上面的选项"
          onChange={(event) => onChange({ environmentPrompt: event.target.value })}
        />
      </label>
    </div>
  );
}

// 道具表单只留做视频要用的字段（2026-08-19 用户决定：道具就是道具名 + 图片提示词，
// 类型/持有者/重要度/剧情功能等对生成画面没有作用；数据库旧字段保留，编辑保存时清空）。
export interface PropAssetFormState {
  name: string;
  visualPrompt: string;
}

export const EMPTY_PROP_FORM: PropAssetFormState = {
  name: "",
  visualPrompt: "",
};

export function PropAssetFormFields(props: {
  value: PropAssetFormState;
  onChange: (patch: Partial<PropAssetFormState>) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">道具名</span>
        <Input
          value={value.name}
          placeholder="例如：外婆留下的怀表"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">图片提示词（生成道具图时使用）</span>
        <Input
          value={value.visualPrompt}
          placeholder="材质、工艺、尺寸、色泽、纹饰"
          onChange={(event) => onChange({ visualPrompt: event.target.value })}
        />
      </label>
    </div>
  );
}
