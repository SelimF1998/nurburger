import { BarChart3Icon, PlusIcon, SearchIcon, TerminalSquareIcon, TrendingUpIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, ErrorState, ListSkeleton, PageBody, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { Insight } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";

function describe(insight: Insight): string {
  if (insight.query.kind === "sql") return insight.query.sql.replace(/\s+/g, " ").slice(0, 80);
  const events = insight.query.series.map((s) => s.event ?? "All events").join(", ");
  return insight.query.breakdown ? `${events} by ${insight.query.breakdown}` : events;
}

export function InsightsPage() {
  const { apiBase, href } = useProject();
  const { data, error, loading, reload } = useFetch<Insight[]>(`${apiBase}/insights`);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = data?.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Insights"
        actions={
          <>
            <Button size="sm" variant="secondary" asChild>
              <Link to={`${href}/sql`}>
                <TerminalSquareIcon /> SQL query
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`${href}/insights/new`}>
                <PlusIcon /> New insight
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        {error && <ErrorState message={error} onRetry={reload} />}
        {loading && !data && <ListSkeleton />}
        {data && data.length === 0 && (
          <EmptyState
            icon={<BarChart3Icon />}
            title="No insights yet"
            description="Chart events over time with the visual builder, or write SQL against your raw events."
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" asChild>
                  <Link to={`${href}/sql`}>Write SQL</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to={`${href}/insights/new`}>New insight</Link>
                </Button>
              </div>
            }
          />
        )}
        {data && data.length > 0 && (
          <>
            <div className="relative mb-4 w-64">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" />
              <Input placeholder="Search insights" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <div className="rounded-lg border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH className="hidden md:table-cell">Query</TH>
                    <TH className="w-20">Type</TH>
                    <TH className="w-32 text-right">Updated</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered?.map((i) => (
                    <TR key={i.id} data-clickable onClick={() => navigate(`${href}/insights/${i.id}`)}>
                      <TD className="font-medium">{i.name}</TD>
                      <TD className="hidden max-w-96 truncate text-xs text-muted-foreground md:table-cell">
                        <span className={i.kind === "sql" ? "font-mono" : undefined}>{describe(i)}</span>
                      </TD>
                      <TD>
                        <Badge variant="outline">
                          {i.kind === "sql" ? <TerminalSquareIcon /> : <TrendingUpIcon />}
                          {i.kind === "sql" ? "SQL" : "Trend"}
                        </Badge>
                      </TD>
                      <TD className="text-right text-xs text-muted-foreground">{timeAgo(i.updated_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
