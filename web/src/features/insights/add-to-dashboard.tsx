import { LayoutGridIcon, PlusIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useProject } from "@/lib/use-project";

export function AddToDashboard({ insightId, disabled }: { insightId: string | null; disabled?: boolean }) {
  const { apiBase, href } = useProject();
  const navigate = useNavigate();
  const dashboards = useFetch<Dashboard[]>(`${apiBase}/dashboards`);

  const add = async (dashboard: Dashboard) => {
    try {
      await api.post(`${apiBase}/dashboards/${dashboard.id}/tiles`, { insight_id: insightId, width: 1 });
      toast.success(`Added to ${dashboard.name}`, {
        action: { label: "Open", onClick: () => navigate(`${href}/dashboards/${dashboard.id}`) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add to dashboard");
    }
  };

  const createAndAdd = async () => {
    const dashboard = await api.post<Dashboard>(`${apiBase}/dashboards`, { name: "Untitled dashboard" });
    await add(dashboard);
    void dashboards.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled || !insightId}>
          <LayoutGridIcon /> Add to dashboard
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {!!dashboards.data?.length && <DropdownMenuLabel>Dashboards</DropdownMenuLabel>}
        {dashboards.data?.map((d) => (
          <DropdownMenuItem key={d.id} onSelect={() => void add(d)}>
            <span className="truncate">{d.name}</span>
          </DropdownMenuItem>
        ))}
        {!!dashboards.data?.length && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => void createAndAdd()}>
          <PlusIcon /> New dashboard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
