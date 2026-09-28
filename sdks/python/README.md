# nurburger (Python)

Standard library only; Python 3.9+.

```python
from nurburger import Nurburger

nb = Nurburger("nb_pk_...", host="http://localhost:8000", secret_key="nb_sk_...")

nb.capture("user_123", "purchase", {"amount": 49})

if nb.feature_enabled("new-checkout", "user_123"):
    ...

# Needs secret_key
nb.query_sql("SELECT event, count(*) FROM events GROUP BY 1")
nb.query_trends(series=[{"event": "signup", "math": "unique_users"}], date_from="-30d")
nb.insight_result("<insight id>")
```

`capture` only enqueues. A background thread sends batches every 2s, or as soon as 50 events are queued. `shutdown()` flushes whatever is left, and it's registered with `atexit` for you.
