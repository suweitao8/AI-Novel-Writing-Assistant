import type { ExternalToast, ToasterProps } from "sonner";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { recordErrorLog } from "@/lib/errorLog";

// 弹窗超过 5 秒自动消失；错误弹窗同时记入本地报错日志（系统设置可查），
// 不会因为自动关闭而丢失线索。
const TOAST_DURATION_MS = 5000;

function Toaster(props: ToasterProps) {
  const { toastOptions, mobileOffset, offset, ...restProps } = props;
  return (
    <SonnerToaster
      richColors
      theme="dark"
      position="top-right"
      offset={offset ?? 20}
      mobileOffset={mobileOffset ?? 12}
      toastOptions={{
        duration: TOAST_DURATION_MS,
        ...toastOptions,
        closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? "关闭提示",
        classNames: {
          ...toastOptions?.classNames,
          toast: `studio-card max-w-[calc(100vw-1.5rem)] overflow-visible border-border/80 bg-[var(--surface-raised)] text-card-foreground shadow-[var(--shadow-floating)] ${toastOptions?.classNames?.toast ?? ""}`.trim(),
          content: `min-w-0 break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.content ?? ""}`.trim(),
          title: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.title ?? ""}`.trim(),
          description: `break-words [overflow-wrap:anywhere] ${toastOptions?.classNames?.description ?? ""}`.trim(),
          closeButton: `studio-button shadow-sm ${toastOptions?.classNames?.closeButton ?? ""}`.trim(),
        },
      }}
      {...restProps}
    />
  );
}

const ERROR_TOAST_DEFAULTS: ExternalToast = {
  duration: TOAST_DURATION_MS,
  closeButton: true,
  dismissible: true,
};

function extractToastDescription(data?: ExternalToast): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const description = (data as { description?: unknown }).description;
  if (typeof description === "string") {
    return description;
  }
  return undefined;
}

function messageToLogText(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (typeof message === "number" || typeof message === "bigint") {
    return String(message);
  }
  // 非 ToasterProps 标准场景：组件/对象消息无法直接展示原文，记一个可辨识的占位。
  try {
    return JSON.stringify(message)?.slice(0, 200) || "[非文本报错内容]";
  } catch {
    return "[非文本报错内容]";
  }
}

const toast = Object.assign(
  (
    message: Parameters<typeof sonnerToast>[0],
    data?: Parameters<typeof sonnerToast>[1],
  ) => sonnerToast(message, data),
  sonnerToast,
  {
    error: (
      message: Parameters<typeof sonnerToast.error>[0],
      data?: Parameters<typeof sonnerToast.error>[1],
    ) => {
      recordErrorLog(messageToLogText(message), extractToastDescription(data), "toast");
      return sonnerToast.error(message, {
        ...ERROR_TOAST_DEFAULTS,
        ...data,
      });
    },
  },
);

export { Toaster, toast };
