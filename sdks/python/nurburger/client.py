"""Dependency-free Nurburger client.

Events are queued and sent in batches from a background thread, so `capture()`
never blocks your request handlers. Call `shutdown()` (it also runs at exit) to
flush what's left.
"""

from __future__ import annotations

import atexit
import json
import logging
import queue
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger("nurburger")
VERSION = "0.1.0"


class NurburgerError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"{status}: {message}")
        self.status = status


class Nurburger:
    def __init__(
        self,
        api_key: str,
        host: str = "http://localhost:8000",
        *,
        secret_key: Optional[str] = None,
        flush_at: int = 50,
        flush_interval: float = 2.0,
        flags_ttl: float = 30.0,
        timeout: float = 10.0,
        disabled: bool = False,
    ):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.secret_key = secret_key
        self.host = host.rstrip("/")
        self.flush_at = flush_at
        self.flush_interval = flush_interval
        self.flags_ttl = flags_ttl
        self.timeout = timeout
        self.disabled = disabled

        self._queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=10_000)
        self._flags: dict[str, tuple[float, dict[str, bool]]] = {}
        self._flags_lock = threading.Lock()
        self._stop = threading.Event()
        self._flush_now = threading.Event()
        self._worker = threading.Thread(target=self._run, name="nurburger", daemon=True)
        self._worker.start()
        atexit.register(self.shutdown)

    # --- Events ---------------------------------------------------------------

    def capture(
        self,
        distinct_id: str,
        event: str,
        properties: Optional[dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ) -> None:
        if self.disabled:
            return
        ts = timestamp or datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        payload = {
            "event": event,
            "distinct_id": str(distinct_id),
            "properties": {"$lib": "nurburger-python", "$lib_version": VERSION, **(properties or {})},
            "timestamp": ts.isoformat(),
        }
        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            log.warning("nurburger queue full; dropping event %s", event)
            return
        if self._queue.qsize() >= self.flush_at:
            self._flush_now.set()

    def identify(self, distinct_id: str, properties: Optional[dict[str, Any]] = None) -> None:
        self.capture(distinct_id, "$identify", properties)

    def flush(self) -> None:
        """Send everything queued so far, synchronously."""
        while True:
            batch = self._drain()
            if not batch:
                return
            self._send_batch(batch)

    def shutdown(self) -> None:
        if self._stop.is_set():
            return
        self._stop.set()
        self._flush_now.set()
        self._worker.join(timeout=self.timeout)
        self.flush()

    # --- Feature flags --------------------------------------------------------

    def get_feature_flags(self, distinct_id: str, *, force: bool = False) -> dict[str, bool]:
        distinct_id = str(distinct_id)
        now = time.monotonic()
        with self._flags_lock:
            cached = self._flags.get(distinct_id)
        if cached and not force and now - cached[0] < self.flags_ttl:
            return cached[1]
        try:
            flags = self._post("/v1/flags", {"api_key": self.api_key, "distinct_id": distinct_id})[
                "flags"
            ]
        except Exception:  # noqa: BLE001 - never break the caller over a flag lookup
            log.warning("nurburger: flag evaluation failed", exc_info=True)
            return cached[1] if cached else {}
        with self._flags_lock:
            if len(self._flags) > 10_000:
                self._flags.clear()
            self._flags[distinct_id] = (now, flags)
        return flags

    def feature_enabled(self, key: str, distinct_id: str, default: bool = False) -> bool:
        return self.get_feature_flags(distinct_id).get(key, default)

    # --- Queries (secret key) -------------------------------------------------

    def query_sql(self, sql: str) -> dict[str, Any]:
        """Run SQL against this project's `events` table. Returns {columns, rows, ...}."""
        return self._post("/v1/query", {"kind": "sql", "sql": sql}, secret=True)

    def query_trends(self, **query: Any) -> dict[str, Any]:
        """Run a trends query, e.g. query_trends(series=[{"event": "signup"}], date_from="-30d")."""
        return self._post("/v1/query", {"kind": "trends", **query}, secret=True)

    def insight_result(self, insight_id: str) -> dict[str, Any]:
        return self._get(f"/v1/insights/{insight_id}/result", secret=True)

    # --- Internals ------------------------------------------------------------

    def _run(self) -> None:
        while not self._stop.is_set():
            self._flush_now.wait(self.flush_interval)
            self._flush_now.clear()
            batch = self._drain()
            if batch:
                self._send_batch(batch)

    def _drain(self, limit: int = 1000) -> list[dict[str, Any]]:
        batch: list[dict[str, Any]] = []
        while len(batch) < limit:
            try:
                batch.append(self._queue.get_nowait())
            except queue.Empty:
                break
        return batch

    def _send_batch(self, batch: list[dict[str, Any]]) -> None:
        for attempt in range(3):
            try:
                self._post("/v1/batch", {"api_key": self.api_key, "batch": batch})
                return
            except NurburgerError as e:
                if e.status < 500:
                    log.error("nurburger: batch rejected: %s", e)
                    return
            except (urllib.error.URLError, TimeoutError, OSError):
                pass
            time.sleep(0.5 * 2**attempt)
        log.error("nurburger: dropping %d events after retries", len(batch))

    def _headers(self, secret: bool) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "User-Agent": f"nurburger-python/{VERSION}"}
        if secret:
            if not self.secret_key:
                raise ValueError("This call needs secret_key=... (create one in project settings)")
            headers["Authorization"] = f"Bearer {self.secret_key}"
        return headers

    def _request(self, method: str, path: str, body: Any = None, secret: bool = False) -> Any:
        data = json.dumps(body, default=str).encode() if body is not None else None
        req = urllib.request.Request(
            self.host + path, data=data, method=method, headers=self._headers(secret)
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read() or b"null")
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read()).get("detail", e.reason)
            except ValueError:
                detail = e.reason
            raise NurburgerError(e.code, str(detail)) from None

    def _post(self, path: str, body: Any, secret: bool = False) -> Any:
        return self._request("POST", path, body, secret)

    def _get(self, path: str, secret: bool = False) -> Any:
        return self._request("GET", path, None, secret)
