import { CheckCircle2Icon, CircleOffIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { CodeBlock, CopyButton, ErrorState, PageBody, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Label, Skeleton, Slider, Switch } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Flag } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { timeAgo } from "@/lib/utils";

function TestFlag({ flagKey }: { flagKey: string }) {
  const { apiBase, isDemo } = useProject();
  const [distinctId, setDistinctId] = useState(isDemo ? "usr_00042" : "");
  const [result, setResult] = useState<boolean | null>(null);

  const test = async (e: FormEvent) => {
    e.preventDefault();
    const flags = await api.get<Record<string, boolean>>(
      `${apiBase}/flags/evaluate?distinct_id=${encodeURIComponent(distinctId)}`,
    );
    setResult(Boolean(flags[flagKey]));
  };

  return (
    <form onSubmit={test} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          placeholder="distinct_id, e.g. user_123"
          value={distinctId}
          onChange={(e) => {
            setDistinctId(e.target.value);
            setResult(null);
          }}
          className="font-mono text-xs"
        />
        <Button type="submit" variant="secondary" disabled={!distinctId}>
          Evaluate
        </Button>
      </div>
      {result !== null && (
        <div className="flex items-center gap-2 text-[13px]">
          {result ? (
            <CheckCircle2Icon className="size-4 text-success" />
          ) : (
            <CircleOffIcon className="size-4 text-muted-foreground" />
          )}
          <span className="font-mono text-xs">{distinctId}</span>
          <span className="text-muted-foreground">gets</span>
          <Badge variant={result ? "success" : "outline"}>{result ? "enabled" : "disabled"}</Badge>
        </div>
      )}
    </form>
  );
}

export function FlagDetailPage() {
  const { flagId } = useParams();
  const { apiBase, href, canEdit } = useProject();
  const navigate = useNavigate();
  const { data: flag, error, reload, setData } = useFetch<Flag>(`${apiBase}/flags/${flagId}`);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rollout, setRollout] = useState(100);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!flag) return;
    setName(flag.name);
    setDescription(flag.description);
    setRollout(flag.rollout_percentage);
  }, [flag]);

  const save = async (patch: Partial<Flag>, message = "Saved") => {
    try {
      const updated = await api.patch<Flag>(`${apiBase}/flags/${flagId}`, patch);
      setData(updated);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async () => {
    await api.delete(`${apiBase}/flags/${flagId}`);
    toast.success("Flag deleted");
    navigate(`${href}/flags`);
  };

  const dirty =
    flag && (name !== flag.name || description !== flag.description || rollout !== flag.rollout_percentage);

  return (
    <>
      <PageHeader
        breadcrumb={<Link to={`${href}/flags`} className="hover:text-foreground">Feature flags</Link>}
        title={flag ? <span className="font-mono text-xs">{flag.key}</span> : "…"}
        actions={
          flag && (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {flag.active ? "Enabled" : "Disabled"}
                <Switch
                  disabled={!canEdit}
                  checked={flag.active}
                  onCheckedChange={(active) => void save({ active }, active ? "Flag enabled" : "Flag disabled")}
                />
              </label>
              {canEdit && (
                <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete flag">
                  <Trash2Icon />
                </Button>
              )}
            </>
          )
        }
      />
      <PageBody className="max-w-4xl">
        {error && <ErrorState message={error} onRetry={reload} />}
        {!flag && !error && <Skeleton className="h-64 w-full" />}
        {flag && (
          <>
            <Section title="Details" description={`Updated ${timeAgo(flag.updated_at)}`}>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Key</Label>
                  <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-muted/40 pr-0.5 pl-2.5">
                    <code className="flex-1 font-mono text-xs">{flag.key}</code>
                    <CopyButton value={flag.key} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" readOnly={!canEdit} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional display name" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" readOnly={!canEdit} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
            </Section>

            <Section
              title="Release"
              description="The percentage of users who get this flag. Raising it never turns the flag off for users who already have it."
            >
              <div className="rounded-lg border border-border p-4">
                <div className="mb-4 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular">{rollout}%</span>
                  <span className="text-xs text-muted-foreground">of users</span>
                </div>
                <Slider disabled={!canEdit} value={[rollout]} min={0} max={100} step={1} onValueChange={([v]) => setRollout(v)} />
                <div className="mt-3 flex gap-1.5">
                  {[0, 10, 25, 50, 100].map((v) => (
                    <Button key={v} type="button" size="sm" disabled={!canEdit} variant={rollout === v ? "secondary" : "ghost"} onClick={() => setRollout(v)}>
                      {v}%
                    </Button>
                  ))}
                </div>
              </div>
              {!flag.active && (
                <p className="mt-2 text-xs text-warning">
                  This flag is disabled, so it evaluates to false for everyone regardless of rollout.
                </p>
              )}
              {canEdit && (
              <div className="mt-4 flex justify-end gap-2">
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setName(flag.name);
                      setDescription(flag.description);
                      setRollout(flag.rollout_percentage);
                    }}
                  >
                    Discard
                  </Button>
                )}
                <Button disabled={!dirty} onClick={() => void save({ name, description, rollout_percentage: rollout })}>
                  Save changes
                </Button>
              </div>
              )}
            </Section>

            <Section title="Test" description="Check what a given user gets right now. Unsaved changes aren’t included.">
              <TestFlag flagKey={flag.key} />
            </Section>

            <Section title="Usage">
              <Tabs defaultValue="js">
                <TabsList>
                  <TabsTrigger value="js">JavaScript</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                </TabsList>
                <TabsContent value="js" className="mt-3">
                  <CodeBlock
                    code={`if (await nb.isFeatureEnabled("${flag.key}")) {\n  // ...\n}`}
                  />
                </TabsContent>
                <TabsContent value="python" className="mt-3">
                  <CodeBlock code={`if nb.feature_enabled("${flag.key}", user_id):\n    ...`} />
                </TabsContent>
              </Tabs>
            </Section>
          </>
        )}
      </PageBody>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete feature flag?"
        description={
          <>
            Code that checks <code className="font-mono text-xs">{flag?.key}</code> will get{" "}
            <code className="font-mono text-xs">false</code> after this.
          </>
        }
        onConfirm={remove}
      />
    </>
  );
}
