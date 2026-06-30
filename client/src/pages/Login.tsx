import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/features/auth/authStore';
import { useLogin } from '@/features/auth/useAuth';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
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

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const registered = (location.state as { registered?: boolean; from?: { pathname?: string } })?.registered;
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;

  const loginMutation = useLogin(from);

  useEffect(() => {
    if (user) navigate(from || '/dashboard', { replace: true });
  }, [user, navigate, from]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    setApiError('');
    loginMutation.mutate(values, {
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { message?: string } } };
        setApiError(e.response?.data?.message || 'Login failed. Please try again.');
      },
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <IITBHULogo />
          <span className="mt-2 text-sm font-semibold text-iitbhu tracking-wide">Carbon Portal</span>
          <h2 className="text-2xl font-bold text-gray-900 mt-6 mb-1">Sign in to your account</h2>
          <p className="text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-iitbhu font-medium hover:underline">
              Register →
            </Link>
          </p>
        </div>

        {/* Registration success banner */}
        {registered && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-6 text-sm">
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Registration successful! Please check your email and click the verification link before
              logging in.
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
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

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-iitbhu hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth isLoading={loginMutation.isPending}>
            {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
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
