import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label?: ReactNode;
}

/** Searchable single-select. With `allowCustom`, whatever is typed can be picked too. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  allowCustom = false,
  display,
  className,
  mono = false,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  display?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };
  const showCustom =
    allowCustom && search.trim() && !options.some((o) => o.value === search.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:bg-accent/60",
          mono && "font-mono",
          !value && !display && "text-subtle-foreground",
          className,
        )}
      >
        <span className="truncate">{display ?? value ?? placeholder}</span>
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{allowCustom ? "Type to use a custom value" : "No results"}</CommandEmpty>
            {showCustom && (
              <CommandGroup>
                <CommandItem value={`__custom__${search}`} onSelect={() => pick(search.trim())}>
                  Use “<span className={cn(mono && "font-mono text-xs")}>{search.trim()}</span>”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                  <span className={cn("truncate", mono && "font-mono text-xs")}>{o.label ?? o.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
