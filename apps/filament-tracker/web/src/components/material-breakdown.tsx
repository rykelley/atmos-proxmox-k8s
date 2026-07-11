import type { MaterialBreakdown } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { grams } from "@/lib/utils";

const PALETTE = ["#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6"];

export function MaterialBreakdownCard({ data }: { data: MaterialBreakdown[] }) {
  const max = Math.max(1, ...data.map((d) => d.remainingG));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filament by material</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spools yet.</p>
        ) : (
          data.map((d, i) => (
            <div key={d.material}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{d.material}</span>
                <span className="tabular-nums text-muted-foreground">
                  {grams(d.remainingG)} · {d.count} spool{d.count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(d.remainingG / max) * 100}%`,
                    background: PALETTE[i % PALETTE.length],
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
