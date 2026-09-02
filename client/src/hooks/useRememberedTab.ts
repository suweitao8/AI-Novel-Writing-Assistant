import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRememberedTabStorageKey,
  isRememberedTabValue,
  readRememberedTab,
  writeRememberedTab,
} from "@/lib/rememberedTabs";

export interface UseRememberedTabOptions<T extends string> {
  scope: string;
  defaultValue: T;
  values: readonly T[];
  enabled?: boolean;
}

function valuesSignature<T extends string>(values: readonly T[]): string {
  return values.join("\u0001");
}

export function useRememberedTab<T extends string>({
  scope,
  defaultValue,
  values,
  enabled = true,
}: UseRememberedTabOptions<T>): readonly [T, (nextValue: T) => void] {
  const storageScope = enabled ? scope : "";
  const storageKey = enabled ? createRememberedTabStorageKey(storageScope) : "";
  const signature = valuesSignature(values);
  const [tab, setTabState] = useState<T>(() => (
    enabled ? readRememberedTab(scope, defaultValue, values) : defaultValue
  ));
  const previousStorageKey = useRef(storageKey);
  const previousSignature = useRef(signature);

  useEffect(() => {
    const scopeChanged = previousStorageKey.current !== storageKey;
    const valuesChanged = previousSignature.current !== signature;
    if (scopeChanged || valuesChanged) {
      previousStorageKey.current = storageKey;
      previousSignature.current = signature;
      setTabState(
        enabled ? readRememberedTab(storageScope, defaultValue, values) : defaultValue,
      );
    }
  }, [defaultValue, enabled, signature, storageKey, storageScope, values]);

  useEffect(() => {
    if (!enabled || !storageKey || typeof window === "undefined") {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setTabState(
        isRememberedTabValue(event.newValue, values) ? event.newValue : defaultValue,
      );
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [defaultValue, enabled, signature, storageKey, values]);

  const setTab = useCallback((nextValue: T) => {
    const nextTab = isRememberedTabValue(nextValue, values) ? nextValue : defaultValue;
    setTabState(nextTab);
    if (enabled) {
      writeRememberedTab(scope, nextTab, values);
    }
  }, [defaultValue, enabled, scope, signature, values]);

  return [tab, setTab] as const;
}
