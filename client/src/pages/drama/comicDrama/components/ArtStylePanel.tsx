import { Link } from "react-router-dom";

// 「设定 · 美术风格」工作面（2026-08-22 用户要求收敛）：资产画风与时代画风集中在
// 独立的「画风管理」页维护（全项目共用一套时代画风库），本书不再单独定义；
// 漫剧里切时代风格在「脚本」页签顶部（【画风：名】标记）。
export default function ArtStylePanel() {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 text-muted-foreground">资产画风</span>
        <span className="min-w-0 text-foreground">角色四视图 · 场景 360° 全景 · 道具 45° 透视</span>
        <Link
          to="/art-style"
          className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          管理
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 text-muted-foreground">时代画风</span>
        <span className="min-w-0 text-foreground">在「脚本」页签顶部切换</span>
        <Link
          to="/art-style"
          className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          画风管理
        </Link>
      </div>
    </div>
  );
}
