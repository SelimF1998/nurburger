# nurburger-js

A small, dependency-free client for browsers and Node 18+.

```ts
import { Nurburger } from "nurburger-js";

const nb = new Nurburger("nb_pk_...", { host: "http://localhost:5173" });

nb.identify("user_123");
nb.register({ app_version: "2.4.0" });   // sent with every event
nb.capture("purchase", { amount: 49 });

if (await nb.isFeatureEnabled("new-checkout")) {
  // ...
}

nb.onFeatureFlags((flags) => console.log(flags));
```

In Node, pass the user explicitly and flush before the process exits:

```ts
const nb = new Nurburger(process.env.NURBURGER_KEY!, { host: "https://nb.example.com" });
nb.capture("invoice_paid", { amount: 120 }, { distinctId: user.id });
await nb.isFeatureEnabled("beta-api", { distinctId: user.id });
await nb.shutdown();
```

Events are batched: they're sent every 5s, when 20 are queued, or via `sendBeacon` when the page is hidden.
