import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, ChevronDown, MailCheck, AlertCircle } from 'lucide-react';
import { useRegister } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/authApi';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';

const ALLOWED_DOMAINS = ['@itbhu.ac.in', '@iitbhu.ac.in', '@bhu.ac.in'];

const DEPARTMENTS = [
  'Computer Science',
  'Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Physics',
  'Mathematics',
  'Humanities & Social Sciences',
  'Administration',
  'Hostel Management',
  'Other',
];

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z
      .string()
      .email('Please enter a valid email')
      .refine(
        (val) => ALLOWED_DOMAINS.some((d) => val.endsWith(d)),
        'Only IIT BHU email addresses are allowed'
      ),
    department: z.string().optional(),
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
    <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-label="IIT BHU logo mark">
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

const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];

function PasswordStrength({ password }: { password: string }) {
  const score = getPasswordStrength(password);
  if (!password) return null;
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
      <p className={`text-xs mt-1 ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-yellow-600' : score === 3 ? 'text-blue-600' : 'text-green-600'}`}>
        {strengthLabels[score]}
      </p>
    </div>
  );
}

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordValue = watch('password', '');
  const emailValue = watch('email', '');

  function onSubmit(values: FormValues) {
    registerMutation.mutate(
      {
        name: values.name,
        email: values.email,
        password: values.password,
        department: values.department || undefined,
      },
      {
        onSuccess: () => {
          setRegisteredEmail(values.email);
        },
      }
    );
  }

  async function handleResend() {
    if (!registeredEmail) return;
    setResendStatus('sending');
    try {
      await authApi.resendVerification(registeredEmail);
      setResendStatus('sent');
    } catch {
      setResendStatus('sent'); // show success regardless (anti-enumeration)
    }
  }

  // Success state
  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 w-full max-w-md text-center">
          <MailCheck size={48} className="text-iitbhu mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email!</h2>
          <p className="text-gray-600 mb-6">
            We've sent a verification link to{' '}
            <span className="font-medium text-gray-900">{registeredEmail}</span>. Click it to
            activate your account.
          </p>
          {resendStatus === 'sent' ? (
            <p className="text-sm text-green-600 mb-4">Sent! Check your inbox.</p>
          ) : (
            <p className="text-sm text-gray-500 mb-4">
              Didn't receive it?{' '}
              <button
                onClick={handleResend}
                disabled={resendStatus === 'sending'}
                className="text-iitbhu font-medium hover:underline disabled:opacity-60"
              >
                {resendStatus === 'sending' ? 'Sending...' : 'Resend verification email'}
              </button>
            </p>
          )}
          <Link
            to="/login"
            className="inline-block text-sm font-medium text-gray-600 border border-gray-300 px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <IITBHULogo />
          <span className="mt-2 text-sm font-semibold text-iitbhu tracking-wide">Carbon Portal</span>
          <h2 className="text-2xl font-bold text-gray-900 mt-6 mb-1">Create your account</h2>
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-iitbhu font-medium hover:underline">
              Sign in →
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Full name"
            type="text"
            autoComplete="name"
            autoFocus
            error={errors.name?.message}
            {...register('name')}
          />

          <div>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            {!errors.email && (
              <p className="mt-1 text-xs text-gray-500">
                Use your @itbhu.ac.in, @iitbhu.ac.in, or @bhu.ac.in email
              </p>
            )}
          </div>

          {/* Department select */}
          <div className="w-full">
            <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
              Department <span className="text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <select
                id="department"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-iitbhu focus:border-transparent appearance-none bg-white pr-10"
                {...register('department')}
              >
                <option value="">Select department…</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          <div>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
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
            label="Confirm password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            suffix={
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register('confirmPassword')}
          />

          <Button type="submit" fullWidth isLoading={registerMutation.isPending} className="mt-2">
            {registerMutation.isPending ? 'Creating account...' : 'Create account'}
          </Button>

          {registerMutation.isError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>
                {(registerMutation.error as { response?: { data?: { message?: string } } })
                  ?.response?.data?.message || 'Registration failed. Please try again.'}
              </span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
