import { TreePine, Car, Plane } from 'lucide-react';

interface Props {
  totalCarbonTCO2e: number;
}

interface CardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  sublabel: string;
  color: string;
}

function EquivalencyCard({ icon, value, label, sublabel, color }: CardProps) {
  return (
    <div
      className="relative overflow-hidden flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-white bg-[#121212]/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/5"
    >
      <div 
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] opacity-30 pointer-events-none" 
        style={{ background: color }} 
      />
      <div className="relative z-10" style={{ color }}>{icon}</div>
      <p className="relative z-10 text-2xl font-bold leading-none">{value}</p>
      <p className="relative z-10 text-sm font-medium text-gray-300 text-center">{label}</p>
      <p className="relative z-10 text-[11px] text-gray-500 text-center">{sublabel}</p>
    </div>
  );
}

export default function CarbonEquivalency({ totalCarbonTCO2e }: Props) {
  const trees = Math.round(totalCarbonTCO2e * 20);
  const cars = Math.round(totalCarbonTCO2e / 2.3);
  const flights = Math.round(totalCarbonTCO2e / 1.8);

  function fmt(n: number) {
    return n.toLocaleString('en-IN');
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <EquivalencyCard
        icon={<TreePine size={24} />}
        value={fmt(trees)}
        label="Trees needed to offset"
        sublabel="per year of growth"
        color="#4ade80"
      />
      <EquivalencyCard
        icon={<Car size={24} />}
        value={fmt(cars)}
        label="Cars driven for a year"
        sublabel="avg 2.3 tCO₂e/car/yr"
        color="#2dd4bf"
      />
      <EquivalencyCard
        icon={<Plane size={24} />}
        value={fmt(flights)}
        label="London–NY return flights"
        sublabel="≈ 1.8 tCO₂e per flight"
        color="#60a5fa"
      />
    </div>
  );
}
