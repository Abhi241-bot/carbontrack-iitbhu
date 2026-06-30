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
      className="flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-white"
      style={{ background: color }}
    >
      <div className="opacity-80">{icon}</div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-sm font-medium opacity-90 text-center">{label}</p>
      <p className="text-[11px] opacity-60 text-center">{sublabel}</p>
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
        color="#15803D"
      />
      <EquivalencyCard
        icon={<Car size={24} />}
        value={fmt(cars)}
        label="Cars driven for a year"
        sublabel="avg 2.3 tCO₂e/car/yr"
        color="#0F766E"
      />
      <EquivalencyCard
        icon={<Plane size={24} />}
        value={fmt(flights)}
        label="London–NY return flights"
        sublabel="≈ 1.8 tCO₂e per flight"
        color="#1D4ED8"
      />
    </div>
  );
}
