import mongoose, { Document, Schema } from 'mongoose';

// ── Legacy categories kept for backward compatibility ─────────────────────────
// electricity → superseded by grid_electricity
// steel       → superseded by steel_frame / steel_section
// concrete    → superseded by concrete_pcc / concrete_rcc
// aluminium   → superseded by aluminum (corrected spelling)
// transport   → superseded by employee_commute / air_travel_domestic

type EmissionCategory =
  // ── Legacy (retained for BC) ──────────────────────────────────────────────
  | 'electricity'
  | 'steel'
  | 'concrete'
  | 'aluminium'
  | 'transport'
  // ── Scope 1 — Fuels ───────────────────────────────────────────────────────
  | 'diesel'
  | 'petrol'
  | 'natural_gas'
  | 'lpg'
  | 'coal'
  // ── Scope 1 — Refrigerants ────────────────────────────────────────────────
  | 'refrigerant_r22'
  | 'refrigerant_r407c'
  | 'refrigerant_r134a'
  | 'refrigerant_r410a'
  | 'refrigerant_r404a'
  | 'refrigerant_r32'
  | 'fire_extinguisher'
  // ── Scope 2 ───────────────────────────────────────────────────────────────
  | 'grid_electricity'
  // ── Scope 3 — Transport ───────────────────────────────────────────────────
  | 'employee_commute'
  | 'air_travel_domestic'
  | 'office_equipment'
  // ── Embodied carbon — Generic materials ───────────────────────────────────
  | 'glass'
  | 'wood'
  | 'wood_plywood'
  | 'plastic'
  | 'paper'
  | 'water'
  | 'waste'
  // ── Embodied carbon — Concrete ────────────────────────────────────────────
  | 'concrete_pcc'
  | 'concrete_rcc'
  // ── Embodied carbon — Masonry & Finishes ──────────────────────────────────
  | 'rebar'
  | 'brick'
  | 'ceramic_tile'
  | 'kota_stone'
  | 'plaster'
  | 'paint'
  | 'stone_masonry'
  // ── Embodied carbon — Metals ──────────────────────────────────────────────
  | 'steel_frame'
  | 'steel_section'
  | 'aluminum'
  // ── Embodied carbon — Cladding & Boards ──────────────────────────────────
  | 'upvc'
  | 'cgi_sheet'
  | 'gypsum'
  | 'asbestos'
  | 'particle_board'
  | 'puff_panel'
  // ── Waste (legacy waste sub-types) ────────────────────────────────────────
  | 'solid_waste'
  | 'solid_waste_composting'
  | 'solid_waste_recycling'
  | 'solid_waste_burning'
  | 'liquid_waste';

export interface IEmissionFactorDocument extends Document {
  name: string;
  category: EmissionCategory;
  value: number;
  unit: string;
  source?: string;
  year?: number;
  region?: string;
  scope: 'scope1' | 'scope2' | 'scope3' | 'embodied';
  subcategory?: string;
  isDefault: boolean;
  isActive: boolean;
}

const CATEGORY_ENUM: EmissionCategory[] = [
  // Legacy
  'electricity',
  'steel',
  'concrete',
  'aluminium',
  'transport',
  // Scope 1 — Fuels
  'diesel',
  'petrol',
  'natural_gas',
  'lpg',
  'coal',
  // Scope 1 — Refrigerants
  'refrigerant_r22',
  'refrigerant_r407c',
  'refrigerant_r134a',
  'refrigerant_r410a',
  'refrigerant_r404a',
  'refrigerant_r32',
  'fire_extinguisher',
  // Scope 2
  'grid_electricity',
  // Scope 3
  'employee_commute',
  'air_travel_domestic',
  'office_equipment',
  // Embodied — Generic
  'glass',
  'wood',
  'wood_plywood',
  'plastic',
  'paper',
  'water',
  'waste',
  // Embodied — Concrete
  'concrete_pcc',
  'concrete_rcc',
  // Embodied — Masonry & Finishes
  'rebar',
  'brick',
  'ceramic_tile',
  'kota_stone',
  'plaster',
  'paint',
  'stone_masonry',
  // Embodied — Metals
  'steel_frame',
  'steel_section',
  'aluminum',
  // Embodied — Cladding & Boards
  'upvc',
  'cgi_sheet',
  'gypsum',
  'asbestos',
  'particle_board',
  'puff_panel',
  // Legacy waste sub-types
  'solid_waste',
  'solid_waste_composting',
  'solid_waste_recycling',
  'solid_waste_burning',
  'liquid_waste',
];

const emissionFactorSchema = new Schema<IEmissionFactorDocument>(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: CATEGORY_ENUM,
      required: true,
    },
    value: { type: Number, required: true },
    unit: { type: String, required: true },
    source: String,
    year: Number,
    region: String,
    scope: {
      type: String,
      enum: ['scope1', 'scope2', 'scope3', 'embodied'],
      required: true,
    },
    subcategory: String,
    isDefault: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique index on composite key used for idempotent upserts
emissionFactorSchema.index({ category: 1, name: 1 }, { unique: true });

export const EmissionFactor = (mongoose.models.EmissionFactor as mongoose.Model<IEmissionFactorDocument>) || mongoose.model<IEmissionFactorDocument>(
  'EmissionFactor',
  emissionFactorSchema
);
