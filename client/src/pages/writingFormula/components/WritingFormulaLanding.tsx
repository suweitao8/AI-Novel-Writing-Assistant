import type { KeyboardEvent, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LandingProfileItem } from "../writingFormulaLandingItems";

interface WritingFormulaLandingProps {
  onOpenCreate: () => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  deletePending: boolean;
  profileItems: LandingProfileItem[];
  selectedProfileId: string;
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = value?.trim() ?? "";
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function handleSelectableKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

function DetailPanel(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <div className="space-y-1">
        <div className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">{props.title}</div>
        {props.description ? (
          <div className="text-xs leading-6 text-muted-foreground">{props.description}</div>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function DetailStatRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-6">
      <div className="text-muted-foreground">{props.label}</div>
      <div className="text-right text-foreground">{props.value}</div>
    </div>
  );
}

function SummaryCard(props: { title: string; summary: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
      <div className="text-sm font-medium text-foreground">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{props.summary}</div>
    </div>
  );
}

interface ProfileActionButtonsProps {
  profile: LandingProfileItem;
  deletePending: boolean;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
}

function ProfileActionButtons(props: ProfileActionButtonsProps) {
  const { profile, deletePending, onEditProfile, onOpenWorkbench, onUseProfileForClean, onDeleteProfile } = props;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={(event) => {
          event.stopPropagation();
          onEditProfile(profile.id);
        }}
      >
        编辑设定
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={(event) => {
          event.stopPropagation();
          onOpenWorkbench(profile.id);
        }}
      >
        应用与测试
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={(event) => {
          event.stopPropagation();
          onUseProfileForClean(profile.id);
        }}
      >
        去 AI 味
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={deletePending}
        onClick={(event) => {
          event.stopPropagation();
          onDeleteProfile(profile.id);
        }}
      >
        {deletePending ? "删除中..." : "删除"}
      </Button>
    </div>
  );
}

export default function WritingFormulaLanding(props: WritingFormulaLandingProps) {
  const {
    onOpenCreate,
    onSelectProfile,
    onEditProfile,
    onOpenWorkbench,
    onUseProfileForClean,
    onDeleteProfile,
    deletePending,
    profileItems,
    selectedProfileId,
  } = props;

  const activeProfile = profileItems.find((item) => item.id === selectedProfileId) ?? null;
  const otherProfiles = profileItems.filter((item) => item.id !== activeProfile?.id);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-6 p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
                我的写法资产
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  先选一套写法，再决定要编辑、应用还是去 AI 味。
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  点选任意一套写法即可切换为当前使用，切换会自动记住；当前写法固定在上方展开，其余写法统一排列在下方。
                </p>
              </div>
            </div>

            <Button type="button" onClick={onOpenCreate}>
              新建一套写法
            </Button>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-7 text-foreground">
            书级默认写法请从小说基础信息进入，由小说来选择要使用的写法资产，再带入后续导演和正文流程。
          </div>

          {profileItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-6">
              <div className="text-lg font-semibold text-foreground">当前还没有写法资产</div>
              <div className="mt-2 text-sm leading-7 text-muted-foreground">
                先创建第一套写法，后面再回来慢慢补规则、做试写和绑定目标。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onOpenCreate}>
                  去创建第一套写法
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {activeProfile ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">当前使用的写法</div>
                    <Badge className="bg-primary/15 text-primary">当前使用</Badge>
                  </div>
                  <div className="rounded-3xl border border-primary/40 bg-primary/5 p-5 md:p-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-foreground">{activeProfile.name}</div>
                          <Badge variant="secondary">{activeProfile.originLabel}</Badge>
                          {activeProfile.category ? (
                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {activeProfile.category}
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {activeProfile.sourceTypeLabel}
                          </Badge>
                        </div>
                        <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {truncateText(activeProfile.summaryLine, 160) || "暂无写法摘要。"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeProfile.tags.slice(0, 4).map((tag) => (
                            <Badge
                              key={`${activeProfile.id}-${tag}`}
                              variant="outline"
                              className="border-border text-muted-foreground"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {activeProfile.recentNovelTitle ? (
                            <Badge variant="secondary">最近绑定：{activeProfile.recentNovelTitle}</Badge>
                          ) : null}
                        </div>
                      </div>

                      <ProfileActionButtons
                        profile={activeProfile}
                        deletePending={deletePending}
                        onEditProfile={onEditProfile}
                        onOpenWorkbench={onOpenWorkbench}
                        onUseProfileForClean={onUseProfileForClean}
                        onDeleteProfile={onDeleteProfile}
                      />
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px]">
                      <DetailPanel
                        title="读感与定位"
                        description="这一列帮助你快速判断这套写法想写成什么感觉，适合先拿来做哪类项目。"
                      >
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm leading-7 text-foreground">
                          {activeProfile.description}
                        </div>
                        {activeProfile.detailLines.length > 0 ? (
                          <div className="grid gap-2">
                            {activeProfile.detailLines.map((line) => (
                              <div
                                key={`${activeProfile.id}-${line}`}
                                className="rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-sm leading-6 text-foreground"
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {activeProfile.sourceContentPreview ? (
                          <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-4 text-sm leading-7 text-foreground">
                            <div className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground">
                              原文样本片段
                            </div>
                            <div>{activeProfile.sourceContentPreview}</div>
                          </div>
                        ) : null}
                      </DetailPanel>

                      <div className="space-y-4">
                        <DetailPanel
                          title="规则摘要"
                          description="这里把这套写法真正控制读感的四层规则读出来，方便你在列表里先看懂。"
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <SummaryCard title="剧情推进" summary={activeProfile.narrativeSummary} />
                            <SummaryCard title="人物表达" summary={activeProfile.characterSummary} />
                            <SummaryCard title="语言质感" summary={activeProfile.languageSummary} />
                            <SummaryCard title="节奏控制" summary={activeProfile.rhythmSummary} />
                          </div>
                        </DetailPanel>

                        <DetailPanel
                          title="反 AI 约束"
                          description="这部分决定系统在检测和修正文稿时会优先盯住哪些风险。"
                        >
                          {activeProfile.antiAiFocus.length > 0 || activeProfile.antiAiRuleNames.length > 0 || activeProfile.extractionAntiAiRecommendationCount > 0 ? (
                            <div className="space-y-3">
                              {activeProfile.antiAiFocus.length > 0 ? (
                                <div className="grid gap-2">
                                  {activeProfile.antiAiFocus.map((line) => (
                                    <div
                                      key={`${activeProfile.id}-${line}`}
                                      className="rounded-xl border border-border/70 bg-muted/40 px-3 py-3 text-sm leading-6 text-foreground"
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {activeProfile.antiAiRuleNames.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {activeProfile.antiAiRuleNames.map((ruleName) => (
                                    <Badge
                                      key={`${activeProfile.id}-${ruleName}`}
                                      variant="secondary"
                                    >
                                      {ruleName}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              {activeProfile.extractionAntiAiRecommendationCount > 0 ? (
                                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-3 text-sm leading-6 text-muted-foreground">
                                  这套写法在提取阶段额外建议了 {activeProfile.extractionAntiAiRecommendationCount} 条反 AI 规则，适合后续继续精配。
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                              这套写法还没有绑定明确的反 AI 约束，所以“去 AI 味”时可读性会偏弱。
                            </div>
                          )}
                        </DetailPanel>
                      </div>

                      <div className="space-y-4">
                        <DetailPanel
                          title="资产概览"
                          description="这一列主要帮你判断这套写法现在成熟到什么程度。"
                        >
                          <div className="space-y-2">
                            <DetailStatRow label="来源" value={activeProfile.sourceTypeLabel} />
                            <DetailStatRow label="最近更新" value={activeProfile.updatedAtLabel} />
                            <DetailStatRow label="启用特征" value={`${activeProfile.extractedFeatureCount} 项`} />
                            <DetailStatRow label="高风险指纹" value={`${activeProfile.highRiskFeatureCount} 项`} />
                            <DetailStatRow
                              label="当前预设"
                              value={activeProfile.selectedPresetLabel || "未锁定"}
                            />
                            <DetailStatRow
                              label="可选预设"
                              value={activeProfile.presetLabels.length > 0 ? activeProfile.presetLabels.join(" / ") : "暂无"}
                            />
                            <DetailStatRow label="已绑定目标" value={`${activeProfile.bindingCount} 个`} />
                            <DetailStatRow
                              label="最近小说"
                              value={activeProfile.recentNovelTitle || "还没有绑定到小说"}
                            />
                            <DetailStatRow
                              label="适用题材"
                              value={activeProfile.applicableGenres.length > 0 ? activeProfile.applicableGenres.join(" / ") : "未填写"}
                            />
                          </div>
                        </DetailPanel>

                        <DetailPanel title="下一步" description="三个按钮各自只负责一件事。">
                          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                            <div>编辑设定：维护这套写法本身的说明、规则和反 AI 约束。</div>
                            <div>应用与测试：绑定到小说或章节，并做试写验证。</div>
                            <div>去 AI 味：只处理正文检测和修正，不改写法字段。</div>
                          </div>
                        </DetailPanel>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {otherProfiles.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">其他写法</div>
                      <div className="text-xs leading-6 text-muted-foreground">
                        点击任意一套即可切换为当前使用。
                      </div>
                    </div>
                    <Badge variant="secondary">{otherProfiles.length} 套</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {otherProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectProfile(profile.id)}
                        onKeyDown={(event) => handleSelectableKeyDown(event, () => onSelectProfile(profile.id))}
                        className={cn(
                          "flex h-full cursor-pointer flex-col justify-between gap-3 rounded-3xl border border-border bg-card px-5 py-4 text-left transition duration-200",
                          "hover:border-primary/40 hover:bg-primary/5",
                        )}
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-foreground">{profile.name}</div>
                            <Badge variant="secondary">{profile.originLabel}</Badge>
                            {profile.category ? (
                              <Badge variant="outline" className="border-border text-muted-foreground">
                                {profile.category}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {truncateText(profile.summaryLine, 90) || "暂无写法摘要。"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {profile.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={`${profile.id}-${tag}`}
                                variant="outline"
                                className="border-border text-muted-foreground"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {profile.bindingCount > 0 ? (
                              <Badge variant="secondary">已绑定 {profile.bindingCount} 个目标</Badge>
                            ) : null}
                          </div>
                        </div>

                        <ProfileActionButtons
                          profile={profile}
                          deletePending={deletePending}
                          onEditProfile={onEditProfile}
                          onOpenWorkbench={onOpenWorkbench}
                          onUseProfileForClean={onUseProfileForClean}
                          onDeleteProfile={onDeleteProfile}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
