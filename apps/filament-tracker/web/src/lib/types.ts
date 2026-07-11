export interface Spool {
  id: string;
  name: string;
  brand?: string | null;
  material: string;
  colorName?: string | null;
  colorHex: string;
  diameterMm: number;
  totalWeightG: number;
  remainingWeightG: number;
  spoolWeightG: number;
  price?: number | null;
  currency: string;
  vendor?: string | null;
  purchasedAt?: string | null;
  location?: string | null;
  inDrybox: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialBreakdown {
  material: string;
  count: number;
  remainingG: number;
}

export interface Stats {
  totalSpools: number;
  totalRemainingG: number;
  totalValue: number;
  lowStock: number;
  byMaterial: MaterialBreakdown[];
}

export interface Material {
  id: string;
  name: string;
  description?: string | null;
}
