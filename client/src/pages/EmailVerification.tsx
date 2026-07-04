import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { authApi } from '@/features/auth/authApi';
import Spinner from '@/components/common/Spinner';
import Button from '@/components/common/Button';

type VerifyState = 'loading' | 'success' | 'error';

function IITBHULogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="IIT BHU logo mark">
      <path d="M16,3 L30,26 L2,26 Z" fill="#8B1A1A" opacity="0.9" />
      <path d="M16,29 L2,6 L30,6 Z" fill="#8B1A1A" opacity="0.7" />
    </svg>
  );
}

export default function EmailVerification() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<VerifyState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No verification token provided.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setState('success'))
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { message?: string } } };
        setState('error');
        setErrorMessage(e.response?.data?.message || 'Verification failed. The link may be invalid or expired.');
      });
  }, []);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail) return;
    setResendStatus('sending');
    try {
      await authApi.resendVerification(resendEmail);
      setResendStatus('sent');
    } catch {
      setResendStatus('sent');
    }
  }

  return (
    <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
      <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-md border border-white/5 p-8 w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <IITBHULogo />
          <span className="text-sm font-semibold text-iitbhu">Carbon Portal</span>
        </div>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <Spinner size="lg" color="brand" />
            <p className="text-gray-300">Verifying your email…</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle2 size={56} className="text-green-500" />
            <h2 className="text-2xl font-bold text-white">Email Verified!</h2>
            <p className="text-gray-300">Your account is now active. You can log in.</p>
            <Link
              to="/login"
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-iitbhu text-white hover:bg-iitbhu-dark px-6 py-3 text-base font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-iitbhu focus:ring-offset-2"
            >
              Go to Login
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <XCircle size={56} className="text-red-500" />
            <h2 className="text-2xl font-bold text-white">Verification Failed</h2>
            <p className="text-gray-400 text-sm">{errorMessage}</p>

            {resendStatus === 'sent' ? (
              <p className="text-sm text-green-600">Sent! Check your inbox.</p>
            ) : (
              <form onSubmit={handleResend} className="w-full space-y-2 mt-2">
                <p className="text-sm text-gray-400 text-left">Request a new verification link:</p>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent"
                />
                <Button
                  type="submit"
                  fullWidth
                  isLoading={resendStatus === 'sending'}
                  variant="primary"
                >
                  {resendStatus === 'sending' ? 'Sending…' : 'Send new verification link'}
                </Button>
              </form>
            )}

            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-gray-200 hover:underline mt-1"
            >
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
