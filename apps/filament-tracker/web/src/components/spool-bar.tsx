import { cn, pct } from "@/lib/utils";

export function SpoolBar({ remaining, total }: { remaining: number; total: number }) {
  const percent = pct(remaining, total);
  const low = percent < 15;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            low ? "bg-red-500" : percent < 40 ? "bg-amber-400" : "bg-emerald-400",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">{percent}%</span>
    </div>
  );
}
