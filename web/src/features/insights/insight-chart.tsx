import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { QueryResult, SqlResult, Viz } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { type ChartData, formatTick, formatTooltipLabel, toChartData } from "./chart-data";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

function Legend({ data }: { data: ChartData }) {
  if (data.series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
      {data.series.map((s) => (
        <div key={s.key} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
          <span className="max-w-56 truncate" title={s.label}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  data: ChartData;
}

function ChartTooltip({ active, label, payload, data }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(data.series.map((s) => [s.key, s]));
  const rows = payload
    .map((p) => ({ series: byKey.get(String(p.dataKey)), value: Number(p.value ?? 0) }))
    .filter((r) => r.series)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg shadow-black/10">
      <div className="mb-1.5 font-medium">{formatTooltipLabel(String(label), data.interval)}</div>
      <div className="flex flex-col gap-1">
        {rows.map(({ series, value }) => (
          <div key={series!.key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: series!.color }} />
            <span className="max-w-48 truncate text-muted-foreground">{series!.label}</span>
            <span className="ml-auto pl-3 font-medium tabular">{formatNumber(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function yAxisWidth(data: ChartData) {
  const max = Math.max(0, ...data.series.flatMap((s) => s.data));
  return Math.max(28, formatNumber(max, { compact: true }).length * 7 + 10);
}

function CartesianChart({ data, type, height }: { data: ChartData; type: "line" | "area" | "bar"; height: number }) {
  const rows = useMemo(
    () =>
      data.labels.map((label, i) => {
        const row: Record<string, string | number> = { x: label };
        for (const s of data.series) row[s.key] = s.data[i] ?? 0;
        return row;
      }),
    [data],
  );

  const common = {
    data: rows,
    margin: { top: 4, right: 4, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
      <XAxis
        dataKey="x"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: "var(--chart-grid)" }}
        tickFormatter={(v: string) => formatTick(v, data.interval)}
        minTickGap={24}
        tickMargin={8}
      />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={yAxisWidth(data)}
        tickFormatter={(v: number) => formatNumber(v, { compact: true })}
        allowDecimals={false}
      />
      <Tooltip
        cursor={
          type === "bar"
            ? { fill: "var(--accent)", opacity: 0.6 }
            : { stroke: "var(--chart-axis)", strokeWidth: 1 }
        }
        content={(props) => (
          <ChartTooltip
            active={props.active}
            label={props.label as string | number | undefined}
            payload={props.payload as TooltipProps["payload"]}
            data={data}
          />
        )}
        isAnimationActive={false}
      />
    </>
  );
  const activeDot = { r: 4, strokeWidth: 2, stroke: "var(--background)" };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {type === "bar" ? (
        <BarChart {...common} barGap={2} barCategoryGap="20%">
          {axes}
          {data.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : type === "area" ? (
        <AreaChart {...common}>
          {axes}
          {data.series.map((s) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ ...activeDot, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart {...common}>
          {axes}
          {data.series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={data.labels.length === 1 ? { r: 4, fill: s.color, strokeWidth: 0 } : false}
              activeDot={{ ...activeDot, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

/** Horizontal bars of each series' total, sorted. The honest alternative to a pie. */
function TotalsChart({ data }: { data: ChartData }) {
  const sorted = [...data.series].sort((a, b) => b.total - a.total);
  const max = Math.max(...sorted.map((s) => s.total), 1);
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {sorted.map((s) => (
        <div key={s.key} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-xs text-muted-foreground" title={s.label}>
            {s.label}
          </span>
          <span className="text-right text-xs font-medium tabular">{formatNumber(s.total)}</span>
          <div className="col-span-2 h-3 overflow-hidden">
            <div
              className="h-full rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max((s.total / max) * 100, 0.5)}%`, background: s.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BigNumber({ data }: { data: ChartData }) {
  const first = data.series[0];
  return (
    <div className="flex h-full flex-col justify-center py-4">
      <div className="text-4xl font-semibold tracking-tight">{formatNumber(first?.total ?? 0)}</div>
      {first && <div className="mt-1 truncate text-[13px] text-muted-foreground">{first.label}</div>}
      {data.series.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {data.series.slice(1).map((s) => (
            <div key={s.key}>
              <div className="text-lg font-semibold tabular">{formatNumber(s.total)}</div>
              <div className="max-w-48 truncate text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({ data }: { data: ChartData }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>{data.interval ? "Date" : "Label"}</TH>
          {data.series.map((s) => (
            <TH key={s.key} className="text-right">
              <span className="inline-flex max-w-48 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
              </span>
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {data.labels.map((label, i) => (
          <TR key={`${label}-${i}`}>
            <TD className="text-xs whitespace-nowrap text-muted-foreground">
              {formatTooltipLabel(label, data.interval)}
            </TD>
            {data.series.map((s) => (
              <TD key={s.key} className="text-right tabular">
                {formatNumber(s.data[i] ?? 0)}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function SqlTable({ result, className }: { result: SqlResult; className?: string }) {
  return (
    <div className={cn("overflow-auto", className)}>
      <Table>
        <THead>
          <TR>
            {result.columns.map((c, i) => (
              <TH key={`${c}-${i}`} className="font-mono">
                {c}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {result.rows.map((row, ri) => (
            <TR key={ri}>
              {row.map((v, ci) => (
                <TD key={ci} className="h-8 max-w-80 truncate font-mono text-xs">
                  {v === null ? (
                    <span className="text-subtle-foreground">null</span>
                  ) : typeof v === "object" ? (
                    JSON.stringify(v)
                  ) : (
                    String(v)
                  )}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function InsightChart({
  result,
  viz,
  height = 300,
}: {
  result: QueryResult;
  viz: Viz;
  height?: number;
}) {
  const data = useMemo(() => toChartData(result, viz), [result, viz]);

  if (viz.type === "table") {
    return result.kind === "sql" ? <SqlTable result={result} /> : <DataTable data={data} />;
  }
  if (!data.series.length || !data.labels.length) {
    return (
      <div className="flex items-center justify-center text-[13px] text-muted-foreground" style={{ height }}>
        {result.kind === "sql" && !data.series.length && result.rows.length
          ? "Pick a numeric column to chart, or switch to the table view."
          : "No data in this range."}
      </div>
    );
  }
  if (viz.type === "number") return <BigNumber data={data} />;
  if (viz.type === "totals") return <TotalsChart data={data} />;
  return (
    <div>
      <Legend data={data} />
      <CartesianChart data={data} type={viz.type} height={height} />
    </div>
  );
}
