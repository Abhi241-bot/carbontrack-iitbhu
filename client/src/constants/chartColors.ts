export const CHART_COLORS = {
  embodied: '#8B1A1A', // iitbhu maroon — always for embodied carbon
  operational: '#1a3c2e', // forest green — always for operational carbon
  scope1: '#B45309', // amber-700 — direct emissions (diesel)
  scope2: '#1D4ED8', // blue-700 — indirect (grid electricity)
  scope3: '#6D28D9', // violet-700 — value chain (materials)
  academic: '#0F766E', // teal-700
  hostel: '#15803D', // green-700
  lab: '#7C3AED', // violet-600
  administrative: '#374151', // gray-700
  residential: '#9333EA', // purple-600
  commercial: '#D97706', // amber-600
  infrastructure: '#64748B', // slate-500
  neutral: '#9CA3AF', // gray-400 — for zero / no-data states
};

export const BUILDING_TYPE_COLORS: Record<string, string> = {
  academic: CHART_COLORS.academic,
  hostel: CHART_COLORS.hostel,
  lab: CHART_COLORS.lab,
  administrative: CHART_COLORS.administrative,
  residential: CHART_COLORS.residential,
  commercial: CHART_COLORS.commercial,
  infrastructure: CHART_COLORS.infrastructure,
};

export const APPLIANCE_COLORS: Record<string, string> = {
  lighting: '#F59E0B',
  cooling: '#3B82F6',
  computing: '#8B5CF6',
  labEquipment: '#EC4899',
  misc: '#6B7280',
};

export const RADAR_PALETTE = ['#8B1A1A', '#1D4ED8', '#15803D', '#D97706', '#6D28D9', '#0F766E'];

export const WASTE_STREAM_COLORS: Record<string, string> = {
  unmanaged_dump: '#EF4444',
  managed_landfill: '#EF4444',
  composting: '#22C55E',
  recycling: '#3B82F6',
  open_burning: '#F97316',
};

export const TREATMENT_COLORS: Record<string, string> = {
  unmanaged_septic: '#EF4444',
  municipal_stp: '#F59E0B',
  campus_stp: '#22C55E',
};
