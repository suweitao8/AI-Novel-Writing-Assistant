import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  StorySettingsCharacter,
  StorySettingsProp,
  StorySettingsScene,
} from "@/api/story/storySettings";
import {
  createStorySettingsCharacter,
  createStorySettingsProp,
  createStorySettingsScene,
  generateStoryEntityDraft,
  updateStorySettingsCharacter,
  updateStorySettingsProp,
  updateStorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import type { StoryAssetKind } from "@/components/storyAssets";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  AssetStatesEditor,
  CharacterAssetFormFields,
  createInitialCharacterState,
  createInitialPropState,
  createInitialSceneState,
  EMPTY_CHARACTER_FORM,
  EMPTY_PROP_FORM,
  EMPTY_SCENE_FORM,
  normalizeStatesForSave,
  PropAssetFormFields,
  SceneAssetFormFields,
  type CharacterAssetFormState,
  type PropAssetFormState,
  type SceneAssetFormState,
} from "./assetForms";

export type EditableStoryAsset = StorySettingsCharacter | StorySettingsScene | StorySettingsProp;

type AssetFormState = CharacterAssetFormState | SceneAssetFormState | PropAssetFormState;

const KIND_LABELS: Record<StoryAssetKind, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

const HINT_PLACEHOLDERS: Record<StoryAssetKind, string> = {
  character: "例如：男大学生 / 退休老刑警 / 神秘的古董店老板娘",
  scene: "例如：深夜的便利店 / 雨后的老巷子",
  prop: "例如：外婆留下的怀表 / 一封烧掉一半的信",
};

const EDIT_DESCRIPTIONS: Record<StoryAssetKind, string> = {
  character: "调整角色设定后，后续生成的人物言行会按新设定走。",
  scene: "管理场景名，以及每个状态的空间、时间、天气和画面提示词。",
  prop: "管理道具名，以及每个状态的外观和图片提示词。",
};

// 新建时首状态还是「无名的出厂默认」的话，保存前把资产名补进去（角色还带性别）。
function prepareCharacterStatesForSave(
  states: StoryAssetState[],
  form: CharacterAssetFormState,
  isCreating: boolean,
): StoryAssetState[] {
  if (!isCreating || states.length === 0) {
    return states;
  }
  const defaultInitialState = createInitialCharacterState({ gender: EMPTY_CHARACTER_FORM.gender });
  if (JSON.stringify(states[0]) !== JSON.stringify(defaultInitialState)) {
    return states;
  }
  return [
    createInitialCharacterState({
      name: form.name.trim(),
      gender: form.gender || "unknown",
    }),
    ...states.slice(1),
  ];
}

function prepareNamedStatesForSave(
  states: StoryAssetState[],
  name: string,
  isCreating: boolean,
  buildDefault: (name: string) => StoryAssetState,
): StoryAssetState[] {
  if (!isCreating || states.length === 0) {
    return states;
  }
  if (JSON.stringify(states[0]) !== JSON.stringify(buildDefault(""))) {
    return states;
  }
  return [buildDefault(name), ...states.slice(1)];
}

