import { useState, useEffect } from 'react';
import { X, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { CivilRenderer } from '@/components/admin/renderers/CivilRenderer';
import { ElectricalRenderer } from '@/components/admin/renderers/ElectricalRenderer';
import { WasteRenderer } from '@/components/admin/renderers/WasteRenderer';
import { submissionsApi } from '@/features/submissions/submissionsApi';

// ── Sub-section nav (mirrors DataReviewPanel) ─────────────────────────────────

const ELECTRICAL_SUB_SECTIONS = [
  { id: 'phase1', label: 'Phase 1 — Assets' },
  { id: 'phase2', label: 'Phase 2 — Consumption' },
  { id: 'phase3', label: 'Phase 3 — Renewable' },
  { id: 'phase4', label: 'Phase 4 — Equipment audit' },
  { id: 'phase5', label: 'Phase 5 — Billing analytics' },
  { id: 'phase6', label: 'Phase 6 — Grid EF' },
  { id: 'phase7_8', label: 'Phase 7-8 — SCADA & metering' },
  { id: 'phase9', label: 'Phase 9 — EV & vehicles' },
  { id: 'phase10', label: 'Phase 10 — Refrigerants & fire' },
  { id: 'phase11', label: 'Phase 11 — Scope 3 activities' },
];

const WASTE_SUB_SECTIONS = [
  { id: 'solid_generation', label: 'Solid waste generation' },
  { id: 'landfill', label: 'Landfill records' },
  { id: 'incineration', label: 'Incineration records' },
  { id: 'msw_plant', label: 'MSW plant (sieve analysis)' },
  { id: 'ww_generation', label: 'Wastewater generation' },
  { id: 'ww_characteristics', label: 'Wastewater characteristics' },
  { id: 'stp_plants', label: 'STP / ETP plants' },
  { id: 'water_demand', label: 'Water demand' },
  { id: 'water_supply', label: 'Water supply & storage' },
  { id: 'wtp', label: 'Water treatment plants' },
  { id: 'ro_plants', label: 'RO plants' },
  { id: 'water_quality', label: 'Water quality' },
];

const SECTION_TITLES: Record<string, string> = {
  overview: 'Building Overview',
  civil: 'Civil & Structural',
  electrical: 'Electrical & Energy',
  waste: 'Waste & Sanitation',
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  submissionId: string;
  section: string;
  sectionTitle?: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubmissionDataDrawer({ submissionId, section, sectionTitle, onClose }: Props) {
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSubSection, setActiveSubSection] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    setError(false);
    submissionsApi
      .getById(submissionId)
      .then((res) => {
        setSubmission(res.data?.data ?? res.data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [submissionId]);

  // Reset sub-section when section changes
  useEffect(() => {
    if (section === 'electrical') setActiveSubSection('phase1');
    else if (section === 'waste') setActiveSubSection('solid_generation');
    else setActiveSubSection('');
  }, [section]);

  const title = sectionTitle ?? SECTION_TITLES[section] ?? section;

  const subSections =
    section === 'electrical'
      ? ELECTRICAL_SUB_SECTIONS
      : section === 'waste'
        ? WASTE_SUB_SECTIONS
        : [];

  const showSubNav = subSections.length > 0 && !loading && !error && !!submission;

  function renderContent() {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          Loading submission data…
        </div>
      );
    }
    if (error || !submission) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <AlertTriangle size={28} className="text-amber-400" />
          <p className="text-sm text-gray-400">Could not load submission data.</p>
        </div>
      );
    }

    const sectionData = submission.data;
    if (!sectionData || Object.keys(sectionData).length === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          No data recorded in this submission.
        </div>
      );
    }

    const cr = submission.carbonResults;

    if (section === 'overview') {
      const overviewData =
        sectionData?.overview !== undefined ? sectionData : { overview: sectionData };
      return <CivilRenderer data={overviewData} mode="overview" carbonResults={cr} />;
    }
    if (section === 'civil') {
      return <CivilRenderer data={sectionData} carbonResults={cr} />;
    }
    if (section === 'electrical') {
      const electricalData = sectionData?.electrical ?? sectionData;
      return (
        <ElectricalRenderer
          data={electricalData}
          activePhase={activeSubSection}
          carbonResults={cr}
        />
      );
    }
    if (section === 'waste') {
      return (
        <WasteRenderer data={sectionData} activeSubSection={activeSubSection} carbonResults={cr} />
      );
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl bg-black/40 backdrop-blur-md shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
              <span className="text-xs font-medium text-green-600 uppercase tracking-wide">
                Verified — read only
              </span>
            </div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {submission?.version && (
              <p className="text-xs text-gray-400 mt-0.5">Version {submission.version}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 transition-colors p-1 mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meta bar */}
        {!loading && submission && (
          <div className="flex-shrink-0 px-5 py-2 bg-green-50/60 border-b border-green-100 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            {submission.submittedBy?.name && (
              <span>
                Submitted by{' '}
                <strong className="text-gray-200">{submission.submittedBy.name}</strong>
              </span>
            )}
            {submission.verifiedAt && (
              <span>
                Verified on{' '}
                <strong className="text-gray-200">
                  {new Date(submission.verifiedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </strong>
              </span>
            )}
            {submission.completionScore != null && (
              <span>
                Completeness:{' '}
                <strong className="text-gray-200">{submission.completionScore}%</strong>
              </span>
            )}
          </div>
        )}

        {/* Body: sub-nav + content */}
        <div className="flex flex-1 overflow-hidden">
          {showSubNav && (
            <div className="w-52 flex-shrink-0 border-r border-white/5 overflow-y-auto bg-white/5/40 py-3">
              {subSections.map((nav) => (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => setActiveSubSection(nav.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                    activeSubSection === nav.id
                      ? 'bg-green-50 text-green-700 font-medium border-r-2 border-green-500'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <ChevronRight
                    size={12}
                    className={activeSubSection === nav.id ? 'text-green-500' : 'text-gray-300'}
                  />
                  {nav.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}
