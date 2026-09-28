import { RefreshCwIcon, SearchIcon, ZapIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  CodeBlock,
  CopyButton,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageBody,
  PageHeader,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge, Switch } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { snippets } from "@/lib/snippets";
import type { EventDefinition, EventRecord } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

interface EventPage {
  results: EventRecord[];
  next_cursor: string | null;
}

const ALL = "__all__";

function PropertiesTable({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    return <p className="px-4 py-3 text-[13px] text-muted-foreground">No properties</p>;
  }
  return (
    <dl className="divide-y divide-border/70">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2">
          <dt className="truncate font-mono text-xs text-muted-foreground" title={key}>
            {key}
          </dt>
          <dd className="font-mono text-xs break-all">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityTab({ definitions }: { definitions: EventDefinition[] | undefined }) {
  const { apiBase, project } = useProject();
  const [event, setEvent] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [live, setLive] = useState(false);
  const [rows, setRows] = useState<EventRecord[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventRecord | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (event !== ALL) params.set("event", event);
    if (debounced) params.set("search", debounced);
    return params;
  }, [event, debounced]);

  const load = useCallback(async () => {
    try {
      const page = await api.get<EventPage>(`${apiBase}/events?${query}`);
      setRows(page.results);
      setCursor(page.next_cursor);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    }
  }, [apiBase, query]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [live, load]);

  const loadMore = async () => {
    if (!cursor) return;
    const params = new URLSearchParams(query);
    params.set("cursor", cursor);
    try {
      const page = await api.get<EventPage>(`${apiBase}/events?${params}`);
      setRows((prev) => [...(prev ?? []), ...page.results]);
      setCursor(page.next_cursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load more");
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" />
          <Input
            placeholder="Search event or distinct ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All events</SelectItem>
            {definitions?.map((d) => (
              <SelectItem key={d.name} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={live} onCheckedChange={setLive} />
            Live
            {live && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
          </label>
          <Button variant="secondary" size="icon" onClick={() => void load()} aria-label="Refresh">
            <RefreshCwIcon />
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!rows && !error && <ListSkeleton rows={8} />}
      {rows && rows.length === 0 && (
        <EmptyState
          icon={<ZapIcon />}
          title={event !== ALL || debounced ? "No matching events" : "No events yet"}
          description={
            event !== ALL || debounced
              ? "Try a different filter."
              : "Send one with the snippet below, then turn on Live to watch it arrive."
          }
          action={
            event === ALL && !debounced ? (
              <CodeBlock code={snippets(project.public_key).curl} className="max-w-xl text-left" />
            ) : undefined
          }
        />
      )}
      {rows && rows.length > 0 && (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Event</TH>
                <TH>Distinct ID</TH>
                <TH className="hidden lg:table-cell">URL / Source</TH>
                <TH className="text-right">Time</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.uuid} data-clickable onClick={() => setSelected(r)}>
                  <TD className="font-medium">{r.event}</TD>
                  <TD className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                    {r.distinct_id}
                  </TD>
                  <TD className="hidden max-w-72 truncate text-xs text-muted-foreground lg:table-cell">
                    {String(r.properties.$current_url ?? r.properties.$lib ?? "—")}
                  </TD>
                  <TD className="text-right text-xs whitespace-nowrap text-muted-foreground tabular" title={formatDateTime(r.timestamp)}>
                    {timeAgo(r.timestamp)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {cursor && (
            <div className="border-t border-border p-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => void loadMore()}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.event}
      >
        {selected && (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-[13px]">
              <span className="text-muted-foreground">Distinct ID</span>
              <span className="flex min-w-0 items-center gap-1 font-mono text-xs">
                <span className="truncate">{selected.distinct_id}</span>
                <CopyButton value={selected.distinct_id} />
              </span>
              <span className="text-muted-foreground">Time</span>
              <span>{formatDateTime(selected.timestamp)}</span>
              <span className="text-muted-foreground">UUID</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{selected.uuid}</span>
            </div>
            <div className="px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">Properties</div>
            <PropertiesTable properties={selected.properties} />
          </>
        )}
      </Sheet>
    </>
  );
}

function DefinitionsTab({
  definitions,
  loading,
}: {
  definitions: EventDefinition[] | undefined;
  loading: boolean;
}) {
  const { href } = useProject();
  if (loading && !definitions) return <ListSkeleton />;
  if (!definitions?.length) {
    return (
      <EmptyState
        icon={<ZapIcon />}
        title="No events yet"
        description="Event names appear here automatically once you start sending events."
      />
    );
  }
  const max = Math.max(...definitions.map((d) => d.volume_30d), 1);
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Event</TH>
            <TH className="w-56">Volume · 30d</TH>
            <TH className="text-right">Total</TH>
            <TH className="text-right">Last seen</TH>
          </TR>
        </THead>
        <TBody>
          {definitions.map((d) => (
            <TR key={d.name}>
              <TD>
                <Link
                  to={`${href}/insights/new?event=${encodeURIComponent(d.name)}`}
                  className="font-medium hover:underline"
                  title="Chart this event"
                >
                  {d.name}
                </Link>
                {d.name.startsWith("$") && (
                  <Badge variant="outline" className="ml-2">
                    auto
                  </Badge>
                )}
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${(d.volume_30d / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs text-muted-foreground tabular">
                    {formatNumber(d.volume_30d, { compact: true })}
                  </span>
                </div>
              </TD>
              <TD className="text-right text-xs text-muted-foreground tabular">
                {formatNumber(d.total_count, { compact: true })}
              </TD>
              <TD className="text-right text-xs text-muted-foreground">{timeAgo(d.last_seen_at)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function EventsPage() {
  const { apiBase } = useProject();
  const definitions = useFetch<EventDefinition[]>(`${apiBase}/event-definitions`);

  return (
    <Tabs defaultValue="activity">
      <PageHeader title="Events">
        <TabsList className="ml-3">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="definitions">Definitions</TabsTrigger>
        </TabsList>
      </PageHeader>
      <PageBody>
        <TabsContent value="activity">
          <ActivityTab definitions={definitions.data} />
        </TabsContent>
        <TabsContent value="definitions">
          <DefinitionsTab definitions={definitions.data} loading={definitions.loading} />
        </TabsContent>
      </PageBody>
    </Tabs>
  );
}
