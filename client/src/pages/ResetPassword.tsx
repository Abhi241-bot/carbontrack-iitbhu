import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useResetPassword } from '@/features/auth/useAuth';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Minimum 8 characters')
      .regex(/(?=.*[a-z])/, 'Must contain a lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Must contain an uppercase letter')
      .regex(/(?=.*\d)/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
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

function getPasswordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  return score;
}

const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];

function PasswordStrength({ password }: { password: string }) {
  const score = getPasswordStrength(password);
  if (!password) return null;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const textColors = ['', 'text-red-500', 'text-yellow-600', 'text-blue-600', 'text-green-600'];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? strengthColors[score] : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs mt-1 ${textColors[score]}`}>{labels[score]}</p>
    </div>
  );
}

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');
  const navigate = useNavigate();
  const resetMutation = useResetPassword();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password', '');

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => navigate('/login'), 3000);
      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  function onSubmit(values: FormValues) {
    if (!token) return;
    setApiError('');
    resetMutation.mutate(
      { token, password: values.password },
      {
        onSuccess: () => setSuccess(true),
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { message?: string } } };
          setApiError(e.response?.data?.message || 'Reset failed. The link may be invalid or expired.');
        },
      }
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
        <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-md border border-white/5 p-8 w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <IITBHULogo />
            <span className="text-sm font-semibold text-iitbhu">Carbon Portal</span>
          </div>
          <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Password Reset!</h2>
          <p className="text-gray-300 text-sm mb-4">
            Your password has been updated. Redirecting you to login…
          </p>
          <Link to="/login" className="text-sm text-iitbhu font-medium hover:underline">
            Go to Login now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
      <div className="bg-black/40 backdrop-blur-md rounded-2xl shadow-md border border-white/5 p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <IITBHULogo />
          <span className="text-sm font-semibold text-iitbhu">Carbon Portal</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Reset your password</h2>
        <p className="text-sm text-gray-400 mb-6">Choose a strong new password for your account.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Input
              label="New password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-gray-400 hover:text-gray-300 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              {...register('password')}
            />
            <PasswordStrength password={passwordValue} />
          </div>

          <Input
            label="Confirm new password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            suffix={
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="text-gray-400 hover:text-gray-300 focus:outline-none"
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register('confirmPassword')}
          />

          <Button type="submit" fullWidth isLoading={resetMutation.isPending}>
            {resetMutation.isPending ? 'Resetting…' : 'Reset Password'}
          </Button>

          {apiError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>
                {apiError}{' '}
                <Link to="/forgot-password" className="underline font-medium">
                  Request a new one →
                </Link>
              </span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
