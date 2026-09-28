import type { Interval, QueryResult, Viz } from "@/lib/types";

export const MAX_SERIES = 8;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  data: number[];
  total: number;
}

export interface ChartData {
  labels: string[];
  /** Set when x values are timestamps */
  interval: Interval | null;
  series: ChartSeries[];
}

/** Categorical colors in fixed order; never cycled. Overflow folds into "Other". */
export const seriesColor = (i: number) => `var(--series-${i + 1})`;
const OTHER_COLOR = "var(--subtle-foreground)";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$/;

function foldSeries(series: Omit<ChartSeries, "color" | "key">[]): ChartSeries[] {
  const withColor = (s: Omit<ChartSeries, "color" | "key">, i: number, color = seriesColor(i)) => ({
    ...s,
    key: `s${i}`,
    color,
  });
  if (series.length <= MAX_SERIES) return series.map((s, i) => withColor(s, i));
  const kept = series.slice(0, MAX_SERIES - 1);
  const rest = series.slice(MAX_SERIES - 1);
  const other = {
    label: `Other (${rest.length})`,
    data: rest[0].data.map((_, i) => rest.reduce((sum, s) => sum + (s.data[i] ?? 0), 0)),
    total: rest.reduce((sum, s) => sum + s.total, 0),
  };
  return [...kept.map((s, i) => withColor(s, i)), withColor(other, MAX_SERIES - 1, OTHER_COLOR)];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Columns in a SQL result whose non-null values are all numeric. */
export function numericColumns(result: QueryResult): string[] {
  if (result.kind !== "sql") return [];
  return result.columns.filter((_, ci) => {
    const values = result.rows.map((r) => r[ci]).filter((v) => v !== null && v !== undefined);
    return values.length > 0 && values.every((v) => toNumber(v) !== null);
  });
}

export function toChartData(result: QueryResult, viz: Viz): ChartData {
  if (result.kind === "trends") {
    return {
      labels: result.labels,
      interval: result.interval,
      series: foldSeries(
        result.series.map((s) => ({ label: s.label, data: s.data, total: s.total })),
      ),
    };
  }

  const numeric = numericColumns(result);
  const x = viz.x && result.columns.includes(viz.x) ? viz.x : result.columns.find((c) => !numeric.includes(c)) ?? result.columns[0];
  const ys = (viz.y?.length ? viz.y : numeric).filter((c) => c !== x && result.columns.includes(c));
  const xi = result.columns.indexOf(x);
  const labels = result.rows.map((r) => String(r[xi] ?? "(null)"));
  const isTime = labels.length > 0 && labels.every((l) => ISO_DATE.test(l));

  return {
    labels,
    interval: isTime ? "day" : null,
    series: foldSeries(
      ys.map((col) => {
        const ci = result.columns.indexOf(col);
        const data = result.rows.map((r) => toNumber(r[ci]) ?? 0);
        return { label: col, data, total: data.reduce((a, b) => a + b, 0) };
      }),
    ),
  };
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const hourFmt = fmt({ hour: "2-digit", minute: "2-digit" });
const dayFmt = fmt({ month: "short", day: "numeric" });
const monthFmt = fmt({ month: "short", year: "numeric" });
const fullFmt = fmt({ weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fullHourFmt = fmt({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatTick(label: string, interval: Interval | null): string {
  if (!interval) return label;
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return label;
  if (interval === "hour") return hourFmt.format(d);
  if (interval === "month") return monthFmt.format(d);
  return dayFmt.format(d);
}

export function formatTooltipLabel(label: string, interval: Interval | null): string {
  if (!interval) return label;
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return label;
  if (interval === "hour") return fullHourFmt.format(d);
  if (interval === "month") return monthFmt.format(d);
  if (interval === "week") return `Week of ${dayFmt.format(d)}`;
  return fullFmt.format(d);
}
