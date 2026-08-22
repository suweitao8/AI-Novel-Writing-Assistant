import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StoryAssetSource } from "@/components/storyAssets";
import type { StorySettingsCharacter } from "@/api/story/storySettings";
import {
  CharacterAssetFormFields,
  createInitialCharacterState,
  createInitialPropState,
  createInitialSceneState,
  AssetStatesEditor,
  SceneAssetFormFields,
  PropAssetFormFields,
  EMPTY_CHARACTER_FORM,
  EMPTY_SCENE_FORM,
  EMPTY_PROP_FORM,
  type CharacterAssetFormState,
  type SceneAssetFormState,
  type PropAssetFormState,
} from "@/pages/novels/components/storySettings/assetForms";
import type { ReferenceExtractCharacter, ReferenceExtractItem, StoryAssetState } from "@ai-novel/shared/types/novelReferenceExtraction";

export type ExtractGroup = "characters" | "scenes" | "props" | "worldview";

const GROUP_LABELS: Record<ExtractGroup, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
  worldview: "世界观",
};

interface WorldviewFormState {
  name: string;
  description: string;
}

type CharacterApplyFormState = CharacterAssetFormState & {
  states: StoryAssetState[];
};

type SceneApplyFormState = SceneAssetFormState & {
  states: StoryAssetState[];
};

type PropApplyFormState = PropAssetFormState & {
  states: StoryAssetState[];
};

