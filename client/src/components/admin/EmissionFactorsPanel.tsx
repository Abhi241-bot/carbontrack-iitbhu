import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Edit2, Check, X, Star, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '@/features/admin/adminApi';
import { useToast } from '@/hooks/useToast';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Skeleton from '@/components/common/Skeleton';
import Modal from '@/components/common/Modal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmissionFactor {
  _id: string;
  name: string;
  category: string;
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

const SCOPE_LABELS: Record<string, string> = {
  scope1: 'Scope 1 — Direct Emissions',
  scope2: 'Scope 2 — Energy Indirect',
  scope3: 'Scope 3 — Value Chain',
  embodied: 'Embodied Carbon',
};

const SCOPE_ORDER = ['scope1', 'scope2', 'scope3', 'embodied'];

const SCOPE_COLORS: Record<string, string> = {
  scope1: 'bg-red-50 text-red-700 border-red-200',
  scope2: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  scope3: 'bg-blue-50 text-blue-700 border-blue-200',
  embodied: 'bg-purple-50 text-purple-700 border-purple-200',
};

const CATEGORY_OPTIONS = [
  'diesel',
  'petrol',
  'lpg',
  'natural_gas',
  'coal',
  'refrigerant_r22',
  'refrigerant_r407c',
  'refrigerant_r134a',
  'refrigerant_r410a',
  'refrigerant_r404a',
  'refrigerant_r32',
  'fire_extinguisher',
  'grid_electricity',
  'employee_commute',
  'air_travel_domestic',
  'office_equipment',
  'concrete_pcc',
  'concrete_rcc',
  'rebar',
  'brick',
  'ceramic_tile',
  'kota_stone',
  'plaster',
  'paint',
  'stone_masonry',
  'steel_frame',
  'steel_section',
  'aluminum',
  'glass',
  'wood',
  'wood_plywood',
  'upvc',
  'cgi_sheet',
  'gypsum',
  'asbestos',
  'particle_board',
  'puff_panel',
  'plastic',
  'paper',
  'water',
  'waste',
  'solid_waste',
  'solid_waste_composting',
  'solid_waste_recycling',
  'solid_waste_burning',
  'liquid_waste',
];

// ── Inline edit row ───────────────────────────────────────────────────────────

