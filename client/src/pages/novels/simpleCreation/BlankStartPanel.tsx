import { useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  NotebookPen,
  Plus,
  Trash2,
} from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { useNovelOutlineWorkspace } from "@/hooks/useNovelOutlineWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BlankStartPanelProps {
  novelId: string;
  novelTitle: string;
  onGoToSettings: () => void;
}

// 空白小说「从零开始」工作台：写简略大纲 → AI 推理分章细纲（可编辑确认）→ 启动自动导演。
// 面板只在书架没有 AI 任务时出现；启动后回到书架的正常阅读台体验。
export default function BlankStartPanel(props: BlankStartPanelProps) {
  const { novelId, onGoToSettings } = props;
  const workspace = useNovelOutlineWorkspace(novelId);
  const {
    outlineText,
    setOutlineText,
    targetChapterCount,
    setTargetChapterCount,
    draftPremise,
    setDraftPremise,
    draftChapters,
    confirmedChapterCount,
    outlineDirty,
    canExpand,
    canConfirmChapters,
    saveOutlineMutation,
    expandMutation,
    saveChaptersMutation,
    startMutation,
    updateChapter,
    removeChapter,
    moveChapter,
    appendChapter,
  } = workspace;

  const expandHint = useMemo(() => {
    if (confirmedChapterCount > 0) {
      return `已确认 ${confirmedChapterCount} 章细纲。修改大纲后可以重新推理，重新确认会覆盖当前细纲。`;
    }
    if (canExpand) {
      return "先写好上面的简略大纲再推理，结果会更贴近你的想法；也可以先去「设定」补充角色和场景。";
    }
    return "还没有大纲。可以先写下几行故事走向，或者直接让 AI 依据书名与想法自由发挥。";
  }, [confirmedChapterCount, canExpand]);

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
        <div className="border-b border-border bg-muted/[0.28] px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><NotebookPen className="h-5 w-5" aria-hidden="true"  /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">从零开始</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">这本书记录了你的设定与大纲。按下面三步准备，随时可以让 AI 接手开写。</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-7">
          {/* 第 1 步：设定 + 简略大纲 */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">第 1 步</Badge>
              <span className="text-sm font-semibold text-foreground">先搭地基：设定与简略大纲</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <span>角色、场景、道具、世界观在「设定」里添加，支持手填和 AI 生成。</span>
              <Button type="button" size="sm" variant="outline" onClick={onGoToSettings}>
                打开设定
              </Button>
            </div>
            <div className="space-y-2">
              <label htmlFor="blank-outline-textarea" className="text-sm font-medium text-foreground">我的简略大纲</label>
              <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                id="blank-outline-textarea"
                value={outlineText}
                rows={7}
                maxLength={20000}
                placeholder={"像讲故事一样写下这本书的走向，不用分章。例如：\n林川是深海修理铺唯一的修理师。一天他捞起一艘会说话的旧潜艇，潜艇里藏着二十年前失踪科考队的记录……"}
                onChange={(event) => setOutlineText(event.target.value)}
               />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">写个大概就行，AI 会把它推理成逐章细纲；之后随时可以改了重推。</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!outlineDirty || saveOutlineMutation.isPending}
                  onClick={() => saveOutlineMutation.mutate(undefined)}
                >
                  {saveOutlineMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true"  /> : null}
                  保存大纲
                </Button>
              </div>
            </div>
          </div>

          {/* 第 2 步：AI 推理分章细纲 */}
          <div className="space-y-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">第 2 步</Badge>
              <span className="text-sm font-semibold text-foreground">AI 推理分章细纲</span>
              {confirmedChapterCount > 0 ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true"  />
                  已确认 {confirmedChapterCount} 章
                </Badge>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{expandHint}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label htmlFor="blank-target-chapter-count" className="text-xs text-muted-foreground">期望章数（可选）</label>
                <Input
                  id="blank-target-chapter-count"
                  value={targetChapterCount}
                  inputMode="numeric"
                  className="w-28"
                  placeholder="AI 决定"
                  onChange={(event) => setTargetChapterCount(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                 />
              </div>
              <AiButton
                disabled={!canExpand || expandMutation.isPending}
                onClick={() => expandMutation.mutate()}
              >
                {expandMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true"  />
                  : null}
                {draftChapters ? "重新推理细纲" : "AI 推理细纲"}
              </AiButton>
              <p className="text-xs leading-5 text-muted-foreground">推理不落库；确认保存后才会成为这本书的剧情契约。</p>
            </div>

            {draftChapters && draftChapters.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <label htmlFor="blank-draft-premise" className="text-sm font-medium text-foreground">全书梗概</label>
                  <textarea className="min-h-[72px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    id="blank-draft-premise"
                    value={draftPremise}
                    rows={2}
                    maxLength={600}
                    onChange={(event) => setDraftPremise(event.target.value)}
                   />
                  <p className="text-xs text-muted-foreground">共 {draftChapters.length} 章。每章的标题与梗概都可以直接修改，不满意的章可以删掉或调换顺序。</p>
                </div>
                <ol className="space-y-3">
                  {draftChapters.map((chapter, index) => (
                    <li key={`draft-chapter-${index}`} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground">{index + 1}</span>
                        <Input
                          value={chapter.title}
                          maxLength={60}
                          placeholder="本章标题"
                          className="h-9 flex-1"
                          onChange={(event) => updateChapter(index, { title: event.target.value })}
                         />
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="上移" aria-label="上移本章" disabled={index === 0} onClick={() => moveChapter(index, -1)}>
                            <ArrowUp className="h-4 w-4" aria-hidden="true"  />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="下移" aria-label="下移本章" disabled={index === draftChapters.length - 1} onClick={() => moveChapter(index, 1)}>
                            <ArrowDown className="h-4 w-4" aria-hidden="true"  />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="删除本章" aria-label="删除本章" onClick={() => removeChapter(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true"  />
                          </Button>
                        </div>
                      </div>
                      <textarea
                        value={chapter.synopsis}
                        rows={3}
                        maxLength={600}
                        placeholder="本章梗概：发生了什么、推进了什么、结尾钩子是什么"
                        className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onChange={(event) => updateChapter(index, { synopsis: event.target.value })}
                       />
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={appendChapter}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true"  />加一章
                  </Button>
                  <div className="flex-1"  />
                  <Button
                    type="button"
                    disabled={!canConfirmChapters || saveChaptersMutation.isPending}
                    onClick={() => saveChaptersMutation.mutate()}
                  >
                    {saveChaptersMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true"  /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true"  />}
                    确认并保存细纲
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* 第 3 步：开始创作 */}
          <div className="space-y-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">第 3 步</Badge>
              <span className="text-sm font-semibold text-foreground">开始创作</span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              启动后 AI 会先完成书级规划，再按章节逐章写作与审校。你确认过的细纲会作为剧情契约，
              AI 只做扩写与节奏补充，不会推翻你的走向；没有细纲也可以直接开始，AI 会依据设定和大纲自由规划。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <AiButton size="lg" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                {startMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true"  />
                  : null}
                让 AI 开始创作
              </AiButton>
              {confirmedChapterCount > 0 ? (
                <span className="text-xs text-muted-foreground">将按已确认的 {confirmedChapterCount} 章细纲推进。</span>
              ) : (
                <span className="text-xs text-muted-foreground">建议先完成第 1、2 步，AI 的规划会更贴近你的想法。</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
