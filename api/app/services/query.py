import uuid

from fastapi import HTTPException, status
from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Insight
from app.schemas import AnyQuery, SqlQuery, SqlResult, TrendsQuery, TrendsResult
from app.services.sql import SqlError, run_sql
from app.services.trends import QueryError, run_trends

_query_adapter: TypeAdapter[TrendsQuery | SqlQuery] = TypeAdapter(AnyQuery)


async def run_query(
    db: AsyncSession, project_id: uuid.UUID, query: TrendsQuery | SqlQuery
) -> TrendsResult | SqlResult:
    try:
        if isinstance(query, SqlQuery):
            return await run_sql(project_id, query.sql)
        return await run_trends(db, project_id, query)
    except (QueryError, SqlError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e


async def run_insight(db: AsyncSession, insight: Insight) -> TrendsResult | SqlResult:
    return await run_query(db, insight.project_id, _query_adapter.validate_python(insight.query))
