import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  ColumnsIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageBody, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/primitives";
import { InsightChart } from "@/features/insights/insight-chart";
import { api } from "@/lib/api";
import type { DashboardDetail, Insight, QueryResult, Tile } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { cn } from "@/lib/utils";

function TileCard({
  tile,
  refreshKey,
  isFirst,
  isLast,
  onMove,
  onResize,
  onRemove,
  canEdit,
}: {
  canEdit: boolean;
  tile: Tile;
  refreshKey: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onResize: () => void;
  onRemove: () => void;
}) {
  const { apiBase, href } = useProject();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .get<QueryResult>(`${apiBase}/insights/${tile.insight.id}/result`)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed"));
    return () => {
      cancelled = true;
    };
  }, [apiBase, tile.insight.id, tile.insight.updated_at, refreshKey]);

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col rounded-xl border border-border bg-card",
        tile.width === 2 && "lg:col-span-2",
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b border-border/70 pr-2 pl-4">
        <Link to={`${href}/insights/${tile.insight.id}`} className="min-w-0 truncate text-[13px] font-medium hover:underline">
          {tile.insight.name}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label="Tile options"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`${href}/insights/${tile.insight.id}`}>
                <ExternalLinkIcon /> Open insight
              </Link>
            </DropdownMenuItem>
            {canEdit && (
              <>
            <DropdownMenuItem onSelect={onResize}>
              <ColumnsIcon /> {tile.width === 2 ? "Half width" : "Full width"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
              <ArrowUpIcon /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
              <ArrowDownIcon /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onRemove}>
              <XIcon /> Remove from dashboard
            </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={cn("min-h-0 flex-1 p-4", tile.insight.viz.type === "table" && "max-h-80 overflow-auto p-0")}>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && !result && <Skeleton className="h-[220px] w-full" />}
        {!error && result && <InsightChart result={result} viz={tile.insight.viz} height={220} />}
      </div>
    </div>
  );
}

function AddInsightDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (insight: Insight) => void;
}) {
  const { apiBase, href } = useProject();
  const insights = useFetch<Insight[]>(open ? `${apiBase}/insights` : null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed top-[16%] left-1/2 z-50 w-full max-w-[min(480px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/30 outline-none">
          <DialogPrimitive.Title className="sr-only">Add insight</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Pick an insight to add</DialogPrimitive.Description>
          <Command>
            <CommandInput placeholder="Search insights…" autoFocus />
            <CommandList>
              <CommandEmpty>
                No insights.{" "}
                <Link to={`${href}/insights/new`} className="text-foreground underline">
                  Create one
                </Link>
              </CommandEmpty>
              <CommandGroup>
                {insights.data?.map((i) => (
                  <CommandItem key={i.id} value={`${i.name} ${i.id}`} onSelect={() => onPick(i)}>
                    <BarChart3Icon /> {i.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DashboardPage() {
  const { dashboardId } = useParams();
  const { apiBase, href, canEdit } = useProject();
  const navigate = useNavigate();
  const path = `${apiBase}/dashboards/${dashboardId}`;
  const { data, error, reload, setData } = useFetch<DashboardDetail>(path);
  const [name, setName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (data) setName(data.name);
  }, [data]);

  const rename = async () => {
    if (!data || !name.trim() || name === data.name) return setName(data?.name ?? "");
    await api.patch(path, { name: name.trim() });
    setData({ ...data, name: name.trim() });
  };

  const addInsight = async (insight: Insight) => {
    setAdding(false);
    try {
      setData(await api.post<DashboardDetail>(`${path}/tiles`, { insight_id: insight.id, width: 1 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add insight");
    }
  };

  const updateTiles = (tiles: Tile[]) => data && setData({ ...data, tiles, tile_count: tiles.length });

  const move = async (index: number, dir: -1 | 1) => {
    if (!data) return;
    const tiles = [...data.tiles];
    [tiles[index], tiles[index + dir]] = [tiles[index + dir], tiles[index]];
    updateTiles(tiles);
    await api.put(`${path}/tiles/order`, { tile_ids: tiles.map((t) => t.id) });
  };

  const resize = async (tile: Tile) => {
    if (!data) return;
    const width = tile.width === 2 ? 1 : 2;
    updateTiles(data.tiles.map((t) => (t.id === tile.id ? { ...t, width } : t)));
    await api.patch(`${path}/tiles/${tile.id}`, { width });
  };

  const removeTile = async (tile: Tile) => {
    if (!data) return;
    updateTiles(data.tiles.filter((t) => t.id !== tile.id));
    await api.delete(`${path}/tiles/${tile.id}`);
  };

  const removeDashboard = async () => {
    await api.delete(path);
    toast.success("Dashboard deleted");
    navigate(`${href}/dashboards`);
  };

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to={`${href}/dashboards`} className="hover:text-foreground">
            Dashboards
          </Link>
        }
        title={
          data ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void rename()}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              readOnly={!canEdit}
              className="w-[min(420px,40vw)] bg-transparent font-medium outline-none"
              aria-label="Dashboard name"
            />
          ) : (
            "…"
          )
        }
        actions={
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => setRefreshKey((k) => k + 1)} aria-label="Refresh">
              <RefreshCwIcon />
            </Button>
            {canEdit && (
              <>
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <PlusIcon /> Add insight
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                  <Trash2Icon /> Delete dashboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
              </>
            )}
          </>
        }
      />
      <PageBody className="max-w-7xl">
        {error && <ErrorState message={error} onRetry={reload} />}
        {!data && !error && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        )}
        {data && data.description && <p className="-mt-2 mb-5 text-[13px] text-muted-foreground">{data.description}</p>}
        {data && data.tiles.length === 0 && (
          <EmptyState
            icon={<LayoutGridIcon />}
            title="This dashboard is empty"
            description="Add saved insights to build it out."
            action={
              canEdit && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <PlusIcon /> Add insight
              </Button>
              )
            }
          />
        )}
        {data && data.tiles.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.tiles.map((tile, i) => (
              <TileCard
                key={tile.id}
                tile={tile}
                refreshKey={refreshKey}
                isFirst={i === 0}
                isLast={i === data.tiles.length - 1}
                canEdit={canEdit}
                onMove={(dir) => void move(i, dir)}
                onResize={() => void resize(tile)}
                onRemove={() => void removeTile(tile)}
              />
            ))}
          </div>
        )}
      </PageBody>
      <AddInsightDialog open={adding} onOpenChange={setAdding} onPick={(i) => void addInsight(i)} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete dashboard?"
        description="The insights on it are kept."
        onConfirm={removeDashboard}
      />
    </>
  );
}
