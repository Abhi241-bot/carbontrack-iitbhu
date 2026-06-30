import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle,
  LockKeyhole,
  Building2,
  BarChart2,
  UserCheck,
  ChevronRight,
  Leaf,
  Zap,
  MapPin,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Card from '@/components/common/Card';
import Skeleton from '@/components/common/Skeleton';
import { useInView } from '@/hooks/useInView';
import apiClient from '@/lib/axios';

// ─── Helpers ────────────────────────────────────────────────────────────────

function useCountUp(target: number, isInView: boolean, duration = 1500): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCount(target);
      return;
    }

    let start: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isInView, target, duration]);

  return count;
}

interface PublicStatsData {
  totalBuildings: number;
  totalEmbodiedCarbon: number;
  totalOperationalCarbon: number;
}

interface CampusSummaryItem {
  slug: string;
  buildingCount: number;
}

const chartData = [
  { name: 'Academic', embodied: 4200, operational: 850 },
  { name: 'Hostel', embodied: 2800, operational: 1200 },
  { name: 'Lab', embodied: 3600, operational: 2100 },
  { name: 'Admin', embodied: 1800, operational: 640 },
  { name: 'Residential', embodied: 1200, operational: 480 },
  { name: 'Library', embodied: 3100, operational: 920 },
  { name: 'Medical', embodied: 2400, operational: 1100 },
  { name: 'Sports', embodied: 900, operational: 320 },
];

// ─── Campus Map SVG ──────────────────────────────────────────────────────────