// 提取建议的应用弹窗：与资产页签的编辑弹窗共用同一套表单（assetForms）。
// 新建议：核对、可修改，点「应用」创建；同名已存在：表单与状态编辑器直接载入
// 已有资产的真实数据（状态列表能看到已生成的图与音色，可当场生成），点「保存」更新已有资产。
export default function ExtractApplyDialog(props: {
  open: boolean;
  group: ExtractGroup;
  item: ReferenceExtractCharacter | ReferenceExtractItem | { name: string; description: string } | null;
  novelId: string;
  existing: boolean;
  /** 已有同名资产的原始数据；已存在时表单直接载入它编辑 */
  existingAsset?: StoryAssetSource | null;
  pending: boolean;
  onApply: (form: object) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { group, item } = props;
  const character = group === "characters" ? item as ReferenceExtractCharacter : null;
  const [characterForm, setCharacterForm] = useState<CharacterApplyFormState>({
    ...EMPTY_CHARACTER_FORM,
    states: [createInitialCharacterState()],
  });
  const [sceneForm, setSceneForm] = useState<SceneApplyFormState>({ ...EMPTY_SCENE_FORM, states: [] });
  const [propForm, setPropForm] = useState<PropApplyFormState>({ ...EMPTY_PROP_FORM, states: [] });
  const [worldviewForm, setWorldviewForm] = useState<WorldviewFormState>({ name: "", description: "" });

  // 打开时预填表单：已存在时载入已有资产的真实数据（含状态图/音色，克隆一份避免直改缓存）；
  // 新建议才用提取内容预填。弹窗内改动的就是「保存/应用」落库的最终内容。
  useEffect(() => {
    if (!props.open || !item) {
      return;
    }
    const extractItem = item as ReferenceExtractItem;
    if (props.existing && props.existingAsset) {
      const source = props.existingAsset;
      const states = source.states.map((state) => ({
        ...state,
        ...(state.image ? { image: { ...state.image } } : {}),
        ...(state.voice ? { voice: { ...state.voice } } : {}),
      }));
      const characterSource = source as StorySettingsCharacter;
      setCharacterForm({
        ...EMPTY_CHARACTER_FORM,
        name: source.name,
        gender: (group === "characters" ? characterSource.gender : null) ?? "unknown",
        states,
      });
      setSceneForm({ ...EMPTY_SCENE_FORM, name: source.name, states });
      setPropForm({ ...EMPTY_PROP_FORM, name: source.name, states });
      setWorldviewForm({ name: item.name ?? "", description: extractItem.description ?? "" });
      return;
    }
    const description = [character?.appearance, character?.physique].filter(Boolean).join("；")
      || extractItem.description
      || "角色初始外观";
    const imagePrompt = extractItem.imagePrompt || description;
    setCharacterForm({
      ...EMPTY_CHARACTER_FORM,
      name: item.name ?? "",
      gender: character?.gender ?? "unknown",
      states: [createInitialCharacterState({
        name: item.name,
        gender: character?.gender ?? "unknown",
        ageGroup: character?.ageGroup as StoryAssetState["ageGroup"],
        description,
        imagePrompt,
        ...(character?.voicePrompt ? { voicePrompt: character.voicePrompt } : {}),
      })],
    });
    setSceneForm({
      ...EMPTY_SCENE_FORM,
      name: item.name ?? "",
      states: [createInitialSceneState({
        name: item.name ?? "",
        summary: extractItem.description,
        environmentPrompt: extractItem.imagePrompt,
        timeOfDay: extractItem.timeOfDay,
        weather: extractItem.weather,
      })],
    });
    setPropForm({
      ...EMPTY_PROP_FORM,
      name: item.name ?? "",
      states: [createInitialPropState({
        name: item.name ?? "",
        description: extractItem.description,
        visualPrompt: extractItem.imagePrompt,
      })],
    });
    setWorldviewForm({ name: item.name ?? "", description: extractItem.description ?? "" });
  }, [props.open, item, props.existing, props.existingAsset, group, character?.gender, character?.ageGroup, character?.appearance, character?.physique, character?.voicePrompt]);

  const formValid = group === "characters"
    ? characterForm.name.trim() !== ""
    : group === "worldview"
      ? worldviewForm.name.trim() !== "" && worldviewForm.description.trim() !== ""
      : (group === "scenes"
        ? sceneForm.name.trim() !== "" && sceneForm.states.length > 0
        : propForm.name.trim() !== "" && propForm.states.length > 0);
  const applyDisabled = props.pending || !formValid;

  const handleApply = () => {
    if (group === "characters") {
      props.onApply(characterForm);
    } else if (group === "scenes") {
      props.onApply(sceneForm);
    } else if (group === "props") {
      props.onApply(propForm);
    } else {
      props.onApply(worldviewForm);
    }
  };

  // 已存在时状态编辑器直接挂在已有资产上：图/音色生成与「保存状态」当场生效。
  const editorAsset = props.existing && props.existingAsset
    ? { novelId: props.novelId, assetId: props.existingAsset.id }
    : undefined;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {item ? (
        <AppDialogContent
          className="max-w-6xl"
          title={item.name || `应用${GROUP_LABELS[group]}`}
          description={GROUP_LABELS[group]}
          footer={
            <>
              <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.pending}>取消</Button>
              <Button onClick={handleApply} disabled={applyDisabled}>
                {props.pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {props.existing ? "保存" : "应用"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {props.existing ? (
              <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400">已存在</Badge>
                同名{GROUP_LABELS[group]}已存在，这里编辑的就是已有{GROUP_LABELS[group]}，点「保存」更新它。
              </p>
            ) : null}
            {group === "characters" ? (
              <>
                <CharacterAssetFormFields value={characterForm} onChange={(patch) => setCharacterForm((prev) => ({ ...prev, ...patch }))} />
                <AssetStatesEditor states={characterForm.states} onChange={(states) => setCharacterForm((prev) => ({ ...prev, states }))} kind="character" asset={editorAsset} />
              </>
            ) : group === "scenes" ? (
              <>
                <SceneAssetFormFields value={sceneForm} onChange={(patch) => setSceneForm((prev) => ({ ...prev, ...patch }))} />
                <AssetStatesEditor states={sceneForm.states} onChange={(states) => setSceneForm((prev) => ({ ...prev, states }))} kind="scene" asset={editorAsset} />
              </>
            ) : group === "props" ? (
              <>
                <PropAssetFormFields value={propForm} onChange={(patch) => setPropForm((prev) => ({ ...prev, ...patch }))} />
                <AssetStatesEditor states={propForm.states} onChange={(states) => setPropForm((prev) => ({ ...prev, states }))} kind="prop" asset={editorAsset} />
              </>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">条目名</span>
                  <Input
                    value={worldviewForm.name}
                    onChange={(event) => setWorldviewForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">说明</span>
                  <Input
                    value={worldviewForm.description}
                    onChange={(event) => setWorldviewForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
              </div>
            )}
          </div>
        </AppDialogContent>
      ) : null}
    </Dialog>
  );
}