function FactorRow({ factor, onSaved }: { factor: EmissionFactor; onSaved: () => void }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      adminApi.updateEmissionFactor(id, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emission-factors'] });
      showToast({ type: 'success', message: 'Saved' });
      setEditing(false);
      onSaved();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      showToast({ type: 'error', message: msg });
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => adminApi.setDefaultEmissionFactor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emission-factors'] });
      showToast({ type: 'success', message: 'Default updated' });
    },
    onError: () => showToast({ type: 'error', message: 'Failed to set default' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteEmissionFactor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emission-factors'] });
      showToast({ type: 'success', message: 'Factor removed' });
    },
    onError: () => showToast({ type: 'error', message: 'Failed to remove' }),
  });

  function startEdit() {
    setEditVal(String(factor.value));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function commitEdit() {
    const num = parseFloat(editVal);
    if (isNaN(num)) {
      showToast({ type: 'error', message: 'Invalid number' });
      return;
    }
    updateMutation.mutate({ id: factor._id, value: num });
  }

  const isBusy = updateMutation.isPending || defaultMutation.isPending || deleteMutation.isPending;

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-white">
        <div className="flex items-center gap-2">
          {factor.name}
          {factor.isDefault && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              <Star size={10} />
              default
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">{factor.category}</td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              step="any"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              className="w-28 text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none"
            />
            <button
              onClick={commitEdit}
              disabled={updateMutation.isPending}
              className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
              title="Save"
            >
              {updateMutation.isPending ? (
                <span className="inline-block w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={14} />
              )}
            </button>
            <button
              onClick={cancelEdit}
              className="p-1 text-gray-400 hover:text-gray-300"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="font-mono text-sm text-gray-100">{factor.value}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">{factor.unit}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{factor.source ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{factor.year ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              onClick={startEdit}
              disabled={isBusy}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40"
              title="Edit value"
            >
              <Edit2 size={14} />
            </button>
          )}
          {!factor.isDefault && (
            <button
              onClick={() => defaultMutation.mutate(factor._id)}
              disabled={isBusy}
              className="p-1 text-gray-400 hover:text-amber-500 transition-colors disabled:opacity-40"
              title="Set as default"
            >
              <Star size={14} />
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Remove "${factor.name}"?`)) deleteMutation.mutate(factor._id);
            }}
            disabled={isBusy}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
            title="Remove factor"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add factor modal ──────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: '',
  category: '',
  value: '',
  unit: '',
  scope: '',
  source: '',
  year: '',
  region: '',
  subcategory: '',
};

function AddFactorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK_FORM);

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createEmissionFactor({
        name: form.name.trim(),
        category: form.category,
        value: parseFloat(form.value),
        unit: form.unit.trim(),
        scope: form.scope,
        source: form.source.trim() || undefined,
        year: form.year ? parseInt(form.year) : undefined,
        region: form.region.trim() || undefined,
        subcategory: form.subcategory.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emission-factors'] });
      showToast({ type: 'success', message: 'Emission factor created' });
      setForm(BLANK_FORM);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create';
      showToast({ type: 'error', message: msg });
    },
  });

  function field(key: keyof typeof BLANK_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isValid =
    form.name.trim() &&
    form.category &&
    form.value &&
    !isNaN(parseFloat(form.value)) &&
    form.unit.trim() &&
    form.scope;

  return (
    <Modal isOpen={open} onClose={onClose} title="Add Custom Emission Factor" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              placeholder="e.g. Natural Gas"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Category *</label>
            <select
              value={form.category}
              onChange={(e) => field('category', e.target.value)}
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category…</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Value *</label>
            <input
              type="number"
              step="any"
              value={form.value}
              onChange={(e) => field('value', e.target.value)}
              placeholder="0.00"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Unit *</label>
            <input
              value={form.unit}
              onChange={(e) => field('unit', e.target.value)}
              placeholder="kgCO2e/kWh"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Scope *</label>
            <select
              value={form.scope}
              onChange={(e) => field('scope', e.target.value)}
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select scope…</option>
              <option value="scope1">Scope 1</option>
              <option value="scope2">Scope 2</option>
              <option value="scope3">Scope 3</option>
              <option value="embodied">Embodied Carbon</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Subcategory</label>
            <input
              value={form.subcategory}
              onChange={(e) => field('subcategory', e.target.value)}
              placeholder="fuel / refrigerant / transport…"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Source</label>
            <input
              value={form.source}
              onChange={(e) => field('source', e.target.value)}
              placeholder="IPCC AR6"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Year</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => field('year', e.target.value)}
              placeholder="2024"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-200 mb-1">Region</label>
            <input
              value={form.region}
              onChange={(e) => field('region', e.target.value)}
              placeholder="India / Global"
              className="w-full border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
          <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating…' : 'Create Factor'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Grouped scope section ─────────────────────────────────────────────────────

function ScopeSection({
  scopeKey,
  factors,
  onSaved,
}: {
  scopeKey: string;
  factors: EmissionFactor[];
  onSaved: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, EmissionFactor[]>();
    for (const f of factors) {
      const sub = f.subcategory ?? 'other';
      if (!map.has(sub)) map.set(sub, []);
      map.get(sub)!.push(f);
    }
    return map;
  }, [factors]);

  if (factors.length === 0) return null;

  return (
    <div>
      <h3
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border mb-3 ${SCOPE_COLORS[scopeKey] ?? 'bg-white/10 text-gray-200 border-white/10'}`}
      >
        {SCOPE_LABELS[scopeKey] ?? scopeKey}
      </h3>

      {Array.from(grouped.entries()).map(([sub, rows]) => (
        <div key={sub} className="mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 pl-1">
            {sub}
          </p>
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-white/5">
                  <tr>
                    {['Name', 'Category', 'Value', 'Unit', 'Source', 'Year', ''].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-black/40 backdrop-blur-md">
                  {rows.map((f) => (
                    <FactorRow key={f._id} factor={f} onSaved={onSaved} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function EmissionFactorsPanel() {
  const [scopeFilter, setScopeFilter] = useState('');
  const [subFilter, setSubFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['emission-factors'],
    queryFn: () => adminApi.getEmissionFactors(),
  });

  const factors: EmissionFactor[] = data?.data?.data ?? [];

  const allSubcategories = useMemo(
    () => [...new Set(factors.map((f) => f.subcategory ?? 'other').filter(Boolean))].sort(),
    [factors]
  );

  const filtered = useMemo(() => {
    return factors.filter((f) => {
      if (scopeFilter && f.scope !== scopeFilter) return false;
      if (subFilter && (f.subcategory ?? 'other') !== subFilter) return false;
      return true;
    });
  }, [factors, scopeFilter, subFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, EmissionFactor[]>();
    for (const scope of SCOPE_ORDER) map.set(scope, []);
    for (const f of filtered) {
      if (!map.has(f.scope)) map.set(f.scope, []);
      map.get(f.scope)!.push(f);
    }
    return map;
  }, [filtered]);

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ['emission-factors'] });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Emission Factors</h2>
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-sm">
          <Plus size={14} />
          Add Factor
        </Button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          Changing emission factors will not retroactively update existing verified submissions.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-400 mr-1.5">Scope</label>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="border border-white/20 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All scopes</option>
            {SCOPE_ORDER.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-400 mr-1.5">Subcategory</label>
          <select
            value={subFilter}
            onChange={(e) => setSubFilter(e.target.value)}
            className="border border-white/20 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {allSubcategories.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {(scopeFilter || subFilter) && (
          <button
            onClick={() => {
              setScopeFilter('');
              setSubFilter('');
            }}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {SCOPE_ORDER.map((s) => (
            <ScopeSection
              key={s}
              scopeKey={s}
              factors={grouped.get(s) ?? []}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}

      <AddFactorModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
