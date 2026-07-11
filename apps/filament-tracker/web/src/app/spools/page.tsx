import { SpoolsManager } from "@/components/spools-manager";

export const dynamic = "force-dynamic";

export default function SpoolsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Spools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, edit, and log usage across your filament inventory.
        </p>
      </header>
      <SpoolsManager />
    </div>
  );
}
