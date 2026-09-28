import {
  BarChart3Icon,
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  FlagIcon,
  LayoutGridIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  RocketIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
  TerminalSquareIcon,
  UserIcon,
  ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, Badge, Kbd } from "@/components/ui/primitives";
import { useProject } from "@/lib/use-project";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/session";
import { useTheme } from "@/stores/theme";
import { useUi } from "@/stores/ui";

function NavItem({
  to,
  icon,
  children,
  end,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
          isActive && "bg-accent font-medium text-foreground",
        )
      }
    >
      {icon}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function OrgMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[10px] font-semibold text-primary-foreground",
        className,
      )}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

function WorkspaceSwitcher() {
  const { org, project } = useProject();
  const me = useSession((s) => s.me);
  const navigate = useNavigate();
  const setNewProjectOrgId = useUi((s) => s.setNewProjectOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition-colors outline-none hover:bg-accent data-[state=open]:bg-accent">
        <OrgMark name={org.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium">{project.name}</div>
        </div>
        {project.is_demo && <Badge variant="primary">Demo</Badge>}
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-subtle-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start">
        {me?.orgs.map((o) => (
          <div key={o.id}>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              {o.is_demo ? <SparklesIcon className="size-3" /> : <Building2Icon className="size-3" />}
              {o.is_demo ? "Demo · read-only" : o.name}
            </DropdownMenuLabel>
            {o.projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => navigate(`/project/${p.id}`)}>
                <span className="truncate">{p.name}</span>
                {p.id === project.id && <CheckIcon className="ml-auto !text-foreground" />}
              </DropdownMenuItem>
            ))}
            {o.role !== "member" && (
              <DropdownMenuItem onSelect={() => setNewProjectOrgId(o.id)}>
                <PlusIcon /> New project
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </div>
        ))}
        <DropdownMenuItem onSelect={() => navigate("/onboarding")}>
          <Building2Icon /> New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const { theme, toggle } = useTheme();
  const { href } = useProject();
  const navigate = useNavigate();
  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition-colors outline-none hover:bg-accent data-[state=open]:bg-accent">
        <Avatar src={me.user.avatar_url} name={me.user.name || me.user.email} />
        <span className="truncate text-[13px] text-muted-foreground">
          {me.user.name || me.user.email}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{me.user.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate(`${href}/settings/account`)}>
          <UserIcon /> Account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggle}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void logout().then(() => navigate("/login"))}
        >
          <LogOutIcon /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar() {
  const { href, isDemo } = useProject();
  const setCommandOpen = useUi((s) => s.setCommandOpen);

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 px-2 py-2.5">
      <div className="flex items-center gap-1">
        <WorkspaceSwitcher />
      </div>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-7 items-center gap-2 rounded-md border border-border bg-background/50 px-2 text-[13px] text-subtle-foreground transition-colors hover:text-muted-foreground"
      >
        <SearchIcon className="size-3.5" />
        Search
        <span className="ml-auto flex gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <nav className="flex flex-col gap-px">
        <NavItem to={href} end icon={<RocketIcon />}>
          Get started
        </NavItem>
        <NavItem to={`${href}/events`} icon={<ZapIcon />}>
          Events
        </NavItem>
        <NavItem to={`${href}/flags`} icon={<FlagIcon />}>
          Feature flags
        </NavItem>
      </nav>

      <nav className="flex flex-col gap-px">
        <div className="px-2 pb-1 text-[11px] font-medium text-subtle-foreground">Analytics</div>
        <NavItem to={`${href}/insights`} icon={<BarChart3Icon />}>
          Insights
        </NavItem>
        <NavItem to={`${href}/sql`} icon={<TerminalSquareIcon />}>
          SQL
        </NavItem>
        <NavItem to={`${href}/dashboards`} icon={<LayoutGridIcon />}>
          Dashboards
        </NavItem>
      </nav>

      {!isDemo && (
      <nav className="flex flex-col gap-px">
        <div className="px-2 pb-1 text-[11px] font-medium text-subtle-foreground">Settings</div>
        <NavItem to={`${href}/settings/project`} icon={<DatabaseIcon />}>
          Project & keys
        </NavItem>
        <NavItem to={`${href}/settings/org`} icon={<Settings2Icon />}>
          Organization
        </NavItem>
      </nav>
      )}

      <div className="mt-auto">
        <UserMenu />
      </div>
    </aside>
  );
}
