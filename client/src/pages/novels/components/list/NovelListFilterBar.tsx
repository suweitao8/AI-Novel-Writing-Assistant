import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function NovelListFilterBar(props: {
  search?: string;
  onSearchChange?: (value: string) => void;
  narrativeForm?: "all" | "short_story" | "long_novel";
  onNarrativeFormChange?: (value: "all" | "short_story" | "long_novel") => void;
  sort?: "updated" | "created" | "progress";
  onSortChange?: (value: "updated" | "created" | "progress") => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
      {props.onSearchChange ? (
        <label className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={props.search ?? ""} onChange={(event) => props.onSearchChange?.(event.target.value)} placeholder="搜索作品标题或简介" className="h-10 pl-9" />
        </label>
      ) : null}
      {props.onNarrativeFormChange ? (
        <Select value={props.narrativeForm ?? "all"} onValueChange={(value) => props.onNarrativeFormChange?.(value as "all" | "short_story" | "long_novel")}>
          <SelectTrigger className="h-10 w-[120px] rounded-lg shadow-none"><SelectValue placeholder="作品形式" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部形式</SelectItem>
            <SelectItem value="long_novel">长篇</SelectItem>
            <SelectItem value="short_story">短篇</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      {props.onSortChange ? (
        <Select value={props.sort ?? "updated"} onValueChange={(value) => props.onSortChange?.(value as "updated" | "created" | "progress")}>
          <SelectTrigger className="h-10 w-[132px] rounded-lg shadow-none"><SelectValue placeholder="排序" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">最近编辑</SelectItem>
            <SelectItem value="created">最近创建</SelectItem>
            <SelectItem value="progress">完成度</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
    </section>
  );
}
