import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BarChart3Icon,
  DatabaseIcon,
  FlagIcon,
  FolderIcon,
  LayoutGridIcon,
  MoonIcon,
  PlusIcon,
  RocketIcon,
  Settings2Icon,
  TerminalSquareIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Dashboard, Flag, Insight } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";
import { useSession } from "@/stores/session";
import { useTheme } from "@/stores/theme";
import { useUi } from "@/stores/ui";

export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const { href, apiBase, project, isDemo } = useProject();
  const me = useSession((s) => s.me);
  const toggleTheme = useTheme((s) => s.toggle);
  const navigate = useNavigate();

  const flags = useFetch<Flag[]>(open ? `${apiBase}/flags` : null);
  const insights = useFetch<Insight[]>(open ? `${apiBase}/insights` : null);
  const dashboards = useFetch<Dashboard[]>(open ? `${apiBase}/dashboards` : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed top-[16%] left-1/2 z-50 w-full max-w-[min(560px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/30 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search pages, flags, insights and dashboards
          </DialogPrimitive.Description>
          <Command loop>
            <CommandInput placeholder="Type a command or search…" autoFocus />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              {!isDemo && (
              <CommandGroup heading="Create">
                <CommandItem onSelect={() => go(`${href}/insights/new`)}>
                  <PlusIcon /> New insight
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/flags?new=1`)}>
                  <PlusIcon /> New feature flag
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/sql`)}>
                  <TerminalSquareIcon /> New SQL query
                </CommandItem>
              </CommandGroup>
              )}
              <CommandGroup heading="Go to">
                <CommandItem onSelect={() => go(href)}>
                  <RocketIcon /> Get started
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/events`)}>
                  <ZapIcon /> Events
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/flags`)}>
                  <FlagIcon /> Feature flags
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/insights`)}>
                  <BarChart3Icon /> Insights
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/dashboards`)}>
                  <LayoutGridIcon /> Dashboards
                </CommandItem>
                {!isDemo && (
                  <>
                <CommandItem onSelect={() => go(`${href}/settings/project`)}>
                  <DatabaseIcon /> Project settings & API keys
                </CommandItem>
                <CommandItem onSelect={() => go(`${href}/settings/org`)}>
                  <Settings2Icon /> Organization & members
                </CommandItem>
                  </>
                )}
              </CommandGroup>
              {!!flags.data?.length && (
                <CommandGroup heading="Feature flags">
                  {flags.data.map((f) => (
                    <CommandItem
                      key={f.id}
                      value={`flag ${f.key} ${f.name}`}
                      onSelect={() => go(`${href}/flags/${f.id}`)}
                    >
                      <FlagIcon /> <span className="font-mono text-xs">{f.key}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!insights.data?.length && (
                <CommandGroup heading="Insights">
                  {insights.data.map((i) => (
                    <CommandItem
                      key={i.id}
                      value={`insight ${i.name}`}
                      onSelect={() => go(`${href}/insights/${i.id}`)}
                    >
                      <BarChart3Icon /> {i.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!!dashboards.data?.length && (
                <CommandGroup heading="Dashboards">
                  {dashboards.data.map((d) => (
                    <CommandItem
                      key={d.id}
                      value={`dashboard ${d.name}`}
                      onSelect={() => go(`${href}/dashboards/${d.id}`)}
                    >
                      <LayoutGridIcon /> {d.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Projects">
                {me?.orgs.flatMap((o) =>
                  o.projects
                    .filter((p) => p.id !== project.id)
                    .map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`project ${o.name} ${p.name}`}
                        onSelect={() => go(`/project/${p.id}`)}
                      >
                        <FolderIcon /> {p.name}
                        <span className="text-xs text-subtle-foreground">{o.name}</span>
                      </CommandItem>
                    )),
                )}
              </CommandGroup>
              <CommandGroup heading="Preferences">
                <CommandItem
                  onSelect={() => {
                    toggleTheme();
                    setOpen(false);
                  }}
                >
                  <MoonIcon /> Toggle theme
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
