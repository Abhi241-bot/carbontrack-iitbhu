import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ShieldCheck, MapPin, Globe } from 'lucide-react';
import { useAuthStore } from '@/features/auth/authStore';
import { UserRole } from '@shared/types/user.types';

function CarbonTrackLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-label="Carbon Track logo">
      <path
        d="M15 2 C9 2 4 7 4 14 C4 21 8 27 15 27 C22 27 26 21 26 14 C26 7 21 2 15 2Z"
        fill="#ffffff"
        opacity="0.2"
      />
      <path
        d="M15 2 C21 2 26 7 26 14 C26 21 22 27 15 27 C19 21 18 11 15 2Z"
        fill="#ffffff"
        opacity="0.85"
      />
      <path
        d="M15 27 L15 19"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.name
      ? user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : '?';

  function handleLogout() {
    clearAuth();
    setDropdownOpen(false);
    navigate('/');
  }

  const isAdmin = user?.role === UserRole.ADMIN;

  const navLinks = (
    <>
      <a
        href="/#about"
        className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
        onClick={() => setMobileOpen(false)}
      >
        About
      </a>
      <Link
        to="/map"
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          location.pathname === '/map' ? 'text-white' : 'text-gray-300 hover:text-white'
        }`}
        onClick={() => setMobileOpen(false)}
      >
        <Globe size={13} />
        Map
      </Link>
      <Link
        to="/dashboard"
        className={`text-sm font-medium transition-colors ${
          location.pathname === '/dashboard' ? 'text-white' : 'text-gray-300 hover:text-white'
        }`}
        onClick={() => setMobileOpen(false)}
      >
        Dashboard
      </Link>
      <Link
        to="/campus"
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          location.pathname.startsWith('/campus') || location.pathname.startsWith('/buildings')
            ? 'text-white'
            : 'text-gray-300 hover:text-white'
        }`}
        onClick={() => setMobileOpen(false)}
      >
        <MapPin size={13} />
        Campus
      </Link>
      {isAdmin && (
        <Link
          to="/admin"
          className="flex items-center gap-1 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          <ShieldCheck size={14} />
          Admin
        </Link>
      )}
    </>
  );

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/50 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left — Logo */}
        <Link to="/" className="flex items-center gap-2 no-underline">
          <CarbonTrackLogo />
          <span className="font-bold text-white text-sm tracking-tight">CarbonTrack</span>
        </Link>

        {/* Center — Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">{navLinks}</nav>

        {/* Right — Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-black rounded-lg px-2 py-1"
                aria-label="Account menu"
              >
                <span className="w-8 h-8 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center">
                  {initials}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-gray-300 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] py-1 z-50">
                  <div className="px-4 py-2 border-b border-white/10">
                    <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/map"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white no-underline transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Interactive Map
                  </Link>
                  <Link
                    to="/dashboard"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white no-underline transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/buildings?filter=assigned"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white no-underline transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    My Buildings
                  </Link>
                  {isAdmin && (
                    <>
                      <hr className="my-1 border-white/10" />
                      <Link
                        to="/admin"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white font-medium hover:bg-white/10 no-underline transition-colors"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <ShieldCheck size={14} />
                        Admin Panel
                      </Link>
                    </>
                  )}
                  <hr className="my-1 border-white/10" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors no-underline"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-sm font-medium bg-white text-black hover:bg-gray-200 px-4 py-1.5 rounded-lg transition-colors no-underline"
              >
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile — hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={`md:hidden bg-black/90 backdrop-blur-lg border-b border-white/10 overflow-hidden transition-all duration-300 ${
          mobileOpen ? 'max-h-96' : 'max-h-0'
        }`}
      >
        <div className="px-4 py-4 flex flex-col gap-4">
          {navLinks}
          <hr className="border-white/10" />
          {user ? (
            <>
              <div className="flex items-center gap-2 py-1">
                <span className="w-8 h-8 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {initials}
                </span>
                <span className="text-sm text-white font-medium">{user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-left text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <div className="flex gap-3">
              <Link
                to="/login"
                className="flex-1 text-center text-sm font-medium border border-white/20 text-white py-2 rounded-lg hover:bg-white/10 no-underline transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                Login
              </Link>
              <Link
                to="/register"
                className="flex-1 text-center text-sm font-medium bg-white text-black py-2 rounded-lg hover:bg-gray-200 no-underline transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
