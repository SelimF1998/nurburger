import {
  AreaChartIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  HashIcon,
  LineChartIcon,
  TableIcon,
} from "lucide-react";
import { Segmented } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Interval, TrendsQuery, VizType } from "@/lib/types";

export const VIZ_OPTIONS: { value: VizType; label: React.ReactNode; title: string }[] = [
  { value: "line", label: <LineChartIcon />, title: "Line" },
  { value: "area", label: <AreaChartIcon />, title: "Area" },
  { value: "bar", label: <BarChart3Icon />, title: "Bar" },
  { value: "totals", label: <BarChartHorizontalIcon />, title: "Totals" },
  { value: "number", label: <HashIcon />, title: "Number" },
  { value: "table", label: <TableIcon />, title: "Table" },
];

export const DATE_PRESETS = [
  { value: "-24h", label: "Last 24 hours" },
  { value: "-7d", label: "Last 7 days" },
  { value: "-30d", label: "Last 30 days" },
  { value: "-90d", label: "Last 90 days" },
  { value: "-180d", label: "Last 180 days" },
  { value: "-1y", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function VizTypePicker({ value, onChange }: { value: VizType; onChange: (v: VizType) => void }) {
  return <Segmented value={value} onChange={onChange} options={VIZ_OPTIONS} />;
}

export function DateControls({
  query,
  onChange,
}: {
  query: TrendsQuery;
  onChange: (query: TrendsQuery) => void;
}) {
  const setRange = (date_from: string) => {
    let interval = query.interval;
    if (date_from === "-24h") interval = "hour";
    else if (interval === "hour") interval = "day";
    onChange({ ...query, date_from, date_to: null, interval });
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={query.date_from} onValueChange={setRange}>
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Segmented
        value={query.interval}
        onChange={(interval) => onChange({ ...query, interval })}
        options={INTERVALS}
      />
    </div>
  );
}
