import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filament Tracker",
  description: "Track your 3D printing filament inventory",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="hidden md:flex w-64 flex-col gap-8 border-r border-border bg-card/40 px-4 py-6">
            <div className="flex items-center gap-3 px-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 border border-primary/30">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Filament</p>
                <p className="text-xs text-muted-foreground leading-tight">Tracker</p>
              </div>
            </div>
            <Nav />
            <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
              Running on k3s · Cilium · Kyverno
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
