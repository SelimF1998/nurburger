import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Operator, PropertyFilter } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { Combobox } from "./combobox";

export const OPERATORS: { value: Operator; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "doesn’t equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn’t contain" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

const NO_VALUE: Operator[] = ["is_set", "is_not_set"];

export function PropertyFilterRow({
  filter,
  onChange,
  onRemove,
  propertyKeys,
}: {
  filter: PropertyFilter;
  onChange: (filter: PropertyFilter) => void;
  onRemove: () => void;
  propertyKeys: string[];
}) {
  const { apiBase } = useProject();
  const values = useFetch<string[]>(
    filter.key && !NO_VALUE.includes(filter.operator)
      ? `${apiBase}/property-values?key=${encodeURIComponent(filter.key)}`
      : null,
  );
  const listId = `values-${filter.key}`;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-xs text-subtle-foreground">where</span>
      <Combobox
        mono
        allowCustom
        value={filter.key || null}
        placeholder="property"
        searchPlaceholder="Search properties…"
        options={propertyKeys.map((k) => ({ value: k }))}
        onChange={(key) => onChange({ ...filter, key })}
      />
      <Select value={filter.operator} onValueChange={(operator) => onChange({ ...filter, operator: operator as Operator })}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!NO_VALUE.includes(filter.operator) && (
        <>
          <Input
            className="h-7 w-40 text-xs"
            placeholder="value"
            list={listId}
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
          />
          <datalist id={listId}>
            {values.data?.map((v) => <option key={v} value={v} />)}
          </datalist>
        </>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove filter">
        <XIcon />
      </Button>
    </div>
  );
}
