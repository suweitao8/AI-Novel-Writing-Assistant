import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";

// 设定资产的共用表单：设定中心三个资产页签的编辑弹窗与漫剧「提取」的应用弹窗
// 复用同一套字段组件——两边字段、文案、占位完全一致，提取出来的资产和手动建的
// 资产是同一种东西，编辑体验也必须一致。

export interface CharacterAssetFormState {
  name: string;
  role: string;
  gender: string;
  ageGroup: string;
  physique: string;
  attireStyle: string;
  facePrompt: string;
  voiceTexture: string;
  personality: string;
  appearance: string;
  background: string;
}

export const EMPTY_CHARACTER_FORM: CharacterAssetFormState = {
  name: "",
  role: "",
  gender: "unknown",
  ageGroup: "",
  physique: "",
  attireStyle: "",
  facePrompt: "",
  voiceTexture: "",
  personality: "",
  appearance: "",
  background: "",
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
          <span className="text-sm font-medium">身份定位</span>
          <Input
            value={value.role}
            placeholder="例如：主角 / 对手 / 师父"
            onChange={(event) => onChange({ role: event.target.value })}
          />
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
        <span className="text-sm font-medium">体型</span>
        <Input
          value={value.physique}
          placeholder="例如：高瘦 / 娇小 / 壮实"
          onChange={(event) => onChange({ physique: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">性格（说话方式与行动倾向）</span>
        <Input value={value.personality} onChange={(event) => onChange({ personality: event.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">外貌</span>
        <Input value={value.appearance} onChange={(event) => onChange({ appearance: event.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">默认着装</span>
        <Input value={value.attireStyle} onChange={(event) => onChange({ attireStyle: event.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">画面提示词（生成角色图时使用）</span>
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
      <label className="block space-y-1">
        <span className="text-sm font-medium">背景</span>
        <Input value={value.background} onChange={(event) => onChange({ background: event.target.value })} />
      </label>
    </div>
  );
}

export interface SceneAssetFormState {
  name: string;
  sceneType: string;
  summary: string;
  environmentPrompt: string;
  significance: string;
}

export const EMPTY_SCENE_FORM: SceneAssetFormState = {
  name: "",
  sceneType: "",
  summary: "",
  environmentPrompt: "",
  significance: "",
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
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">氛围 / 环境描述</span>
        <Input
          value={value.summary}
          placeholder="这个地方长什么样、有什么感觉"
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">环境提示词（生成场景图时使用）</span>
        <Input
          value={value.environmentPrompt}
          placeholder="时间、光线、空间布局、材质风格、氛围"
          onChange={(event) => onChange({ environmentPrompt: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">故事作用</span>
        <Input
          value={value.significance}
          placeholder="为什么故事要在这里发生"
          onChange={(event) => onChange({ significance: event.target.value })}
        />
      </label>
    </div>
  );
}

export interface PropAssetFormState {
  name: string;
  propType: string;
  description: string;
  plotFunction: string;
  visualPrompt: string;
  ownerCharacterId: string;
  importance: string;
  firstAppearHint: string;
}

export const EMPTY_PROP_FORM: PropAssetFormState = {
  name: "",
  propType: "object",
  description: "",
  plotFunction: "",
  visualPrompt: "",
  ownerCharacterId: "",
  importance: "major",
  firstAppearHint: "",
};

export function PropAssetFormFields(props: {
  value: PropAssetFormState;
  onChange: (patch: Partial<PropAssetFormState>) => void;
  characters: Array<{ id: string; name: string }>;
}) {
  const { value, onChange, characters } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">道具名</span>
          <Input
            value={value.name}
            placeholder="例如：外婆留下的怀表"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">道具类型</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.propType}
            onChange={(event) => onChange({ propType: event.target.value })}
          >
            <option value="object">物件</option>
            <option value="weapon">武器</option>
            <option value="accessory">饰品</option>
            <option value="artifact">神器</option>
            <option value="document">文书</option>
            <option value="furniture">家具</option>
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">持有者</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.ownerCharacterId}
            onChange={(event) => onChange({ ownerCharacterId: event.target.value })}
          >
            <option value="">未设定</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>{character.name}</option>
            ))}
          </SelectControl>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">重要度</span>
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={value.importance}
            onChange={(event) => onChange({ importance: event.target.value })}
          >
            <option value="core">核心</option>
            <option value="major">重要</option>
            <option value="minor">次要</option>
          </SelectControl>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">外观 / 来历</span>
        <Input value={value.description} onChange={(event) => onChange({ description: event.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">剧情功能</span>
        <Input
          value={value.plotFunction}
          placeholder="用于什么转折、伏笔或兑现"
          onChange={(event) => onChange({ plotFunction: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">视觉提示词（生成道具图时使用）</span>
        <Input
          value={value.visualPrompt}
          placeholder="材质、工艺、尺寸、色泽、纹饰"
          onChange={(event) => onChange({ visualPrompt: event.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">首次登场提示</span>
        <Input
          value={value.firstAppearHint}
          onChange={(event) => onChange({ firstAppearHint: event.target.value })}
        />
      </label>
    </div>
  );
}
