import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CharacterAssetFormFields,
  SceneAssetFormFields,
  PropAssetFormFields,
  EMPTY_CHARACTER_FORM,
  EMPTY_SCENE_FORM,
  EMPTY_PROP_FORM,
  type CharacterAssetFormState,
  type SceneAssetFormState,
  type PropAssetFormState,
} from "@/pages/novels/components/storySettings/assetForms";
import type { ReferenceExtractCharacter, ReferenceExtractItem } from "@ai-novel/shared/types/novelReferenceExtraction";

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

// 提取建议的应用弹窗：与资产页签的编辑弹窗共用同一套表单（assetForms），
// 先核对、可修改，点「应用」创建这一条资产——不做批量勾选，每条单独确认。
export default function ExtractApplyDialog(props: {
  open: boolean;
  group: ExtractGroup;
  item: ReferenceExtractCharacter | ReferenceExtractItem | { name: string; description: string } | null;
  existing: boolean;
  characters: Array<{ id: string; name: string }>;
  pending: boolean;
  onApply: (form: object) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { group, item } = props;
  const character = group === "characters" ? item as ReferenceExtractCharacter : null;
  const [characterForm, setCharacterForm] = useState<CharacterAssetFormState>(EMPTY_CHARACTER_FORM);
  const [sceneForm, setSceneForm] = useState<SceneAssetFormState>(EMPTY_SCENE_FORM);
  const [propForm, setPropForm] = useState<PropAssetFormState>(EMPTY_PROP_FORM);
  const [worldviewForm, setWorldviewForm] = useState<WorldviewFormState>({ name: "", description: "" });

  // 打开时用提取内容预填表单；弹窗内改动的就是即将应用的最终内容。
  useEffect(() => {
    if (!props.open || !item) {
      return;
    }
    const extractItem = item as ReferenceExtractItem;
    setCharacterForm({
      ...EMPTY_CHARACTER_FORM,
      name: item.name ?? "",
      role: character?.role ?? "配角",
      // v5 起提取直接给结构化性别/年龄段/体型；旧提取结果没有这些字段，保持未设定。
      gender: character?.gender ?? "unknown",
      ageGroup: character?.ageGroup ?? "",
      physique: character?.physique ?? "",
      appearance: character?.appearance || extractItem.description || "",
      personality: character?.personality ?? "",
      facePrompt: extractItem.imagePrompt ?? "",
      voiceTexture: character?.voicePrompt ?? "",
    });
    setSceneForm({
      ...EMPTY_SCENE_FORM,
      name: item.name ?? "",
      summary: extractItem.description ?? "",
      environmentPrompt: extractItem.imagePrompt ?? "",
    });
    setPropForm({
      ...EMPTY_PROP_FORM,
      name: item.name ?? "",
      description: extractItem.description ?? "",
      visualPrompt: extractItem.imagePrompt ?? "",
    });
    setWorldviewForm({ name: item.name ?? "", description: extractItem.description ?? "" });
  }, [props.open, item, character?.role, character?.gender, character?.ageGroup, character?.physique, character?.appearance, character?.personality, character?.voicePrompt]);

  const formValid = group === "characters"
    ? characterForm.name.trim() !== "" && characterForm.role.trim() !== ""
    : group === "worldview"
      ? worldviewForm.name.trim() !== "" && worldviewForm.description.trim() !== ""
      : (group === "scenes" ? sceneForm.name.trim() : propForm.name.trim()) !== "";
  const applyDisabled = props.pending || props.existing || !formValid;

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

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {item ? (
        <AppDialogContent
          title={item.name || `应用${GROUP_LABELS[group]}`}
          description={GROUP_LABELS[group]}
          footer={
            <>
              <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.pending}>取消</Button>
              <Button onClick={handleApply} disabled={applyDisabled} title={props.existing ? "已有同名资产，不能重复创建" : undefined}>
                {props.pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                应用
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {props.existing ? (
              <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400">已存在</Badge>
                已有同名{GROUP_LABELS[group]}，不会重复创建；可以改名后应用。
              </p>
            ) : null}
            {group === "characters" ? (
              <CharacterAssetFormFields value={characterForm} onChange={(patch) => setCharacterForm((prev) => ({ ...prev, ...patch }))} />
            ) : group === "scenes" ? (
              <SceneAssetFormFields value={sceneForm} onChange={(patch) => setSceneForm((prev) => ({ ...prev, ...patch }))} />
            ) : group === "props" ? (
              <PropAssetFormFields
                value={propForm}
                onChange={(patch) => setPropForm((prev) => ({ ...prev, ...patch }))}
                characters={props.characters}
              />
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
