import { Link } from "react-router-dom";
import { BookOpenText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MANUAL_CREATE_LINK,
  SHORT_STORY_CREATE_LINK,
  type NovelListSummaryItem,
} from "./novelListViewModel";
import { toneTextClass } from "./novelListTone";

export function NovelListHeader(props: {
  page: number;
  totalPages: number;
  totalNovels: number;
  recoveryCandidateCount: number;
  summary: NovelListSummaryItem[];
  onOpenRecovery: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">我的书架</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              浏览你的作品，继续阅读或继续创作；需要处理 AI 推进状态时，从卡片上的驾驶舱进入。
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {/* AI 自动导演开书入口暂时隐藏，恢复时使用 DIRECTOR_CREATE_LINK / PRIMARY_CREATE_LABEL */}
          <Button asChild>
            <Link to={MANUAL_CREATE_LINK}>创建小说</Link>
          </Button>
          {SHORT_STORY_CREATE_LINK ? (
            <Button asChild variant="secondary">
              <Link to={SHORT_STORY_CREATE_LINK}>
                <BookOpenText className="mr-2 h-4 w-4" aria-hidden="true" />
                创作短篇
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/60 py-3 text-sm">
        <HeaderMetric label="当前" value={`第 ${props.page} / ${props.totalPages} 页`} />
        <HeaderMetric label="总数" value={`${props.totalNovels} 本`} />
        {props.summary.map((item) => (
          <HeaderMetric
            key={item.id}
            label={item.label}
            value={String(item.value)}
            valueClassName={toneTextClass(item.tone)}
          />
        ))}
        {props.recoveryCandidateCount > 0 ? (
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={props.onOpenRecovery}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            待恢复 {props.recoveryCandidateCount}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function HeaderMetric(props: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={`font-medium text-foreground ${props.valueClassName ?? ""}`}>{props.value}</span>
    </span>
  );
}
