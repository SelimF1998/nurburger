import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { PageBody, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/tabs";
import { useSession } from "@/stores/session";
import { useTheme } from "@/stores/theme";

export function AccountSettingsPage() {
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  if (!me) return null;

  return (
    <>
      <PageHeader title="Account" />
      <PageBody className="max-w-4xl">
        <Section title="Profile" description="Your name and photo come from your Google account.">
          <div className="flex items-center gap-3">
            <Avatar src={me.user.avatar_url} name={me.user.name || me.user.email} className="size-10 text-sm" />
            <div>
              <div className="font-medium">{me.user.name}</div>
              <div className="text-[13px] text-muted-foreground">{me.user.email}</div>
            </div>
          </div>
        </Section>
        <Section title="Appearance">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: "dark", label: <><MoonIcon /> Dark</> },
              { value: "light", label: <><SunIcon /> Light</> },
            ]}
          />
        </Section>
        <Section title="Session">
          <Button variant="secondary" onClick={() => void logout().then(() => navigate("/login"))}>
            <LogOutIcon /> Log out
          </Button>
        </Section>
      </PageBody>
    </>
  );
}
