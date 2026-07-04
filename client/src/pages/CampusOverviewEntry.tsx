import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Skeleton from '@/components/common/Skeleton';
import { campusApi } from '@/features/campus/campusApi';

interface CampusOverviewData {
  _id: string;
  slug: string;
  name: string;
  institution: string;
  shortName?: string;
  city: string;
  state: string;
  country: string;
  totalAreaAcres?: number;
  establishedYear?: number;
  website?: string;
  contactEmail?: string;
  description?: string;
}

export default function CampusOverviewEntry() {
  const { campusSlug } = useParams<{ campusSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '',
    institution: '',
    shortName: '',
    city: '',
    state: '',
    country: 'India',
    totalAreaAcres: '',
    establishedYear: '',
    website: '',
    contactEmail: '',
    description: '',
  });

  // Load existing campus data
  const { data: campus, isLoading } = useQuery({
    queryKey: ['campus', campusSlug],
    queryFn: () => campusApi.getBySlug(campusSlug!).then((r) => r.data.data as CampusOverviewData),
    enabled: !!campusSlug,
    staleTime: 30_000,
  });

  // Pre-fill form once campus data loads
  useEffect(() => {
    if (campus) {
      setForm({
        name: campus.name ?? '',
        institution: campus.institution ?? '',
        shortName: campus.shortName ?? '',
        city: campus.city ?? '',
        state: campus.state ?? '',
        country: campus.country ?? 'India',
        totalAreaAcres: campus.totalAreaAcres?.toString() ?? '',
        establishedYear: campus.establishedYear?.toString() ?? '',
        website: campus.website ?? '',
        contactEmail: campus.contactEmail ?? '',
        description: campus.description ?? '',
      });
    }
  }, [campus]);

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => campusApi.updateOverview(campusSlug!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', campusSlug] });
      setSaved(true);
      setTimeout(() => {
        navigate(`/campus/${campusSlug}`);
      }, 800);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name,
      institution: form.institution,
      city: form.city,
      state: form.state,
      country: form.country,
    };
    if (form.shortName.trim()) payload.shortName = form.shortName.trim();
    if (form.totalAreaAcres) payload.totalAreaAcres = parseFloat(form.totalAreaAcres);
    if (form.establishedYear) payload.establishedYear = parseInt(form.establishedYear);
    if (form.website.trim()) payload.website = form.website.trim();
    if (form.contactEmail.trim()) payload.contactEmail = form.contactEmail.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    submitMutation.mutate(payload);
  }

  const F = (
    key: keyof typeof form,
    label: string,
    opts?: {
      required?: boolean;
      type?: string;
      placeholder?: string;
      half?: boolean;
    }
  ) => (
    <div className={opts?.half ? '' : 'col-span-2'}>
      <label className="block text-xs font-medium text-gray-300 mb-1">
        {label}
        {opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        required={opts?.required}
        placeholder={opts?.placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu"
      />
    </div>
  );

  if (isLoading) {
    return (
      <PageWrapper title="Campus overview entry">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-10 rounded-xl" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={`${campus?.name ?? 'Campus'} — Overview`}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
          <Link to="/campus" className="hover:text-iitbhu transition-colors">
            Campus
          </Link>
          <span>/</span>
          <Link to={`/campus/${campusSlug}`} className="hover:text-iitbhu transition-colors">
            {campus?.name}
          </Link>
          <span>/</span>
          <span className="text-gray-200">Overview entry</span>
        </nav>

        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-white mb-1">
            {campus?.name} — Overview data
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            Fill in the campus identity and location details. This section can be updated after
            submission.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              {F('name', 'Campus name', { required: true, placeholder: 'Main Campus' })}
              {F('institution', 'Institution full name', {
                required: true,
                placeholder: 'Indian Institute of Technology',
              })}
              {F('shortName', 'Short name / abbreviation', { placeholder: 'IIT' })}
              {F('city', 'City', { required: true, placeholder: 'City', half: true })}
              {F('state', 'State', { required: true, placeholder: 'State', half: true })}
              {F('country', 'Country', { required: true, half: true })}

              <div className="col-span-2 grid grid-cols-2 gap-4">
                {F('totalAreaAcres', 'Total area (acres)', {
                  type: 'number',
                  placeholder: '1350',
                  half: true,
                })}
                {F('establishedYear', 'Year established', {
                  type: 'number',
                  placeholder: '1919',
                  half: true,
                })}
              </div>

              {F('website', 'Website URL', { type: 'url', placeholder: 'https://iitbhu.ac.in' })}
              {F('contactEmail', 'Contact email', {
                type: 'email',
                placeholder: 'registrar@iitbhu.ac.in',
              })}

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Brief description of the campus…"
                  className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-iitbhu"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => navigate(`/campus/${campusSlug}`)}
                className="flex-1 border border-white/10 text-gray-300 py-2.5 rounded-lg text-sm hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitMutation.isPending || saved}
                className="flex-1 flex items-center justify-center gap-2 bg-iitbhu text-white py-2.5 rounded-lg text-sm hover:bg-iitbhu-dark disabled:opacity-50"
              >
                <Save size={14} />
                {saved ? 'Saved!' : submitMutation.isPending ? 'Submitting…' : 'Submit overview'}
              </button>
            </div>

            {submitMutation.isError && (
              <p className="text-xs text-red-600 text-center mt-3">
                Failed to submit. Please try again.
              </p>
            )}
          </form>
        </div>
      </div>
    </PageWrapper>
  );
}
