import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { cn } from "@/lib/utils";

type TabsRootProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;

interface RememberedTabsProps extends TabsRootProps {
  /** A stable browser-local scope. Persistence is opt-in and requires rememberedValues. */
  rememberedKey?: string;
  rememberedValues?: readonly string[];
}

function Tabs({
  rememberedKey,
  rememberedValues,
  value,
  defaultValue,
  onValueChange,
  ...props
}: RememberedTabsProps) {
  const shouldRemember = Boolean(rememberedKey && rememberedValues?.length);
  const fallbackValue = defaultValue ?? value ?? rememberedValues?.[0] ?? "";
  const [rememberedValue, setRememberedValue] = useRememberedTab({
    scope: rememberedKey ?? "",
    defaultValue: fallbackValue,
    values: rememberedValues ?? [],
    enabled: shouldRemember,
  });

  return (
    <TabsPrimitive.Root
      {...props}
      value={value ?? (shouldRemember ? rememberedValue : undefined)}
      defaultValue={shouldRemember ? undefined : defaultValue}
      onValueChange={(nextValue) => {
        if (shouldRemember) {
          setRememberedValue(nextValue);
        }
        onValueChange?.(nextValue);
      }}
    />
  );
}
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] border border-border/70 bg-[var(--surface-control)] p-1 text-muted-foreground", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium ring-offset-background transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] hover:bg-[var(--control-hover)] data-[state=active]:bg-[var(--control-active)] data-[state=active]:text-primary data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
