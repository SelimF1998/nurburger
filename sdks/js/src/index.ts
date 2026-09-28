export type Properties = Record<string, unknown>;
export type Flags = Record<string, boolean>;

export interface NurburgerOptions {
  /** API host, e.g. https://nurburger.example.com. Defaults to http://localhost:8000. */
  host?: string;
  /** Send a batch once this many events are queued. Default 20. */
  flushAt?: number;
  /** Send queued events at least this often (ms). Default 5000. */
  flushInterval?: number;
  /** Browser only: capture a $pageview on init. Default true. */
  capturePageview?: boolean;
  /** Browser only: persist the distinct ID in localStorage. Default true. */
  persist?: boolean;
  /** Reuse evaluated flags for this long (ms). Default 60000. */
  flagsTtl?: number;
}

interface QueuedEvent {
  event: string;
  distinct_id: string;
  properties: Properties;
  timestamp: string;
}

const VERSION = "0.1.0";
const STORAGE_KEY = "nb_distinct_id";
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function browserProperties(): Properties {
  if (!isBrowser) return { $lib: "nurburger-js", $lib_version: VERSION };
  return {
    $lib: "nurburger-js",
    $lib_version: VERSION,
    $current_url: window.location.href,
    $host: window.location.host,
    $pathname: window.location.pathname,
    $referrer: document.referrer || undefined,
    $screen_width: window.screen?.width,
    $screen_height: window.screen?.height,
    $browser_language: navigator.language,
    $user_agent: navigator.userAgent,
  };
}

/**
 * Nurburger client.
 *
 * Browser: one instance per page. The current user is tracked for you.
 * Node: pass `distinctId` to `capture` / `isFeatureEnabled` per call.
 */
export class Nurburger {
  private readonly apiKey: string;
  private readonly host: string;
  private readonly opts: Required<Omit<NurburgerOptions, "host">>;
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private superProperties: Properties = {};
  private currentId: string;
  private flagCache = new Map<string, { flags: Flags; at: number; pending?: Promise<Flags> }>();
  private flagListeners = new Set<(flags: Flags) => void>();

  constructor(apiKey: string, options: NurburgerOptions = {}) {
    if (!apiKey) throw new Error("Nurburger: apiKey is required");
    this.apiKey = apiKey;
    this.host = (options.host ?? "http://localhost:8000").replace(/\/$/, "");
    this.opts = {
      flushAt: options.flushAt ?? 20,
      flushInterval: options.flushInterval ?? 5000,
      capturePageview: options.capturePageview ?? true,
      persist: options.persist ?? true,
      flagsTtl: options.flagsTtl ?? 60_000,
    };
    this.currentId = this.loadDistinctId();
    this.timer = setInterval(() => void this.flush(), this.opts.flushInterval);
    // Don't keep Node processes alive just for the flush timer.
    (this.timer as { unref?: () => void }).unref?.();

    if (isBrowser) {
      const flushOnHide = () => document.visibilityState === "hidden" && this.flush({ beacon: true });
      document.addEventListener("visibilitychange", flushOnHide);
      window.addEventListener("pagehide", () => this.flush({ beacon: true }));
      if (this.opts.capturePageview) this.capture("$pageview");
    }
  }

  /** The distinct ID events are attributed to (browser mode). */
  get distinctId(): string {
    return this.currentId;
  }

  /** Associate future events with a known user ID. */
  identify(distinctId: string, properties: Properties = {}): void {
    if (!distinctId || distinctId === this.currentId) return;
    const previous = this.currentId;
    this.currentId = distinctId;
    this.saveDistinctId(distinctId);
    this.capture("$identify", { ...properties, $anon_distinct_id: previous });
    void this.reloadFeatureFlags();
  }

  /** Forget the current user (e.g. on logout) and start a new anonymous ID. */
  reset(): void {
    this.currentId = uuid();
    this.saveDistinctId(this.currentId);
    this.superProperties = {};
    this.flagCache.clear();
  }

  /** Properties sent with every subsequent event. */
  register(properties: Properties): void {
    Object.assign(this.superProperties, properties);
  }

  capture(
    event: string,
    properties: Properties = {},
    options: { distinctId?: string; timestamp?: Date } = {},
  ): void {
    this.queue.push({
      event,
      distinct_id: options.distinctId ?? this.currentId,
      properties: { ...browserProperties(), ...this.superProperties, ...properties },
      timestamp: (options.timestamp ?? new Date()).toISOString(),
    });
    if (this.queue.length >= this.opts.flushAt) void this.flush();
  }

  /** Send all queued events now. */
  async flush(options: { beacon?: boolean } = {}): Promise<void> {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.queue.length);
    const body = JSON.stringify({ api_key: this.apiKey, batch });
    const url = `${this.host}/v1/batch`;

    if (options.beacon && isBrowser && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: isBrowser,
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Network or server error: requeue once so events aren't lost to a blip.
      this.queue.unshift(...batch.slice(0, 1000));
    }
  }

  async getFeatureFlags(options: { distinctId?: string; force?: boolean } = {}): Promise<Flags> {
    const id = options.distinctId ?? this.currentId;
    const cached = this.flagCache.get(id);
    if (!options.force && cached) {
      if (cached.pending) return cached.pending;
      if (Date.now() - cached.at < this.opts.flagsTtl) return cached.flags;
    }
    const pending = this.fetchFlags(id);
    this.flagCache.set(id, { flags: cached?.flags ?? {}, at: cached?.at ?? 0, pending });
    try {
      const flags = await pending;
      this.flagCache.set(id, { flags, at: Date.now() });
      if (id === this.currentId) for (const cb of this.flagListeners) cb(flags);
      return flags;
    } catch {
      this.flagCache.set(id, { flags: cached?.flags ?? {}, at: cached?.at ?? 0 });
      return cached?.flags ?? {};
    }
  }

  async isFeatureEnabled(key: string, options: { distinctId?: string } = {}): Promise<boolean> {
    const flags = await this.getFeatureFlags(options);
    return flags[key] ?? false;
  }

  reloadFeatureFlags(): Promise<Flags> {
    return this.getFeatureFlags({ force: true });
  }

  /** Called whenever the current user's flags are (re)loaded. Returns an unsubscribe fn. */
  onFeatureFlags(callback: (flags: Flags) => void): () => void {
    this.flagListeners.add(callback);
    const cached = this.flagCache.get(this.currentId);
    if (cached && !cached.pending && cached.at) callback(cached.flags);
    else void this.getFeatureFlags();
    return () => this.flagListeners.delete(callback);
  }

  /** Flush and stop the background timer (call before a Node process exits). */
  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  private async fetchFlags(distinctId: string): Promise<Flags> {
    const res = await fetch(`${this.host}/v1/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey, distinct_id: distinctId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { flags: Flags }).flags;
  }

  private loadDistinctId(): string {
    if (isBrowser && this.opts.persist) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) return saved;
        const id = uuid();
        window.localStorage.setItem(STORAGE_KEY, id);
        return id;
      } catch {
        // storage blocked; fall through to an in-memory ID
      }
    }
    return uuid();
  }

  private saveDistinctId(id: string): void {
    if (!isBrowser || !this.opts.persist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }
}

export default Nurburger;
