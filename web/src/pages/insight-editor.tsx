import { MoreHorizontalIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, PageBody, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge, Kbd, Skeleton } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlays";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddToDashboard } from "@/features/insights/add-to-dashboard";
import { numericColumns } from "@/features/insights/chart-data";
import { InsightChart } from "@/features/insights/insight-chart";
import { SqlEditor } from "@/features/insights/sql-editor";
import { TrendsBuilder } from "@/features/insights/trends-builder";
import { DateControls, VizTypePicker } from "@/features/insights/viz-controls";
import { api } from "@/lib/api";
import type { Insight, Query, QueryResult, SqlQuery, TrendsQuery, Viz } from "@/lib/types";
import { useProject } from "@/lib/use-project";
import { cn, formatNumber } from "@/lib/utils";

const DEFAULT_SQL = `SELECT event, count(*) AS count
FROM events
WHERE timestamp > now() - interval '7 days'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20`;

function defaultTrends(event: string | null): TrendsQuery {
  return {
    kind: "trends",
    series: [{ event, math: "total", filters: [] }],
    filters: [],
    breakdown: null,
    interval: "day",
    date_from: "-7d",
    date_to: null,
  };
}

/** Drops half-filled filters so the builder doesn't error while the user is still typing. */
function runnable(query: TrendsQuery): TrendsQuery | null {
  const clean = (fs: TrendsQuery["filters"]) => fs.filter((f) => f.key);
  for (const s of query.series) {
    if (!["total", "unique_users"].includes(s.math) && !s.math_property) return null;
  }
  return {
    ...query,
    filters: clean(query.filters),
    series: query.series.map((s) => ({ ...s, filters: clean(s.filters) })),
  };
}

function useQueryRunner() {
  const { apiBase } = useProject();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const seq = useRef(0);

  const run = useCallback(
    async (query: Query) => {
      const id = ++seq.current;
      setRunning(true);
      try {
        const r = await api.post<QueryResult>(`${apiBase}/query`, query as unknown as Record<string, unknown>);
        if (id === seq.current) {
          setResult(r);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : "Query failed");
      } finally {
        if (id === seq.current) setRunning(false);
      }
    },
    [apiBase],
  );
  return { result, error, running, run };
}

