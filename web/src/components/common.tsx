import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-5 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {breadcrumb && (
          <>
            <span className="shrink-0 text-muted-foreground">{breadcrumb}</span>
            <span className="text-subtle-foreground">/</span>
          </>
        )}
        <h1 className="truncate font-medium">{title}</h1>
      </div>
      {children}
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 py-6", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      )}
      <p className="text-[13px] font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={() => void copy(value).then(() => toast.success("Copied to clipboard"))}
      aria-label="Copy"
    >
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
    </Button>
  );
}

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("group relative rounded-lg border border-border bg-muted/50", className)}>
      <pre className="overflow-x-auto p-3.5 pr-10 font-mono text-xs leading-relaxed text-foreground/90">
        {code}
      </pre>
      <CopyButton value={code} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" />
    </div>
  );
}

export function KeyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-muted/40 pr-0.5 pl-2.5">
      {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border py-8 first:pt-0 last:border-0 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-[13px] font-medium">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        {actions && <div className="mt-3">{actions}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
