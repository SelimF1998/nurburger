export function snippets(publicKey: string, host = window.location.origin) {
  return {
    js: `import { Nurburger } from "nurburger-js";

const nb = new Nurburger("${publicKey}", { host: "${host}" });

nb.identify("user_123");
nb.capture("signed_up", { plan: "pro" });

if (await nb.isFeatureEnabled("new-checkout")) {
  // show the new checkout
}`,
    python: `from nurburger import Nurburger

nb = Nurburger("${publicKey}", host="${host}")

nb.capture("user_123", "purchase", {"amount": 49})

if nb.feature_enabled("new-checkout", "user_123"):
    ...`,
    curl: `curl -X POST ${host}/v1/capture \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "${publicKey}",
    "event": "signed_up",
    "distinct_id": "user_123",
    "properties": { "plan": "pro" }
  }'`,
    flagsCurl: `curl -X POST ${host}/v1/flags \\
  -H "Content-Type: application/json" \\
  -d '{ "api_key": "${publicKey}", "distinct_id": "user_123" }'`,
    queryCurl: (secret = "nb_sk_…") => `curl -X POST ${host}/v1/query \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{ "kind": "sql", "sql": "SELECT event, count(*) FROM events GROUP BY 1" }'`,
  };
}
