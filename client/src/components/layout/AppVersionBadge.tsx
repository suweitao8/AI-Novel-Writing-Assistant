import { APP_VERSION } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AppVersionBadgeProps {
  className?: string;
}

export default function AppVersionBadge({ className }: AppVersionBadgeProps) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground",
        className,
      )}
      title={`当前版本 ${APP_VERSION}`}
      aria-label={`当前版本 ${APP_VERSION}`}
    >
      {APP_VERSION}
    </span>
  );
}