function CampusMapSVG() {
  return (
    <div className="rounded-2xl overflow-hidden border border-forest-light">
      <svg
        viewBox="0 0 400 300"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label="Schematic map of a university campus"
      >
        {/* Background */}
        <rect width="400" height="300" fill="#0f2a1e" />

        {/* Connecting paths */}
        <line
          x1="200"
          y1="155"
          x2="185"
          y2="80"
          stroke="#3a6050"
          strokeWidth="1.5"
          strokeDasharray="5,4"
        />
        <line
          x1="200"
          y1="155"
          x2="320"
          y2="100"
          stroke="#3a6050"
          strokeWidth="1.5"
          strokeDasharray="5,4"
        />
        <line
          x1="200"
          y1="155"
          x2="65"
          y2="125"
          stroke="#3a6050"
          strokeWidth="1.5"
          strokeDasharray="5,4"
        />
        <line
          x1="200"
          y1="155"
          x2="200"
          y2="240"
          stroke="#3a6050"
          strokeWidth="1.5"
          strokeDasharray="5,4"
        />
        <line
          x1="185"
          y1="80"
          x2="75"
          y2="68"
          stroke="#3a6050"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
        <line
          x1="320"
          y1="100"
          x2="325"
          y2="150"
          stroke="#3a6050"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
        <line
          x1="65"
          y1="125"
          x2="65"
          y2="170"
          stroke="#3a6050"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
        <line
          x1="65"
          y1="170"
          x2="100"
          y2="225"
          stroke="#3a6050"
          strokeWidth="1"
          strokeDasharray="4,4"
        />

        {/* Main Building */}
        <rect
          x="170"
          y="135"
          width="60"
          height="40"
          rx="4"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="200" y="183" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Main Block
        </text>
        <circle cx="185" cy="148" r="3" fill="#22c55e" />

        {/* LHC */}
        <rect
          x="160"
          y="58"
          width="50"
          height="30"
          rx="4"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="185" y="100" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Academic
        </text>
        <circle cx="175" cy="68" r="3" fill="#22c55e" />

        {/* Hostel 1 */}
        <rect
          x="300"
          y="68"
          width="35"
          height="24"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text
          x="317"
          y="103"
          textAnchor="middle"
          fill="white"
          fontSize="7.5"
          fontFamily="sans-serif"
        >
          Housing A
        </text>

        {/* Hostel 2 */}
        <rect
          x="305"
          y="130"
          width="35"
          height="24"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text
          x="322"
          y="165"
          textAnchor="middle"
          fill="white"
          fontSize="7.5"
          fontFamily="sans-serif"
        >
          Housing B
        </text>

        {/* Hostel 3 */}
        <rect
          x="290"
          y="195"
          width="35"
          height="24"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text
          x="307"
          y="230"
          textAnchor="middle"
          fill="white"
          fontSize="7.5"
          fontFamily="sans-serif"
        >
          Housing C
        </text>

        {/* Dept 1 */}
        <rect
          x="35"
          y="108"
          width="42"
          height="26"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="56" y="145" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Dept A
        </text>
        <circle cx="50" cy="118" r="3" fill="#22c55e" />

        {/* Dept 2 */}
        <rect
          x="35"
          y="155"
          width="42"
          height="26"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="56" y="192" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Dept B
        </text>

        {/* Dept 3 */}
        <rect
          x="75"
          y="205"
          width="42"
          height="26"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="96" y="242" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Dept C
        </text>

        {/* Lab */}
        <rect
          x="48"
          y="52"
          width="42"
          height="26"
          rx="3"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="69" y="89" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Lab Block
        </text>
        <circle cx="63" cy="62" r="3" fill="#22c55e" />

        {/* Library */}
        <rect
          x="170"
          y="222"
          width="60"
          height="30"
          rx="4"
          fill="#2a5040"
          stroke="#4a8060"
          strokeWidth="1.5"
        />
        <text x="200" y="262" textAnchor="middle" fill="white" fontSize="8" fontFamily="sans-serif">
          Library
        </text>

        {/* Legend */}
        <circle cx="20" cy="282" r="4" fill="#22c55e" />
        <text x="28" y="286" fill="#9ca3af" fontSize="7.5" fontFamily="sans-serif">
          Data submitted
        </text>
        <circle cx="110" cy="282" r="4" fill="#4a5568" />
        <text x="118" y="286" fill="#9ca3af" fontSize="7.5" fontFamily="sans-serif">
          Pending
        </text>
      </svg>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function Landing() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Section 2 stats animation refs
  const [statsRef, statsInView] = useInView<HTMLDivElement>();
  const embShare = useCountUp(40, statsInView);
  const opShare = useCountUp(60, statsInView);
  const lifecycle = useCountUp(50, statsInView);

  // Section 5 card animation refs
  const [card1Ref, card1Visible] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const [card2Ref, card2Visible] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const [card3Ref, card3Visible] = useInView<HTMLDivElement>({ threshold: 0.15 });

  // Section 4 public stats query
  const { data: publicStats, isLoading: statsLoading } = useQuery<PublicStatsData>({
    queryKey: ['dashboard', 'public-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: PublicStatsData }>('/dashboard/public-stats');
      return data.data;
    },
    retry: false,
  });

  const { data: campusSummary } = useQuery<CampusSummaryItem[]>({
    queryKey: ['analytics', 'campus-summary'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: CampusSummaryItem[] }>(
        '/analytics/campus-summary'
      );
      return data.data;
    },
    retry: false,
  });

  const campusCount = campusSummary?.length ?? 0;

  const fmt = (n: number | undefined) => (n !== undefined ? n.toLocaleString() : '—');

  return (
    <>
      <Navbar />
      <main>
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 1 — HERO                                                   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section
          id="hero"
          className="relative min-h-screen bg-forest flex items-center justify-center px-4 overflow-hidden"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        >
          <div className="text-center max-w-3xl mx-auto">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 bg-forest-light text-green-200 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <Leaf size={14} />
              Multi-Campus Sustainability Platform
            </div>

            {/* Headline */}
            <h1 className="text-white font-bold text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mb-6 leading-tight">
              Measure. Understand. Reduce.
            </h1>

            {/* Subtitle */}
            <p className="text-green-100 text-lg sm:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
              India's most comprehensive campus carbon footprint platform — track embodied and
              operational carbon across every building, across every campus.
            </p>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link
                to="/campus"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold border-2 border-white text-white hover:bg-white hover:text-forest transition-all duration-200 no-underline"
              >
                Explore Campuses
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold bg-iitbhu text-white hover:bg-iitbhu-dark transition-all duration-200 no-underline"
              >
                Register as Member
              </Link>
            </div>

            {/* Social proof — dynamic from API */}
            <p className="text-green-300 text-sm">
              {campusCount > 0
                ? `${campusCount} campus${campusCount !== 1 ? 'es' : ''}`
                : 'Multi-campus'}{' '}
              &nbsp;·&nbsp;{' '}
              {publicStats?.totalBuildings
                ? `${publicStats.totalBuildings.toLocaleString()} buildings tracked`
                : 'Buildings tracked across campuses'}{' '}
              &nbsp;·&nbsp; Join the initiative
            </p>
          </div>

          {/* Bottom wave divider */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg
              viewBox="0 0 1440 60"
              preserveAspectRatio="none"
              style={{ width: '100%', height: 60 }}
              aria-hidden="true"
            >
              <path d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" fill="#f8f6f0" />
            </svg>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 2 — EXPLAINER CARDS                                        */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section id="about" className="bg-[#f8f6f0] py-20 px-4">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-iitbhu mb-2">
              Carbon 101
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
              Understanding Carbon Footprint
            </h2>
            <p className="text-gray-600 text-center max-w-xl mx-auto mb-12">
              Buildings are responsible for nearly 40% of global carbon emissions. Understanding
              what drives those emissions is the first step to reducing them.
            </p>

            {/* Two explainer cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* Embodied Carbon */}
              <Card className="border-l-4 border-iitbhu" padding="lg">
                <div className="text-iitbhu mb-4">
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                    <rect
                      x="6"
                      y="22"
                      width="24"
                      height="10"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                    <rect
                      x="10"
                      y="12"
                      width="16"
                      height="12"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                    <rect
                      x="14"
                      y="4"
                      width="8"
                      height="10"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Embodied Carbon</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  The carbon emitted during the manufacture, transport, and construction of building
                  materials — released before a building is ever occupied.
                </p>
                <ul className="space-y-2">
                  {[
                    'Steel and concrete production',
                    'Material transport logistics',
                    'Construction machinery fuel',
                    'Renovation and demolition',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-iitbhu flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Operational Carbon */}
              <Card className="border-l-4 border-forest" padding="lg">
                <div className="text-forest mb-4">
                  <Zap size={36} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Operational Carbon</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  The carbon emitted from running a building day-to-day — energy used for heating,
                  cooling, lighting, and equipment over the building's lifetime.
                </p>
                <ul className="space-y-2">
                  {[
                    'Electricity consumption',
                    'Diesel backup generators',
                    'Air conditioning',
                    'Lighting & equipment',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-forest flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Stats bar */}
            <div
              ref={statsRef}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
            >
              <div className="flex flex-col sm:flex-row justify-around items-center gap-8 sm:divide-x sm:divide-gray-100">
                <div className="text-center">
                  <p className="text-3xl font-bold text-iitbhu">
                    ~{prefersReduced ? 40 : embShare}%
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Embodied carbon share</p>
                </div>
                <div className="text-center sm:pl-8">
                  <p className="text-3xl font-bold text-iitbhu">
                    ~{prefersReduced ? 60 : opShare}%
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Operational carbon share</p>
                </div>
                <div className="text-center sm:pl-8">
                  <p className="text-3xl font-bold text-iitbhu">
                    {prefersReduced ? 50 : lifecycle} years
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Typical building lifecycle</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 3 — WHY IT MATTERS                                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-forest text-white py-20 px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto items-center">
            {/* Left — Campus map */}
            <CampusMapSVG />

            {/* Right — Text */}
            <div>
              <p className="text-green-300 text-xs uppercase tracking-widest font-semibold mb-3">
                Multi-Campus Platform
              </p>
              <h2 className="text-3xl font-bold mb-6">
                Why Carbon Accounting Matters for Campuses
              </h2>
              <div className="space-y-5">
                {[
                  {
                    title: 'National compliance',
                    desc: "India's campus sustainability commitments under NAPCC and Net Zero 2070 goal",
                  },
                  {
                    title: 'Cost savings',
                    desc: 'Identifying energy inefficiencies can reduce electricity bills by 20–35%',
                  },
                  {
                    title: 'Student impact',
                    desc: 'Research-grade emissions data for thesis work and policy submissions',
                  },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{title}</span>
                      <span className="text-green-200"> — {desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/campus"
                className="mt-8 inline-flex items-center gap-1 text-green-300 hover:text-white font-medium transition-colors no-underline"
              >
                Browse Campuses
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 4 — DASHBOARD PREVIEW TEASER                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-white py-20 px-4">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
              Live Campus Statistics
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Real-time carbon data from every building on campus
            </p>

            {/* Blurred chart preview */}
            <div className="relative overflow-hidden rounded-2xl border border-gray-200 mb-10">
              {/* Chart (blurred) */}
              <div
                style={{ filter: 'blur(6px)', pointerEvents: 'none' }}
                className="p-6 bg-gray-50"
              >
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip formatter={(val: number) => [`${val.toLocaleString()} tCO₂e`]} />
                    <Legend />
                    <Bar dataKey="embodied" name="Embodied" fill="#8B1A1A" radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey="operational"
                      name="Operational"
                      fill="#1a3c2e"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Overlay */}
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm bg-white/30 z-10">
                <div className="bg-white shadow-xl rounded-2xl p-8 text-center max-w-sm mx-4">
                  <LockKeyhole size={32} className="text-iitbhu mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Login to view live campus data</h3>
                  <p className="text-gray-500 text-sm mb-6">
                    Real-time carbon tracking across all tracked buildings and campuses
                  </p>
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center w-full px-6 py-2.5 rounded-lg bg-iitbhu text-white font-medium hover:bg-iitbhu-dark transition-colors no-underline mb-3"
                  >
                    Register Now
                  </Link>
                  <Link
                    to="/login"
                    className="text-sm text-iitbhu hover:text-iitbhu-dark transition-colors no-underline"
                  >
                    Already have an account? Login
                  </Link>
                </div>
              </div>
            </div>

            {/* KPI stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {statsLoading ? (
                <>
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                </>
              ) : (
                [
                  {
                    Icon: MapPin,
                    value: campusCount > 0 ? campusCount.toLocaleString() : '—',
                    label: 'campuses tracked',
                  },
                  {
                    Icon: Building2,
                    value: fmt(publicStats?.totalBuildings),
                    label: 'buildings tracked',
                  },
                  {
                    Icon: BarChart2,
                    value: fmt(publicStats?.totalEmbodiedCarbon),
                    label: 'tCO₂e embodied',
                  },
                ].map(({ Icon, value, label }) => (
                  <div
                    key={label}
                    className="bg-white border border-gray-100 rounded-xl p-6 text-center shadow-sm"
                  >
                    <Icon size={24} className="text-iitbhu mx-auto mb-3" />
                    <p className="text-3xl font-bold text-gray-900">{value}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {value === '—' ? 'Be the first to contribute' : label}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 5 — HOW IT WORKS                                           */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">How It Works</h2>
            <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
              Two parallel tracks for capturing a campus's full carbon picture —
              building-by-building and campus infrastructure.
            </p>

            {/* Step 1 — shared */}
            <div
              ref={card1Ref}
              className={`transition-all duration-500 mb-8 ${prefersReduced || card1Visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <Card padding="lg" className="relative overflow-hidden">
                <span className="absolute top-2 right-4 text-8xl font-black text-gray-100 select-none leading-none">
                  1
                </span>
                <UserCheck size={40} className="text-iitbhu mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Register with your institution email
                </h3>
                <p className="text-gray-500 text-sm">
                  Sign up with your institutional email address and select your campus. Verified
                  instantly.
                </p>
              </Card>
            </div>

            {/* Two parallel tracks */}
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500 ${prefersReduced || card2Visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              ref={card2Ref}
            >
              {/* Building track */}
              <div
                ref={card3Ref}
                className={`transition-all duration-500 ${prefersReduced || card3Visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                style={{ transitionDelay: prefersReduced ? '0ms' : '0ms' }}
              >
                <Card
                  padding="lg"
                  className="relative overflow-hidden h-full border-l-4 border-iitbhu"
                >
                  <span className="absolute top-2 right-4 text-7xl font-black text-gray-100 select-none leading-none">
                    2
                  </span>
                  <Building2 size={36} className="text-iitbhu mb-3" />
                  <h3 className="text-base font-bold text-gray-900 mb-3">Building data</h3>
                  <ol className="space-y-2">
                    {[
                      'Select your building',
                      'Fill guided sections (civil, electrical, waste)',
                      'Get building carbon report',
                    ].map((step, i) => (
                      <li key={step} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-iitbhu/10 text-iitbhu text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>

              {/* Campus track */}
              <div style={{ transitionDelay: prefersReduced ? '0ms' : '150ms' }}>
                <Card
                  padding="lg"
                  className="relative overflow-hidden h-full border-l-4 border-forest"
                >
                  <span className="absolute top-2 right-4 text-7xl font-black text-gray-100 select-none leading-none">
                    2
                  </span>
                  <div className="flex items-start justify-between mb-3">
                    <MapPin size={36} className="text-forest" />
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                      Admin/Reviewer access
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-3">Campus data</h3>
                  <ol className="space-y-2">
                    {[
                      'Navigate to Campus tab',
                      'Enter roads, trees, water bodies',
                      'Submit for admin review',
                      'Campus carbon calculated',
                    ].map((step, i) => (
                      <li key={step} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-forest/10 text-forest text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            </div>

            {/* Step 3 — shared result */}
            <div className="mt-8 flex justify-center">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <ChevronRight size={18} className="text-gray-300" />
                <span>Both tracks feed into the</span>
                <Link to="/campus" className="text-iitbhu font-medium hover:underline">
                  campus portal
                </Link>
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 6 — CTA BANNER                                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-iitbhu py-16 px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">
            Ready to contribute to your campus's sustainability mission?
          </h2>
          <p className="text-red-100 mb-8">
            Join faculty, staff and students across campuses already tracking their buildings'
            carbon footprint.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-white text-iitbhu font-semibold hover:bg-gray-50 transition-colors no-underline"
            >
              Register Now
            </Link>
            <a
              href="#about"
              className="inline-flex items-center justify-center px-8 py-3 rounded-lg border-2 border-white text-white hover:bg-iitbhu-dark transition-colors no-underline"
            >
              Learn More
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
