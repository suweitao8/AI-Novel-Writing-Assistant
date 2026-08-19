import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import {
  createStorySettingsCharacter,
  createStorySettingsProp,
  createStorySettingsScene,
  type StorySettingsCharacter,
  type StorySettingsProp,
  type StorySettingsScene,
} from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface OutlineSettingsAsideProps {
  novelId: string;
  characters: StorySettingsCharacter[];
  scenes: StorySettingsScene[];
  props: StorySettingsProp[];
}

const CHARACTER_ROLE_OPTIONS = ["主角", "重要配角", "配角", "反派", "路人"];

// 大纲编辑区右侧的设定速建面板：随手创建角色/场景/道具（名称 + 一句话说明），
// 创建后的名字会立即进入大纲编辑器的高亮名单；完整设定仍在「设定」页签维护。
export default function OutlineSettingsAside(props: OutlineSettingsAsideProps) {
  const queryClient = useQueryClient();
  const [characterName, setCharacterName] = useState("");
  const [characterRole, setCharacterRole] = useState("配角");
  const [characterNote, setCharacterNote] = useState("");
  const [sceneName, setSceneName] = useState("");
  const [sceneNote, setSceneNote] = useState("");
  const [propName, setPropName] = useState("");
  const [propNote, setPropNote] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsCharacters(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsScenes(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsProps(props.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(props.novelId) });
  };

  const createCharacter = useMutation({
    mutationFn: () =>
      createStorySettingsCharacter(props.novelId, {
        name: characterName.trim(),
        role: characterRole,
        personality: characterNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success(`角色「${characterName.trim()}」已创建，大纲里出现这个名字会高亮。`);
      setCharacterName("");
      setCharacterNote("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建角色失败，请重试。"),
  });

  const createScene = useMutation({
    mutationFn: () =>
      createStorySettingsScene(props.novelId, {
        name: sceneName.trim(),
        summary: sceneNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success(`场景「${sceneName.trim()}」已创建，大纲里出现这个名字会高亮。`);
      setSceneName("");
      setSceneNote("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建场景失败，请重试。"),
  });

  const createProp = useMutation({
    mutationFn: () =>
      createStorySettingsProp(props.novelId, {
        name: propName.trim(),
        description: propNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success(`道具「${propName.trim()}」已创建，大纲里出现这个名字会高亮。`);
      setPropName("");
      setPropNote("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "创建道具失败，请重试。"),
  });

  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-5 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">设定</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">在这里创建角色、场景、道具，名字会自动在大纲里高亮。</p>
        </div>

        <QuickCreateSection
          title="角色"
          chips={props.characters.map((character) => character.name)}
          name={characterName}
          note={characterNote}
          namePlaceholder="角色名，如：林川"
          notePlaceholder="一句话性格或身份（可选）"
          pending={createCharacter.isPending}
          onNameChange={setCharacterName}
          onNoteChange={setCharacterNote}
          onCreate={() => createCharacter.mutate()}
          extra={(
            <SelectControl
              aria-label="角色定位"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={characterRole}
              onChange={(event) => setCharacterRole(event.target.value)}
            >
              {CHARACTER_ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </SelectControl>
          )}
        />

        <QuickCreateSection
          title="场景"
          chips={props.scenes.map((scene) => scene.name)}
          name={sceneName}
          note={sceneNote}
          namePlaceholder="场景名，如：深海修理铺"
          notePlaceholder="一句话说明（可选）"
          pending={createScene.isPending}
          onNameChange={setSceneName}
          onNoteChange={setSceneNote}
          onCreate={() => createScene.mutate()}
        />

        <QuickCreateSection
          title="道具"
          chips={props.props.map((prop) => prop.name)}
          name={propName}
          note={propNote}
          namePlaceholder="道具名，如：会说话的旧潜艇"
          notePlaceholder="一句话说明（可选）"
          pending={createProp.isPending}
          onNameChange={setPropName}
          onNoteChange={setPropNote}
          onCreate={() => createProp.mutate()}
        />
      </CardContent>
    </Card>
  );
}

interface QuickCreateSectionProps {
  title: string;
  chips: string[];
  name: string;
  note: string;
  namePlaceholder: string;
  notePlaceholder: string;
  pending: boolean;
  onNameChange: (next: string) => void;
  onNoteChange: (next: string) => void;
  onCreate: () => void;
  extra?: ReactNode;
}

function QuickCreateSection(props: QuickCreateSectionProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{props.title}</span>
        {props.chips.length > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">{props.chips.length}</span>
        ) : null}
      </div>
      {props.chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {props.chips.map((chip) => (
            <Badge key={chip} variant="outline" className="max-w-full truncate font-normal">{chip}</Badge>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        {props.extra}
        <Input
          value={props.name}
          maxLength={40}
          placeholder={props.namePlaceholder}
          className="h-8"
          onChange={(event) => props.onNameChange(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            value={props.note}
            maxLength={120}
            placeholder={props.notePlaceholder}
            className="h-8 flex-1"
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2.5"
            onClick={props.onCreate}
            disabled={props.pending || !props.name.trim()}
          >
            {props.pending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="h-4 w-4" aria-hidden="true" />}
            添加
          </Button>
        </div>
      </div>
    </section>
  );
}
