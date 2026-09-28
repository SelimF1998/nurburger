import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Link } from "react-router";
import { CodeBlock, KeyField, PageBody, PageHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { snippets } from "@/lib/snippets";
import type { Dashboard, EventDefinition, Flag, Insight } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { cn, formatNumber } from "@/lib/utils";

function Step({
  done,
  index,
  title,
  description,
  to,
  cta,
}: {
  done: boolean | undefined;
  index: number;
  title: string;
  description: string;
  to: string;
  cta: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
          done
            ? "border-success/30 bg-success/15 text-success"
            : "border-border text-muted-foreground",
        )}
      >
        {done ? <CheckIcon className="size-3" /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13px] font-medium", done && "text-muted-foreground line-through decoration-subtle-foreground")}>
          {title}
        </div>
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        {cta} <ArrowRightIcon className="size-3" />
      </span>
    </Link>
  );
}

const TOUR = [
  {
    title: "Product overview dashboard",
    body: "Daily active users, activation and the last 24 hours of activity, which updates as live events arrive.",
    dashboard: "Product overview",
  },
  {
    title: "Spot the Product Hunt launch",
    body: "“Signups by source” shows a spike 45 days ago, mostly from producthunt.",
    insight: "Signups by source",
  },
  {
    title: "Find the incident",
    body: "“Errors by type” has a burst of TimeoutErrors 12 days ago.",
    insight: "Errors by type",
  },
  {
    title: "Read an A/B test",
    body: "The new-onboarding flag splits users 50/50. Compare completion rates with SQL.",
    insight: "Onboarding: new vs. old flow",
  },
  {
    title: "Watch events arrive",
    body: "Open Events and switch on Live. New sessions start every 20 to 60 seconds.",
    path: "events",
  },
  {
    title: "Write your own SQL",
    body: "Query the events table directly. Anything read-only works.",
    path: "sql",
  },
];

function DemoHome() {
  const { apiBase, href } = useProject();
  const insights = useFetch<Insight[]>(`${apiBase}/insights`);
  const dashboards = useFetch<Dashboard[]>(`${apiBase}/dashboards`);
  const events = useFetch<EventDefinition[]>(`${apiBase}/event-definitions`);
  const total = events.data?.reduce((sum, e) => sum + e.total_count, 0);

  const target = (item: (typeof TOUR)[number]) => {
    if (item.path) return `${href}/${item.path}`;
    if (item.dashboard) {
      const d = dashboards.data?.find((x) => x.name === item.dashboard);
      return d ? `${href}/dashboards/${d.id}` : `${href}/dashboards`;
    }
    const i = insights.data?.find((x) => x.name === item.insight);
    return i ? `${href}/insights/${i.id}` : `${href}/insights`;
  };

  return (
    <>
      <PageHeader title="Demo" />
      <PageBody className="max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight">Acme Tasks</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          A made-up task manager with a few thousand users. They sign up, onboard, create and
          complete tasks, upgrade, churn and occasionally hit errors. The data covers 90 days and
          keeps growing live.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Events", value: total },
            { label: "Event types", value: events.data?.length },
            { label: "Saved insights", value: insights.data?.length },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border p-4">
              <div className="text-2xl font-semibold">
                {s.value === undefined ? "–" : formatNumber(s.value, { compact: true })}
              </div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <h3 className="mt-10 mb-3 text-[13px] font-medium">Things to try</h3>
        <div className="rounded-xl border border-border p-1">
          {TOUR.map((item, i) => (
            <Link
              key={item.title}
              to={target(item)}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.body}</div>
              </div>
              <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}

export function GetStartedPage() {
  const { isDemo } = useProject();
  return isDemo ? <DemoHome /> : <SetupGuide />;
}

function SetupGuide() {
  const { project, apiBase, href } = useProject();
  const events = useFetch<EventDefinition[]>(`${apiBase}/event-definitions`);
  const flags = useFetch<Flag[]>(`${apiBase}/flags`);
  const insights = useFetch<Insight[]>(`${apiBase}/insights`);
  const dashboards = useFetch<Dashboard[]>(`${apiBase}/dashboards`);
  const code = snippets(project.public_key);

  return (
    <>
      <PageHeader title="Get started" />
      <PageBody className="max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight">Set up {project.name}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Send your first event, ship a flag, then chart what matters.
        </p>

        <div className="mt-6 rounded-xl border border-border p-1">
          <Step
            index={1}
            done={events.data && events.data.length > 0}
            title="Send your first event"
            description="Install an SDK or call the HTTP API with your project key."
            to={`${href}/events`}
            cta="Events"
          />
          <Step
            index={2}
            done={flags.data && flags.data.length > 0}
            title="Create a feature flag"
            description="Roll a feature out to a percentage of users."
            to={`${href}/flags?new=1`}
            cta="New flag"
          />
          <Step
            index={3}
            done={insights.data && insights.data.length > 0}
            title="Build an insight"
            description="Trend events over time, break them down by property, or write SQL."
            to={`${href}/insights/new`}
            cta="New insight"
          />
          <Step
            index={4}
            done={dashboards.data && dashboards.data.length > 0}
            title="Pin it to a dashboard"
            description="Collect insights on one page for your team."
            to={`${href}/dashboards`}
            cta="Dashboards"
          />
        </div>

        <h3 className="mt-10 mb-3 text-[13px] font-medium">Project API key</h3>
        <KeyField value={project.public_key} />
        <p className="mt-2 text-xs text-muted-foreground">
          This key can only send events and evaluate flags, so it’s safe to ship in browsers. For
          querying data, create a secret key in{" "}
          <Link to={`${href}/settings/project`} className="text-foreground underline-offset-4 hover:underline">
            project settings
          </Link>
          .
        </p>

        <h3 className="mt-10 mb-3 text-[13px] font-medium">Install</h3>
        <Tabs defaultValue="js">
          <TabsList>
            <TabsTrigger value="js">JavaScript</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="curl">HTTP</TabsTrigger>
          </TabsList>
          <TabsContent value="js" className="mt-3 space-y-3">
            <CodeBlock code="pnpm add ./sdks/js   # from the nurburger repo" />
            <CodeBlock code={code.js} />
          </TabsContent>
          <TabsContent value="python" className="mt-3 space-y-3">
            <CodeBlock code="pip install ./sdks/python   # from the nurburger repo" />
            <CodeBlock code={code.python} />
          </TabsContent>
          <TabsContent value="curl" className="mt-3 space-y-3">
            <CodeBlock code={code.curl} />
            <CodeBlock code={code.flagsCurl} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