// 三类设定资产共用的「新建/编辑」弹窗（2026-08-23 用户要求：所有入口打开的都是
// 同一个可编辑可保存的界面）——设定中心的三个资产页签与漫剧脚本页右侧列表共用。
// 表单字段与状态编辑器复用 assetForms；保存按类型走 create/update 接口，
// 成功后失效该类资产缓存 + overview，再回调调用方的 onChanged。
export default function StoryAssetEditDialog(props: {
  novelId: string;
  kind: StoryAssetKind;
  /** 正在编辑的资产；null＝新建 */
  asset: EditableStoryAsset | null;
  open: boolean;
  onClose: () => void;
  /** 保存成功后的额外刷新（设定页签的 onChanged 等） */
  onChanged?: () => void | Promise<void>;
  /** 传入时弹窗底部多一个「删除」入口（脚本页右侧列表用；设定页签的删除在卡片上） */
  onDelete?: () => void;
}) {
  const { novelId, kind, asset, open } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AssetFormState>(EMPTY_SCENE_FORM);
  const [states, setStates] = useState<StoryAssetState[]>([]);
  const [hint, setHint] = useState("");

  // 弹窗常驻不卸载：打开或切换目标时按 资产/新建 初始化表单。依赖用资产 id 而不是
  // 对象引用——缓存后台刷新会换对象引用，不能把正在编辑的草稿冲掉。
  const assetId = asset?.id ?? null;
  useEffect(() => {
    if (!open) {
      return;
    }
    if (kind === "character") {
      const character = asset as StorySettingsCharacter | null;
      setForm(character
        ? { name: character.name, gender: character.gender ?? "unknown" }
        : EMPTY_CHARACTER_FORM);
      setStates(character
        ? (character.states?.length
          ? character.states
          : [createInitialCharacterState({ name: character.name, gender: character.gender ?? "unknown" })])
        : [createInitialCharacterState({ gender: EMPTY_CHARACTER_FORM.gender })]);
    } else if (kind === "scene") {
      const scene = asset as StorySettingsScene | null;
      setForm(scene ? { name: scene.name } : EMPTY_SCENE_FORM);
      setStates(scene
        ? (scene.states?.length ? scene.states : [createInitialSceneState(scene)])
        : [createInitialSceneState({ name: "" })]);
    } else {
      const prop = asset as StorySettingsProp | null;
      setForm(prop ? { name: prop.name } : EMPTY_PROP_FORM);
      setStates(prop
        ? (prop.states?.length ? prop.states : [createInitialPropState(prop)])
        : [createInitialPropState({ name: "" })]);
    }
    setHint("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, assetId]);

  const statesValid = states.length > 0 && states.every((state) => Boolean(
    state.label.trim() && state.description.trim()
    && (kind === "character" || state.imagePrompt.trim()),
  ));

  const invalidate = async () => {
    const listKey = kind === "character"
      ? queryKeys.novels.storySettingsCharacters(novelId)
      : kind === "scene"
        ? queryKeys.novels.storySettingsScenes(novelId)
        : queryKeys.novels.storySettingsProps(novelId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await props.onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (kind === "character") {
        const character = asset as StorySettingsCharacter | null;
        const characterForm = form as CharacterAssetFormState;
        const payload = {
          name,
          gender: characterForm.gender || undefined,
          states: normalizeStatesForSave(prepareCharacterStatesForSave(states, characterForm, character === null)),
        };
        return character
          ? updateStorySettingsCharacter(novelId, character.id, payload)
          : createStorySettingsCharacter(novelId, payload);
      }
      if (kind === "scene") {
        const scene = asset as StorySettingsScene | null;
        const savedStates = normalizeStatesForSave(
          prepareNamedStatesForSave(states, name, scene === null, (defaultName) => createInitialSceneState({ name: defaultName })),
        );
        const initial = savedStates[0];
        const compatibilityFields = {
          sceneType: initial?.sceneType ?? null,
          summary: initial?.description?.trim() || null,
          environmentPrompt: initial?.imagePrompt?.trim() || null,
          timeOfDay: initial?.timeOfDay ?? null,
          weather: initial?.weather ?? null,
        };
        return scene
          ? updateStorySettingsScene(novelId, scene.id, {
            name,
            ...compatibilityFields,
            states: savedStates,
          })
          : createStorySettingsScene(novelId, {
            name,
            ...(compatibilityFields.sceneType ? { sceneType: compatibilityFields.sceneType } : {}),
            ...(compatibilityFields.summary ? { summary: compatibilityFields.summary } : {}),
            ...(compatibilityFields.environmentPrompt ? { environmentPrompt: compatibilityFields.environmentPrompt } : {}),
            ...(compatibilityFields.timeOfDay ? { timeOfDay: compatibilityFields.timeOfDay } : {}),
            ...(compatibilityFields.weather ? { weather: compatibilityFields.weather } : {}),
            states: savedStates,
          });
      }
      const prop = asset as StorySettingsProp | null;
      const savedStates = normalizeStatesForSave(
        prepareNamedStatesForSave(states, name, prop === null, (defaultName) => createInitialPropState({ name: defaultName })),
      );
      const initial = savedStates[0];
      return prop
        ? updateStorySettingsProp(novelId, prop.id, {
          name,
          visualPrompt: initial?.imagePrompt?.trim() || null,
          // 旧字段表单里已不存在：编辑保存即清空，数据和界面保持一致
          description: null,
          plotFunction: null,
          ownerCharacterId: null,
          firstAppearHint: null,
          states: savedStates,
        })
        : createStorySettingsProp(novelId, {
          name,
          ...(initial?.imagePrompt?.trim() ? { visualPrompt: initial.imagePrompt.trim() } : {}),
          states: savedStates,
        });
    },
    onSuccess: async () => {
      toast.success(asset ? `${KIND_LABELS[kind]}已保存。` : `${KIND_LABELS[kind]}已添加。`);
      props.onClose();
      await invalidate();
    },
    onError: (error) => {
      toast.error(`${KIND_LABELS[kind]}保存失败。`, { description: error instanceof Error ? error.message : undefined });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateStoryEntityDraft(novelId, kind, hint),
    onSuccess: (response) => {
      if (kind === "character") {
        const draft = response.data?.character;
        if (!draft) {
          toast.error("AI 没有生成角色草稿，请重试。");
          return;
        }
        setForm({ name: draft.name, gender: draft.gender || "unknown" });
        setStates([createInitialCharacterState({
          name: draft.name,
          gender: draft.gender || "unknown",
          ageGroup: draft.ageGroup as StoryAssetState["ageGroup"],
          description: [draft.appearance, draft.physique, draft.attireStyle].filter(Boolean).join("；") || "角色初始外观",
          imagePrompt: [draft.facePrompt, draft.appearance, draft.physique, draft.attireStyle].filter(Boolean).join("；") || "角色初始外观",
          ...(draft.voicePrompt ? { voicePrompt: draft.voicePrompt } : {}),
        })]);
      } else if (kind === "scene") {
        const draft = response.data?.scene;
        if (!draft) {
          toast.error("AI 没有生成场景草稿，请重试。");
          return;
        }
        setForm({ name: draft.name });
        setStates([createInitialSceneState(draft)]);
      } else {
        const draft = response.data?.prop;
        if (!draft) {
          toast.error("AI 没有生成道具草稿，请重试。");
          return;
        }
        setForm({ name: draft.name });
        setStates([createInitialPropState(draft)]);
      }
      toast.success("草稿已生成，可以直接修改后保存。");
    },
    onError: (error) => {
      toast.error(`${KIND_LABELS[kind]}生成失败。`, { description: error instanceof Error ? error.message : undefined });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <AppDialogContent
        className="max-w-6xl"
        title={asset ? `编辑${KIND_LABELS[kind]}` : `添加${KIND_LABELS[kind]}`}
        description={asset
          ? EDIT_DESCRIPTIONS[kind]
          : `写一句提示（也可以留空），让 AI 生成完整${KIND_LABELS[kind]}草稿；生成后可以随意修改再保存。`}
        footer={
          <>
            {props.onDelete ? (
              <Button variant="destructive" className="mr-auto" onClick={props.onDelete}>删除</Button>
            ) : null}
            <Button variant="outline" onClick={props.onClose} disabled={saveMutation.isPending}>取消</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim() || !statesValid}>
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {asset === null ? (
            <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">AI 生成提示</span>
                <Input
                  value={hint}
                  placeholder={HINT_PLACEHOLDERS[kind]}
                  onChange={(event) => setHint(event.target.value)}
                  disabled={generateMutation.isPending}
                />
              </label>
              <AiButton
                className="w-full"
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generateMutation.isPending ? "正在生成草稿..." : `AI 生成${KIND_LABELS[kind]}草稿`}
              </AiButton>
              {kind === "character" ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  提示里写的性别、年龄、职业会被保留，其余由 AI 合理发明（含随机姓名）。
                </p>
              ) : null}
            </div>
          ) : null}
          {kind === "character" ? (
            <CharacterAssetFormFields
              value={form as CharacterAssetFormState}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch } as AssetFormState))}
            />
          ) : kind === "scene" ? (
            <SceneAssetFormFields
              value={form as SceneAssetFormState}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch } as AssetFormState))}
            />
          ) : (
            <PropAssetFormFields
              value={form as PropAssetFormState}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch } as AssetFormState))}
            />
          )}
          {kind === "scene" && asset ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                props.onClose();
                navigate(`/drama/studio/${encodeURIComponent(novelId)}/scenes/${encodeURIComponent(asset.id)}/3d`);
              }}
            >
              <Box className="mr-1.5 h-4 w-4" aria-hidden="true" />
              3D场景编辑
            </Button>
          ) : null}
          <AssetStatesEditor
            states={states}
            onChange={setStates}
            kind={kind}
            novelId={novelId}
            assetName={form.name || undefined}
            asset={asset ? { novelId, assetId: asset.id } : undefined}
          />
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
