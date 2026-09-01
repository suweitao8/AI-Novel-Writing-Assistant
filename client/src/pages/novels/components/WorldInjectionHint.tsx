interface WorldInjectionHintProps {
  worldInjectionSummary: string | null;
}

export default function WorldInjectionHint({ worldInjectionSummary }: WorldInjectionHintProps) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300">
      {worldInjectionSummary ? (
        <div className="space-y-1">
          <div className="font-semibold">本书世界参与本次生成</div>
          <pre className="whitespace-pre-wrap">{worldInjectionSummary}</pre>
        </div>
      ) : (
        <div>缺少可用的本书世界，生成过程会先根据小说基础信息推进。</div>
      )}
    </div>
  );
}
