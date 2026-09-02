import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { isRememberedTabValue } from "@/lib/rememberedTabs";
import {
  useRememberedTab,
  type UseRememberedTabOptions,
} from "./useRememberedTab";

export interface UseRememberedQueryTabOptions<T extends string> extends UseRememberedTabOptions<T> {
  queryParam: string;
  replace?: boolean;
}

export function useRememberedQueryTab<T extends string>({
  queryParam,
  replace = false,
  ...options
}: UseRememberedQueryTabOptions<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rememberedTab, setRememberedTab] = useRememberedTab(options);
  const rawValue = searchParams.get(queryParam);
  const hasQueryParam = searchParams.has(queryParam);
  const explicitTab = isRememberedTabValue(rawValue, options.values) ? rawValue : null;
  const tab = explicitTab ?? (hasQueryParam ? options.defaultValue : rememberedTab);

  useEffect(() => {
    if (explicitTab !== null) {
      setRememberedTab(explicitTab);
      return;
    }

    if (options.enabled === false) {
      return;
    }
    if (!hasQueryParam && rememberedTab === options.defaultValue) {
      return;
    }

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (hasQueryParam) {
        next.delete(queryParam);
      } else if (rememberedTab !== options.defaultValue) {
        next.set(queryParam, rememberedTab);
      }
      return next;
    }, { replace: true });
  }, [
    explicitTab,
    hasQueryParam,
    options.defaultValue,
    options.enabled,
    queryParam,
    rawValue,
    rememberedTab,
    setRememberedTab,
    setSearchParams,
  ]);

  const setTab = useCallback((nextValue: T) => {
    const nextTab = isRememberedTabValue(nextValue, options.values) ? nextValue : options.defaultValue;
    setRememberedTab(nextTab);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(queryParam, nextTab);
      return next;
    }, { replace });
  }, [options.defaultValue, options.values, queryParam, replace, setRememberedTab, setSearchParams]);

  return {
    tab,
    setTab,
    searchParams,
    setSearchParams,
  } as const;
}
