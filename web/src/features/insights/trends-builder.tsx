import { FilterIcon, PlusIcon, SplitIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EventDefinition, MathOp, PropertyFilter, Series, TrendsQuery } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { MAX_SERIES, seriesColor } from "./chart-data";
import { Combobox } from "./combobox";
import { PropertyFilterRow } from "./property-filter";

const ALL_EVENTS = "__all__";
const MATH: { value: MathOp; label: string }[] = [
  { value: "total", label: "Total count" },
  { value: "unique_users", label: "Unique users" },
  { value: "sum", label: "Sum of" },
  { value: "avg", label: "Average of" },
  { value: "min", label: "Minimum of" },
  { value: "max", label: "Maximum of" },
];

const newFilter = (): PropertyFilter => ({ key: "", operator: "eq", value: "" });

function SeriesRow({
  series,
  index,
  events,
  propertyKeys,
  onChange,
  onRemove,
  colored,
}: {
  colored: boolean;
  series: Series;
  index: number;
  events: EventDefinition[];
  propertyKeys: string[];
  onChange: (series: Series) => void;
  onRemove?: () => void;
}) {
  const needsProperty = !["total", "unique_users"].includes(series.math);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="flex h-5 shrink-0 items-center gap-1.5 rounded-[5px] bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
          {colored && (
            <span
              className="size-2 rounded-[2px]"
              style={{ background: index < MAX_SERIES ? seriesColor(index) : "var(--subtle-foreground)" }}
            />
          )}
          {String.fromCharCode(65 + index)}
        </span>
        <Combobox
          value={series.event ?? ALL_EVENTS}
          display={series.event ?? "All events"}
          searchPlaceholder="Search events…"
          allowCustom
          options={[
            { value: ALL_EVENTS, label: "All events" },
            ...events.map((e) => ({ value: e.name })),
          ]}
          onChange={(v) => onChange({ ...series, event: v === ALL_EVENTS ? null : v })}
          className="font-medium"
        />
        <Select
          value={series.math}
          onValueChange={(math) =>
            onChange({ ...series, math: math as MathOp, math_property: series.math_property ?? null })
          }
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATH.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsProperty && (
          <Combobox
            mono
            allowCustom
            value={series.math_property ?? null}
            placeholder="numeric property"
            options={propertyKeys.map((k) => ({ value: k }))}
            onChange={(math_property) => onChange({ ...series, math_property })}
          />
        )}
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Filter this series"
            title="Filter this series"
            onClick={() => onChange({ ...series, filters: [...series.filters, newFilter()] })}
          >
            <FilterIcon />
          </Button>
          {onRemove && (
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove series">
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {series.filters.map((f, i) => (
        <div key={i} className="pl-7">
          <PropertyFilterRow
            filter={f}
            propertyKeys={propertyKeys}
            onChange={(next) =>
              onChange({ ...series, filters: series.filters.map((x, j) => (j === i ? next : x)) })
            }
            onRemove={() => onChange({ ...series, filters: series.filters.filter((_, j) => j !== i) })}
          />
        </div>
      ))}
    </div>
  );
}

export function TrendsBuilder({
  query,
  onChange,
}: {
  query: TrendsQuery;
  onChange: (query: TrendsQuery) => void;
}) {
  const { apiBase } = useProject();
  const events = useFetch<EventDefinition[]>(`${apiBase}/event-definitions`);
  const keys = useFetch<string[]>(`${apiBase}/property-keys`);
  const propertyKeys = keys.data ?? [];

  const setSeries = (series: Series[]) => onChange({ ...query, series });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">Series</div>
        {query.series.map((s, i) => (
          <SeriesRow
            key={i}
            index={i}
            colored={!query.breakdown}
            series={s}
            events={events.data ?? []}
            propertyKeys={propertyKeys}
            onChange={(next) => setSeries(query.series.map((x, j) => (j === i ? next : x)))}
            onRemove={query.series.length > 1 ? () => setSeries(query.series.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        {query.series.length < 10 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setSeries([...query.series, { event: null, math: "total", filters: [] }])}
          >
            <PlusIcon /> Add series
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Filters</div>
          {query.filters.map((f, i) => (
            <PropertyFilterRow
              key={i}
              filter={f}
              propertyKeys={propertyKeys}
              onChange={(next) => onChange({ ...query, filters: query.filters.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => onChange({ ...query, filters: query.filters.filter((_, j) => j !== i) })}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => onChange({ ...query, filters: [...query.filters, newFilter()] })}
          >
            <FilterIcon /> Add filter
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Breakdown</div>
          <div className="flex items-center gap-1.5">
            <SplitIcon className="size-3.5 text-subtle-foreground" />
            <Combobox
              mono
              allowCustom
              value={query.breakdown}
              placeholder="Break down by property"
              options={propertyKeys.map((k) => ({ value: k }))}
              onChange={(breakdown) => onChange({ ...query, breakdown })}
            />
            {query.breakdown && (
              <Button variant="ghost" size="icon-sm" onClick={() => onChange({ ...query, breakdown: null })} aria-label="Remove breakdown">
                <XIcon />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
