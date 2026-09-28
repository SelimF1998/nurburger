import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.models import Role

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
FlagKey = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[a-zA-Z0-9_\-]{1,120}$")
]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Users / orgs / projects ------------------------------------------------------


class UserOut(ORM):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None


class ProjectOut(ORM):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    public_key: str
    is_demo: bool = False
    created_at: datetime


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    role: Role
    projects: list[ProjectOut]
    is_demo: bool = False


class MeOut(BaseModel):
    user: UserOut
    orgs: list[OrgOut]


class OrgCreate(BaseModel):
    name: Name
    project_name: Name = "Default project"


class OrgUpdate(BaseModel):
    name: Name


class MemberOut(BaseModel):
    user: UserOut
    role: Role
    joined_at: datetime


class InviteCreate(BaseModel):
    email: EmailStr
    role: Role = Role.member


class InviteOut(ORM):
    id: uuid.UUID
    email: str
    role: Role
    created_at: datetime


class RoleUpdate(BaseModel):
    role: Role


class ProjectCreate(BaseModel):
    name: Name


class ProjectUpdate(BaseModel):
    name: Name


class SecretKeyCreate(BaseModel):
    name: Name


class SecretKeyOut(ORM):
    id: uuid.UUID
    name: str
    mask: str
    created_at: datetime
    last_used_at: datetime | None


class SecretKeyCreated(SecretKeyOut):
    key: str


# --- Events -----------------------------------------------------------------------


class EventOut(ORM):
    uuid: uuid.UUID
    event: str
    distinct_id: str
    properties: dict[str, Any]
    timestamp: datetime


class EventPage(BaseModel):
    results: list[EventOut]
    next_cursor: str | None


class EventDefinitionOut(ORM):
    name: str
    description: str
    first_seen_at: datetime
    last_seen_at: datetime
    total_count: int
    volume_30d: int = 0


class EventDefinitionUpdate(BaseModel):
    description: str = Field(max_length=2000)


# --- Ingestion (public API) -------------------------------------------------------


class CaptureEvent(BaseModel):
    event: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    distinct_id: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    properties: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = None


class CaptureRequest(CaptureEvent):
    api_key: str


class BatchRequest(BaseModel):
    api_key: str
    batch: list[CaptureEvent] = Field(min_length=1, max_length=1000)


class FlagsRequest(BaseModel):
    api_key: str
    distinct_id: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class FlagsResponse(BaseModel):
    flags: dict[str, bool]


# --- Feature flags ----------------------------------------------------------------


class FlagCreate(BaseModel):
    key: FlagKey
    name: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)
    active: bool = True
    rollout_percentage: int = Field(default=100, ge=0, le=100)


class FlagUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    active: bool | None = None
    rollout_percentage: int | None = Field(default=None, ge=0, le=100)


class FlagOut(ORM):
    id: uuid.UUID
    key: str
    name: str
    description: str
    active: bool
    rollout_percentage: int
    created_at: datetime
    updated_at: datetime


# --- Queries ----------------------------------------------------------------------

Operator = Literal["eq", "neq", "contains", "not_contains", "is_set", "is_not_set", "gt", "lt"]
Math = Literal["total", "unique_users", "sum", "avg", "min", "max"]
Interval = Literal["hour", "day", "week", "month"]


class PropertyFilter(BaseModel):
    key: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    operator: Operator = "eq"
    value: str | float | None = None


class Series(BaseModel):
    event: str | None = None  # None means "all events"
    math: Math = "total"
    math_property: str | None = None
    filters: list[PropertyFilter] = Field(default_factory=list)
    label: str | None = None


class TrendsQuery(BaseModel):
    kind: Literal["trends"] = "trends"
    series: list[Series] = Field(min_length=1, max_length=10)
    filters: list[PropertyFilter] = Field(default_factory=list)
    breakdown: str | None = None
    interval: Interval = "day"
    date_from: str = "-7d"
    date_to: str | None = None


class SqlQuery(BaseModel):
    kind: Literal["sql"] = "sql"
    sql: Annotated[str, StringConstraints(min_length=1, max_length=20_000)]


AnyQuery = Annotated[TrendsQuery | SqlQuery, Field(discriminator="kind")]


class TrendsSeriesResult(BaseModel):
    label: str
    event: str | None
    breakdown_value: str | None = None
    data: list[float]
    total: float


class TrendsResult(BaseModel):
    kind: Literal["trends"] = "trends"
    labels: list[datetime]
    interval: Interval
    series: list[TrendsSeriesResult]


class SqlResult(BaseModel):
    kind: Literal["sql"] = "sql"
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool
    elapsed_ms: int


QueryResult = Annotated[TrendsResult | SqlResult, Field(discriminator="kind")]


# --- Insights & dashboards --------------------------------------------------------

VizType = Literal["line", "bar", "area", "number", "table", "totals"]


class Viz(BaseModel):
    type: VizType = "line"
    # SQL insights: which column is the x axis / which are the series
    x: str | None = None
    y: list[str] = Field(default_factory=list)


class InsightCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: str = Field(default="", max_length=2000)
    query: AnyQuery
    viz: Viz = Field(default_factory=Viz)


class InsightUpdate(BaseModel):
    name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
        | None
    ) = None
    description: str | None = Field(default=None, max_length=2000)
    query: AnyQuery | None = None
    viz: Viz | None = None


class InsightOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    kind: str
    query: dict[str, Any]
    viz: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DashboardCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: str = Field(default="", max_length=2000)


class DashboardUpdate(BaseModel):
    name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
        | None
    ) = None
    description: str | None = Field(default=None, max_length=2000)


class TileOut(ORM):
    id: uuid.UUID
    position: int
    width: int
    insight: InsightOut


class DashboardOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    tile_count: int = 0


class DashboardDetail(DashboardOut):
    tiles: list[TileOut]


class TileCreate(BaseModel):
    insight_id: uuid.UUID
    width: int = Field(default=1, ge=1, le=2)


class TileUpdate(BaseModel):
    width: int | None = Field(default=None, ge=1, le=2)


class TileOrder(BaseModel):
    tile_ids: list[uuid.UUID]
