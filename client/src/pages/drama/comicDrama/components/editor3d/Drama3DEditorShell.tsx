import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Drama3DEditorShellProps {
  header: ReactNode;
  viewport: ReactNode;
  objects: ReactNode;
  actions: ReactNode;
  className?: string;
}

export function Drama3DEditorShell({ header, viewport, objects, actions, className }: Drama3DEditorShellProps) {
  return (
    <div data-editor-shell="drama-3d" className={cn("flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden", className)}>
      <div className="grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden max-xl:overflow-y-auto xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside aria-label="场景编辑控制栏" className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden max-xl:min-h-[34rem]">
          <header className="shrink-0">{header}</header>
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,33.333%)_minmax(0,1fr)] gap-2 overflow-hidden">
            <section aria-label="场景对象列表" data-editor-region="objects" className="h-full min-h-0 overflow-hidden">
              {objects}
            </section>
            <section aria-label="属性面板" data-editor-region="actions" className="h-full min-h-0 overflow-hidden">
              {actions}
            </section>
          </div>
        </aside>

        <section aria-label="3D 场景视口" data-editor-region="viewport" className="min-h-0 min-w-0 overflow-hidden max-xl:min-h-[20rem]">
          {viewport}
        </section>
      </div>
    </div>
  );
}
