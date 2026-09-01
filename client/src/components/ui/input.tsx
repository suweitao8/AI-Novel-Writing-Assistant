import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "studio-control flex h-10 w-full rounded-[var(--radius-control)] border border-input bg-[var(--surface-control)] px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