function SqlAxisPickers({ result, viz, onChange }: { result: QueryResult; viz: Viz; onChange: (viz: Viz) => void }) {
  if (result.kind !== "sql" || viz.type === "table") return null;
  const numeric = numericColumns(result);
  const x = viz.x ?? result.columns.find((c) => !numeric.includes(c)) ?? result.columns[0];
  const ys = viz.y?.length ? viz.y : numeric.filter((c) => c !== x);
  return (
    <div className="flex items-center gap-2">
      {viz.type !== "number" && viz.type !== "totals" && (
        <Select value={x} onValueChange={(v) => onChange({ ...viz, x: v })}>
          <SelectTrigger size="sm" className="max-w-40 font-mono">
            <span className="text-subtle-foreground">x</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {result.columns.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-48 font-mono">
            <span className="text-subtle-foreground">y</span>
            <span className="truncate">{ys.join(", ") || "none"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Numeric columns</DropdownMenuLabel>
          {numeric.map((c) => (
            <DropdownMenuCheckboxItem
              key={c}
              checked={ys.includes(c)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                onChange({ ...viz, y: checked ? [...ys, c] : ys.filter((y) => y !== c) })
              }
              className="font-mono text-xs"
            >
              {c}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function InsightEditorPage({ kind: forcedKind }: { kind?: "sql" }) {
  const { insightId } = useParams();
  const [params] = useSearchParams();
  const { apiBase, href, canEdit } = useProject();
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState(!insightId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState<Query>(() =>
    forcedKind === "sql" ? { kind: "sql", sql: DEFAULT_SQL } : defaultTrends(params.get("event")),
  );
  const [viz, setViz] = useState<Viz>({ type: forcedKind === "sql" ? "table" : "line" });
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { result, error, running, run } = useQueryRunner();

  const snapshot = useMemo(() => JSON.stringify({ name, query, viz }), [name, query, viz]);
  const dirty = saved !== snapshot;

  // Load an existing insight
  useEffect(() => {
    if (!insightId) return;
    let cancelled = false;
    api
      .get<Insight>(`${apiBase}/insights/${insightId}`)
      .then((insight) => {
        if (cancelled) return;
        const v: Viz = { type: insight.viz.type ?? "line", x: insight.viz.x ?? null, y: insight.viz.y ?? [] };
        setName(insight.name);
        setQuery(insight.query);
        setViz(v);
        setSaved(JSON.stringify({ name: insight.name, query: insight.query, viz: v }));
        setLoaded(true);
        if (insight.query.kind === "sql") void run(insight.query);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load insight"));
    return () => {
      cancelled = true;
    };
  }, [insightId, apiBase, run]);

  // Trends re-run automatically as the query changes
  const trendsKey = query.kind === "trends" ? JSON.stringify(runnable(query)) : null;
  useEffect(() => {
    if (!loaded || !trendsKey || trendsKey === "null") return;
    const t = setTimeout(() => void run(JSON.parse(trendsKey) as TrendsQuery), 300);
    return () => clearTimeout(t);
  }, [trendsKey, loaded, run]);

  const runSql = () => {
    if (query.kind === "sql") void run(query);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      name: name.trim() || (query.kind === "sql" ? "Untitled query" : "Untitled insight"),
      query: query.kind === "trends" ? (runnable(query) ?? query) : query,
      viz,
    };
    try {
      if (insightId) {
        await api.patch<Insight>(`${apiBase}/insights/${insightId}`, body);
        setName(body.name);
        setSaved(JSON.stringify({ name: body.name, query, viz }));
        toast.success("Insight saved");
      } else {
        const created = await api.post<Insight>(`${apiBase}/insights`, body);
        toast.success("Insight created");
        navigate(`${href}/insights/${created.id}`, { replace: true });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.delete(`${apiBase}/insights/${insightId}`);
    toast.success("Insight deleted");
    navigate(`${href}/insights`);
  };

  const isSql = query.kind === "sql";

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to={`${href}/insights`} className="hover:text-foreground">
            Insights
          </Link>
        }
        title={
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={!canEdit}
            placeholder={isSql ? "Untitled query" : "Untitled insight"}
            className="w-[min(420px,40vw)] bg-transparent font-medium outline-none placeholder:text-subtle-foreground"
            aria-label="Insight name"
          />
        }
        actions={
          !canEdit ? (
            <Tooltip content="Demo is read-only. You can still change and run queries.">
              <Badge variant="outline">Read-only</Badge>
            </Tooltip>
          ) : (
          <>
            {insightId && <AddToDashboard insightId={insightId} disabled={dirty} />}
            <Button size="sm" onClick={() => void save()} disabled={saving || (!!insightId && !dirty)}>
              {insightId ? "Save" : "Save insight"}
            </Button>
            {insightId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2Icon /> Delete insight
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
          )
        }
      />
      <PageBody className="max-w-7xl">
        {loadError && <ErrorState message={loadError} />}
        {!loaded && !loadError && <Skeleton className="h-96 w-full" />}
        {loaded && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card">
              {isSql ? (
                <>
                  <div className="border-b border-border px-2">
                    <SqlEditor
                      value={(query as SqlQuery).sql}
                      onChange={(sql) => setQuery({ kind: "sql", sql })}
                      onRun={runSql}
                    />
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      Query the <code className="font-mono text-foreground">events</code> table:{" "}
                      <span className="font-mono">uuid, event, distinct_id, properties (jsonb), timestamp</span>
                    </p>
                    <Button size="sm" className="ml-auto" onClick={runSql} disabled={running}>
                      <PlayIcon /> Run
                      <span className="ml-1 flex gap-0.5 opacity-70">
                        <Kbd className="border-white/20 bg-white/10 text-white">⌘</Kbd>
                        <Kbd className="border-white/20 bg-white/10 text-white">↵</Kbd>
                      </span>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-4">
                  <TrendsBuilder query={query as TrendsQuery} onChange={setQuery} />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                {query.kind === "trends" && <DateControls query={query} onChange={setQuery} />}
                {result && <SqlAxisPickers result={result} viz={viz} onChange={setViz} />}
                <div className="ml-auto flex items-center gap-3">
                  {result?.kind === "sql" && (
                    <span className="text-xs text-muted-foreground tabular">
                      {formatNumber(result.rows.length)}
                      {result.truncated ? "+" : ""} rows · {result.elapsed_ms} ms
                    </span>
                  )}
                  <VizTypePicker value={viz.type} onChange={(type) => setViz({ ...viz, type })} />
                </div>
              </div>
              <div className={cn("relative p-4 transition-opacity", running && result && "opacity-60")}>
                {error && <ErrorState message={error} />}
                {!error && !result && running && <Skeleton className="h-[300px] w-full" />}
                {!error && !result && !running && (
                  <div className="flex h-[300px] items-center justify-center text-[13px] text-muted-foreground">
                    {isSql ? "Run the query to see results." : "Pick an event to start."}
                  </div>
                )}
                {!error && result && (
                  <div className={cn(viz.type === "table" && "max-h-[520px] overflow-auto")}>
                    <InsightChart result={result} viz={viz} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </PageBody>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete insight?"
        description="It will also be removed from any dashboards it’s on."
        onConfirm={remove}
      />
    </>
  );
}

/** Remount per route so /sql, /insights/new and saved insights never share editor state. */
export function InsightEditorRoute({ kind }: { kind?: "sql" }) {
  const { insightId } = useParams();
  const location = useLocation();
  return <InsightEditorPage key={insightId ?? location.pathname + location.search} kind={kind} />;
}
