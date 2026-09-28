import re, pathlib
p = pathlib.Path("/home/selim/pasta/project/api/app/demo/fixtures.py")
src = p.read_text()
start = src.index('_sql(\n            """\nWITH signups AS')
end = src.index('"""', src.index("LIMIT 12", start)) + 3
new = '''_sql(
            """
WITH signups AS (
  SELECT distinct_id, date_trunc('week', min(timestamp)) AS cohort
  FROM events WHERE event = 'signed_up'
  GROUP BY 1
),
weekly AS (
  SELECT DISTINCT distinct_id, date_trunc('week', timestamp) AS week_start
  FROM events
),
activity AS (
  SELECT s.cohort, (w.week_start::date - s.cohort::date) / 7 AS week
  FROM weekly w JOIN signups s ON s.distinct_id = w.distinct_id
)
SELECT
  to_char(cohort, 'YYYY-MM-DD') AS cohort,
  count(*) FILTER (WHERE week = 0) AS users,
  CASE WHEN cohort + interval '2 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 1) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_1,
  CASE WHEN cohort + interval '3 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 2) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_2,
  CASE WHEN cohort + interval '5 weeks' <= now() THEN round(100.0 * count(*) FILTER (WHERE week = 4) / nullif(count(*) FILTER (WHERE week = 0), 0), 1) END AS week_4
FROM activity
GROUP BY cohort
ORDER BY cohort DESC
LIMIT 12
"""'''
p.write_text(src[:start] + new + src[end:])
print("patched")
