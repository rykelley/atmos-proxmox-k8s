"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Activity, Loader2 } from "lucide-react";
import type { Material, Spool } from "@/lib/types";
import { grams, money } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Select } from "@/components/ui/field";
import { SpoolBar } from "@/components/spool-bar";

type FormState = {
  name: string;
  material: string;
  brand: string;
  colorName: string;
  colorHex: string;
  diameterMm: string;
  totalWeightG: string;
  remainingWeightG: string;
  spoolWeightG: string;
  price: string;
  vendor: string;
  location: string;
  inDrybox: boolean;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  material: "PLA",
  brand: "",
  colorName: "",
  colorHex: "#8b5cf6",
  diameterMm: "1.75",
  totalWeightG: "1000",
  remainingWeightG: "1000",
  spoolWeightG: "200",
  price: "",
  vendor: "",
  location: "",
  inDrybox: false,
  notes: "",
};

function toForm(s: Spool): FormState {
  return {
    name: s.name,
    material: s.material,
    brand: s.brand ?? "",
    colorName: s.colorName ?? "",
    colorHex: s.colorHex,
    diameterMm: String(s.diameterMm),
    totalWeightG: String(s.totalWeightG),
    remainingWeightG: String(s.remainingWeightG),
    spoolWeightG: String(s.spoolWeightG),
    price: s.price != null ? String(s.price) : "",
    vendor: s.vendor ?? "",
    location: s.location ?? "",
    inDrybox: s.inDrybox,
    notes: s.notes ?? "",
  };
}

function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    material: f.material,
    brand: f.brand.trim() || undefined,
    colorName: f.colorName.trim() || undefined,
    colorHex: f.colorHex,
    diameterMm: Number(f.diameterMm),
    totalWeightG: Number(f.totalWeightG),
    remainingWeightG: Number(f.remainingWeightG),
    spoolWeightG: Number(f.spoolWeightG),
    price: f.price.trim() ? Number(f.price) : undefined,
    vendor: f.vendor.trim() || undefined,
    location: f.location.trim() || undefined,
    inDrybox: f.inDrybox,
    notes: f.notes.trim() || undefined,
  };
}

export function SpoolsManager() {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Spool | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [usageFor, setUsageFor] = useState<Spool | null>(null);
  const [usageGrams, setUsageGrams] = useState("");
  const [usageNote, setUsageNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [spoolsRes, materialsRes] = await Promise.all([
        fetch("/api/spools"),
        fetch("/api/materials"),
      ]);
      setSpools(spoolsRes.ok ? await spoolsRes.json() : []);
      setMaterials(materialsRes.ok ? await materialsRes.json() : []);
      setError(null);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const materialOptions = useMemo(
    () => (materials.length ? materials.map((m) => m.name) : [form.material]),
    [materials, form.material],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(s: Spool) {
    setEditing(s);
    setForm(toForm(s));
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      const res = await fetch(editing ? `/api/spools/${editing.id}` : "/api/spools", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Spool) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    await fetch(`/api/spools/${s.id}`, { method: "DELETE" });
    await load();
  }

  async function logUsage() {
    if (!usageFor) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/spools/${usageFor.id}/usage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gramsUsed: Number(usageGrams), note: usageNote || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsageFor(null);
      setUsageGrams("");
      setUsageNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log usage.");
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${spools.length} spool${spools.length === 1 ? "" : "s"}`}
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New spool
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Filament</th>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 font-medium">Remaining</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : spools.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No spools yet. Add your first one.
                  </td>
                </tr>
              ) : (
                spools.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                          style={{ background: s.colorHex }}
                        />
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[s.brand, s.colorName, `${s.diameterMm}mm`].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {s.inDrybox ? <Badge className="text-cyan-300">drybox</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{s.material}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <SpoolBar remaining={s.remainingWeightG} total={s.totalWeightG} />
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {grams(s.remainingWeightG)} / {grams(s.totalWeightG)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.location || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.price != null ? money(s.price, s.currency) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setUsageFor(s)} title="Log usage">
                          <Activity className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(s)} title="Delete">
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={formOpen}
        title={editing ? "Edit spool" : "New spool"}
        onClose={() => setFormOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Galaxy Black PLA"
            />
          </div>
          <div>
            <Label>Material</Label>
            <Select value={form.material} onChange={(e) => set({ material: e.target.value })}>
              {materialOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Prusament" />
          </div>
          <div>
            <Label>Color name</Label>
            <Input
              value={form.colorName}
              onChange={(e) => set({ colorName: e.target.value })}
              placeholder="Galaxy Black"
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.colorHex}
                onChange={(e) => set({ colorHex: e.target.value })}
                className="h-10 w-12 rounded-lg border border-input bg-transparent"
              />
              <Input value={form.colorHex} onChange={(e) => set({ colorHex: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Diameter (mm)</Label>
            <Select value={form.diameterMm} onChange={(e) => set({ diameterMm: e.target.value })}>
              <option value="1.75">1.75</option>
              <option value="2.85">2.85</option>
            </Select>
          </div>
          <div>
            <Label>Spool weight (g)</Label>
            <Input
              type="number"
              value={form.spoolWeightG}
              onChange={(e) => set({ spoolWeightG: e.target.value })}
            />
          </div>
          <div>
            <Label>Total filament (g)</Label>
            <Input
              type="number"
              value={form.totalWeightG}
              onChange={(e) => set({ totalWeightG: e.target.value })}
            />
          </div>
          <div>
            <Label>Remaining (g)</Label>
            <Input
              type="number"
              value={form.remainingWeightG}
              onChange={(e) => set({ remainingWeightG: e.target.value })}
            />
          </div>
          <div>
            <Label>Price</Label>
            <Input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
              placeholder="24.99"
            />
          </div>
          <div>
            <Label>Vendor</Label>
            <Input value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Shelf A · Bin 3"
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="drybox"
              type="checkbox"
              checked={form.inDrybox}
              onChange={(e) => set({ inDrybox: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            <Label>Stored in drybox</Label>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Create spool"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={usageFor !== null}
        title={usageFor ? `Log usage · ${usageFor.name}` : "Log usage"}
        onClose={() => setUsageFor(null)}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          {usageFor
            ? `${grams(usageFor.remainingWeightG)} remaining. Enter grams used for a print.`
            : ""}
        </p>
        <div className="space-y-3">
          <div>
            <Label>Grams used</Label>
            <Input
              type="number"
              value={usageGrams}
              onChange={(e) => setUsageGrams(e.target.value)}
              placeholder="42"
            />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={usageNote}
              onChange={(e) => setUsageNote(e.target.value)}
              placeholder="Benchy batch"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUsageFor(null)}>
            Cancel
          </Button>
          <Button onClick={logUsage} disabled={saving || !usageGrams.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Log usage
          </Button>
        </div>
      </Modal>
    </div>
  );
}
