import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useSession } from "@/stores/session";

interface AuthConfig {
  google: boolean;
  dev_login: boolean;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const status = useSession((s) => s.status);
  const load = useSession((s) => s.load);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "idle") void load();
    api.get<AuthConfig>("/auth/config").then(setConfig, () => setConfig({ google: false, dev_login: false }));
  }, [status, load]);

  useEffect(() => {
    if (params.get("error")) toast.error("Google sign-in failed. Please try again.");
  }, [params]);

  if (status === "authenticated") return <Navigate to={next} replace />;

  const devLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/dev-login", { email });
      useSession.setState({ status: "idle" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo className="size-9" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Sign in to Nurburger</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Product events, feature flags and insights.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            disabled={!config?.google}
            onClick={() => {
              window.location.href = `/api/auth/google/login?next=${encodeURIComponent(next)}`;
            }}
          >
            <GoogleIcon />
            Continue with Google
          </Button>
          {config && !config.google && (
            <p className="text-center text-xs text-subtle-foreground">
              Google sign-in isn’t configured yet. Set GOOGLE_CLIENT_ID in .env.
            </p>
          )}

          {config?.dev_login && (
            <>
              <div className="my-2 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] text-subtle-foreground uppercase">Dev only</span>
                <Separator className="flex-1" />
              </div>
              <form onSubmit={devLogin} className="flex flex-col gap-2">
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                />
                <Button type="submit" size="lg" disabled={busy}>
                  Continue with email
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
