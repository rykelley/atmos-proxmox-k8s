import Link from "next/link";
import { Boxes, Scale, DollarSign, TriangleAlert, ArrowRight } from "lucide-react";
import { INVENTORY_URL } from "@/lib/services";
import type { Spool, Stats } from "@/lib/types";
import { grams, money } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { MaterialBreakdownCard } from "@/components/material-breakdown";
import { SpoolBar } from "@/components/spool-bar";

export const dynamic = "force-dynamic";

async function getData(): Promise<{ stats: Stats | null; spools: Spool[] }> {
  try {
    const [statsRes, spoolsRes] = await Promise.all([
      fetch(`${INVENTORY_URL}/stats`, { cache: "no-store" }),
      fetch(`${INVENTORY_URL}/spools`, { cache: "no-store" }),
    ]);
    const stats = statsRes.ok ? ((await statsRes.json()) as Stats) : null;
    const spools = spoolsRes.ok ? ((await spoolsRes.json()) as Spool[]) : [];
    return { stats, spools };
  } catch {
    return { stats: null, spools: [] };
  }
}

export default async function DashboardPage() {
  const { stats, spools } = await getData();
  const lowStock = spools.filter((s) => s.remainingWeightG < s.totalWeightG * 0.15);
  const recent = spools.slice(0, 6);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your 3D printing filament inventory at a glance.
          </p>
        </div>
        <Link href="/spools">
          <Button>
            Manage spools <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Spools"
          value={String(stats?.totalSpools ?? 0)}
          icon={Boxes}
          accent="#8b5cf6"
        />
        <StatCard
          label="Filament on hand"
          value={grams(stats?.totalRemainingG ?? 0)}
          icon={Scale}
          accent="#06b6d4"
        />
        <StatCard
          label="Inventory value"
          value={money(stats?.totalValue ?? 0)}
          icon={DollarSign}
          accent="#22c55e"
        />
        <StatCard
          label="Low stock"
          value={String(stats?.lowStock ?? 0)}
          hint="Under 15% remaining"
          icon={TriangleAlert}
          accent="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MaterialBreakdownCard data={stats?.byMaterial ?? []} />

        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everything is well stocked.</p>
            ) : (
              lowStock.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full border border-white/20"
                      style={{ background: s.colorHex }}
                    />
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.material}
                        {s.brand ? ` · ${s.brand}` : ""}
                      </p>
                    </div>
                  </div>
                  <SpoolBar remaining={s.remainingWeightG} total={s.totalWeightG} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent spools</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spools yet. Head to the Spools page to add your first one.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ background: s.colorHex }}
                    />
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.material}
                        {s.colorName ? ` · ${s.colorName}` : ""}
                        {s.location ? ` · ${s.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {s.inDrybox ? <Badge className="text-cyan-300">drybox</Badge> : null}
                    <span className="hidden sm:inline text-xs tabular-nums text-muted-foreground">
                      {grams(s.remainingWeightG)} / {grams(s.totalWeightG)}
                    </span>
                    <SpoolBar remaining={s.remainingWeightG} total={s.totalWeightG} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
