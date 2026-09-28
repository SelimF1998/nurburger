import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

interface FetchState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (update: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Minimal GET hook for page-local data. Global state lives in zustand stores;
 * this keeps per-page fetching out of them. Pass `null` to skip.
 */
export function useFetch<T>(path: string | null): FetchState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path);
      if (latest.current === path) setDataState(result);
    } catch (e) {
      if (latest.current === path) setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setDataState(undefined);
    void load();
  }, [load]);

  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) =>
      typeof update === "function" ? (update as (p: T | undefined) => T)(prev) : update,
    );
  }, []);

  return { data, error, loading, reload: load, setData };
}
