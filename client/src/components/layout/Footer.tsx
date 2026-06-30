import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-forest-dark text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Col 1 — Brand */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                width="26"
                height="26"
                viewBox="0 0 30 30"
                fill="none"
                aria-label="Carbon Track logo"
              >
                <path
                  d="M15 2 C9 2 4 7 4 14 C4 21 8 27 15 27 C22 27 26 21 26 14 C26 7 21 2 15 2Z"
                  fill="white"
                  opacity="0.7"
                />
                <path
                  d="M15 2 C21 2 26 7 26 14 C26 21 22 27 15 27 C19 21 18 11 15 2Z"
                  fill="white"
                  opacity="0.5"
                />
                <path
                  d="M15 27 L15 19"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.4"
                />
              </svg>
              <h3 className="text-lg font-semibold">CarbonTrack</h3>
            </div>
            <p className="text-sm text-green-300 leading-relaxed">
              Tracking campus carbon for a sustainable future
            </p>
          </div>

          {/* Col 2 — Quick Links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-widest text-green-400 mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2">
              {[
                { label: 'Dashboard', to: '/dashboard' },
                { label: 'Buildings', to: '/buildings' },
                { label: 'Login', to: '/login' },
                { label: 'Register', to: '/register' },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-green-200 hover:text-white transition-colors no-underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-widest text-green-400 mb-4">
              Contact
            </h4>
            <address className="not-italic text-sm text-green-200 leading-relaxed space-y-1">
              <p>Campus Sustainability Research Group</p>
              <p>Indian Institute of Technology (BHU)</p>
              <p>Varanasi 221005, UP, India</p>
              <p className="mt-3">
                <a
                  href="mailto:sustainability@iitbhu.ac.in"
                  className="text-green-300 hover:text-white transition-colors"
                >
                  sustainability@iitbhu.ac.in
                </a>
              </p>
            </address>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-forest-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-green-400">
          <span>© 2025 CarbonTrack</span>
          <span>Carbon calculation methodology follows IPCC AR6 guidelines</span>
        </div>
      </div>
    </footer>
  );
}
