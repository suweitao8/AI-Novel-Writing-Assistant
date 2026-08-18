import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MANUAL_CREATE_LINK,
  SHORT_STORY_CREATE_LINK,
} from "./novelListViewModel";

export function NovelListEmptyState(props: {
  hasAnyNovel: boolean;
}) {
  return (
    <section className="py-12 text-center">
      <h2 className="text-xl font-semibold tracking-normal">
        {props.hasAnyNovel ? "没有符合筛选条件的小说" : "还没有小说项目"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasAnyNovel
          ? "可以切换上方筛选条件，或者创建一个新的小说项目。"
          : "从填写书名和基础信息开始，创建后 AI 会协助完成后续的准备和写作。"}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to={MANUAL_CREATE_LINK}>创建小说</Link>
        </Button>
        {SHORT_STORY_CREATE_LINK ? (
          <Button asChild variant="secondary">
            <Link to={SHORT_STORY_CREATE_LINK}>创作短篇</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
