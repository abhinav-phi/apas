import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UsePaginationOptions {
  table: string;
  pageSize?: number;
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  filters?: Record<string, unknown>;
}

interface UsePaginationResult<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (n: number) => void;
  refresh: () => void;
}

export function usePagination<T = Record<string, unknown>>({
  table,
  pageSize = 25,
  select = "*",
  orderBy = { column: "created_at", ascending: false },
  filters = {},
}: UsePaginationOptions): UsePaginationResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const fetch = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);

      const from = (targetPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from(table)
        .select(select, { count: "exact" })
        .order(orderBy.column, { ascending: orderBy.ascending ?? false })
        .range(from, to);

      // Apply filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") {
          query = query.eq(key, value as string);
        }
      }

      const { data: rows, error: err, count } = await query;

      if (err) {
        setError(err.message);
      } else {
        setData((rows as T[]) || []);
        setTotalCount(count || 0);
        setPage(targetPage);
      }
      setIsLoading(false);
    },
    [table, pageSize, select, orderBy.column, orderBy.ascending, JSON.stringify(filters)]
  );

  const nextPage = useCallback(() => {
    const next = Math.min(page + 1, totalPages);
    if (next !== page) fetch(next);
  }, [page, totalPages, fetch]);

  const prevPage = useCallback(() => {
    const prev = Math.max(page - 1, 1);
    if (prev !== page) fetch(prev);
  }, [page, fetch]);

  const goToPage = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(n, totalPages));
      fetch(clamped);
    },
    [totalPages, fetch]
  );

  const refresh = useCallback(() => fetch(page), [fetch, page]);

  return { data, page, totalPages, totalCount, isLoading, error, nextPage, prevPage, goToPage, refresh };
}
