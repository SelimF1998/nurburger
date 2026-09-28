export type Role = "owner" | "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  public_key: string;
  is_demo: boolean;
  created_at: string;
}

export interface Org {
  id: string;
  name: string;
  role: Role;
  projects: Project[];
  is_demo: boolean;
}

export interface Me {
  user: User;
  orgs: Org[];
}

export interface Member {
  user: User;
  role: Role;
  joined_at: string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface SecretKey {
  id: string;
  name: string;
  mask: string;
  created_at: string;
  last_used_at: string | null;
}

export interface EventRecord {
  uuid: string;
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface EventDefinition {
  name: string;
  description: string;
  first_seen_at: string;
  last_seen_at: string;
  total_count: number;
  volume_30d: number;
}

export interface Flag {
  id: string;
  key: string;
  name: string;
  description: string;
  active: boolean;
  rollout_percentage: number;
  created_at: string;
  updated_at: string;
}

// --- Queries ---------------------------------------------------------------

export type Operator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "is_set"
  | "is_not_set"
  | "gt"
  | "lt";
export type MathOp = "total" | "unique_users" | "sum" | "avg" | "min" | "max";
export type Interval = "hour" | "day" | "week" | "month";

export interface PropertyFilter {
  key: string;
  operator: Operator;
  value?: string | number | null;
}

export interface Series {
  event: string | null;
  math: MathOp;
  math_property?: string | null;
  filters: PropertyFilter[];
  label?: string | null;
}

export interface TrendsQuery {
  kind: "trends";
  series: Series[];
  filters: PropertyFilter[];
  breakdown: string | null;
  interval: Interval;
  date_from: string;
  date_to: string | null;
}

export interface SqlQuery {
  kind: "sql";
  sql: string;
}

export type Query = TrendsQuery | SqlQuery;

export interface TrendsResult {
  kind: "trends";
  labels: string[];
  interval: Interval;
  series: {
    label: string;
    event: string | null;
    breakdown_value: string | null;
    data: number[];
    total: number;
  }[];
}

export interface SqlResult {
  kind: "sql";
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  elapsed_ms: number;
}

export type QueryResult = TrendsResult | SqlResult;

export type VizType = "line" | "bar" | "area" | "number" | "table" | "totals";

export interface Viz {
  type: VizType;
  x?: string | null;
  y?: string[];
}

export interface Insight {
  id: string;
  name: string;
  description: string;
  kind: "trends" | "sql";
  query: Query;
  viz: Viz;
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  created_at: string;
  tile_count: number;
}

export interface Tile {
  id: string;
  position: number;
  width: 1 | 2;
  insight: Insight;
}

export interface DashboardDetail extends Dashboard {
  tiles: Tile[];
}
