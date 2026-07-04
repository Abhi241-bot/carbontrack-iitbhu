import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck, AlertCircle } from 'lucide-react';
import { useForgotPassword } from '@/features/auth/useAuth';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

function IITBHULogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="IIT BHU logo mark">
      <path d="M16,3 L30,26 L2,26 Z" fill="#8B1A1A" opacity="0.9" />
      <path d="M16,29 L2,6 L30,6 Z" fill="#8B1A1A" opacity="0.7" />
    </svg>
  );
}

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [apiError, setApiError] = useState('');
  const forgotMutation = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    setApiError('');
    forgotMutation.mutate(values.email, {
      onSuccess: () => {
        setSubmittedEmail(values.email);
        setSubmitted(true);
      },
      onError: () => {
        // Even on error, show success state (anti-enumeration)
        setSubmittedEmail(values.email);
        setSubmitted(true);
      },
    });
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
        <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-md border border-white/5 p-8 w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <IITBHULogo />
            <span className="text-sm font-semibold text-iitbhu">Carbon Portal</span>
          </div>

          <MailCheck size={48} className="text-iitbhu mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
          <p className="text-gray-300 text-sm mb-2">
            If{' '}
            <span className="font-medium text-white">{submittedEmail}</span> is registered,
            you'll receive a password reset link within a few minutes.
          </p>
          <p className="text-gray-400 text-sm mb-6">The link expires in 1 hour.</p>

          <div className="space-y-3">
            <Link
              to="/login"
              className="block text-sm font-medium text-iitbhu hover:underline"
            >
              Back to Login
            </Link>
            <button
              onClick={() => setSubmitted(false)}
              className="block w-full text-sm text-gray-400 hover:text-gray-200"
            >
              Didn't receive it? Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
      <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-md border border-white/5 p-8 w-full max-w-md">
        {/* Back link */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-6"
        >
          <ArrowLeft size={14} />
          Back to login
        </Link>

        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <IITBHULogo />
          <span className="text-sm font-semibold text-iitbhu">Carbon Portal</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Forgot your password?</h2>
        <p className="text-sm text-gray-400 mb-6">
          Enter your institutional email and we'll send you a reset link.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" fullWidth isLoading={forgotMutation.isPending}>
            {forgotMutation.isPending ? 'Sending…' : 'Send reset link'}
          </Button>

          {apiError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{apiError}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
