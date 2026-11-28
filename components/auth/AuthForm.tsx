'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  completeGoogleRedirectClient,
  signInWithEmailClient,
  signInWithGoogleClient,
  signUpWithEmailClient,
} from '@/lib/auth-client';
import { AuthServiceError } from '@/lib/auth-types';
import { validateSignIn, validateSignUp, type AuthErrors } from '@/lib/validation';

type Mode = 'sign-in' | 'register';
type Fields = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  courseYear: string;
};
type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  error?: string;
  onChange: (value: string) => void;
};

const COURSE_YEARS = [
  'CSE · 1st year', 'CSE · 2nd year', 'CSE · 3rd year', 'CSE · 4th year',
  'AI & DS · 1st year', 'AI & DS · 2nd year', 'AI & DS · 3rd year', 'AI & DS · 4th year',
  'IT · 1st year', 'IT · 2nd year', 'IT · 3rd year', 'IT · 4th year',
];

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function PasswordField({ id, label, value, autoComplete, error, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div className="auth-field">
      <div className="field">
        <label className="field__label" htmlFor={id}>{label}</label>
        <span className="auth-password">
          <input id={id} className="input" type={visible ? 'text' : 'password'} value={value}
            autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)}
            aria-invalid={!!error} aria-describedby={error ? errorId : undefined} required />
          <button type="button" className="auth-password__toggle" aria-pressed={visible}
            aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((show) => !show)}>
            {visible ? 'Hide' : 'Show'}
          </button>
        </span>
      </div>
      {error && <span id={errorId} className="form-error">{error}</span>}
    </div>
  );
}

export default function AuthForm({
  mode,
  redirectTo = '/',
}: {
  mode: Mode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const safeTarget = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
  const [activeMode, setActiveMode] = useState(mode);
  const registering = activeMode === 'register';
  const [values, setValues] = useState<Fields>({
    name: '', email: '', password: '', confirmPassword: '', courseYear: '',
  });
  const [errors, setErrors] = useState<AuthErrors>({});
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const busy = submitting || googlePending;

  useEffect(() => {
    let active = true;
    completeGoogleRedirectClient().then((signedIn) => {
      if (active && signedIn) {
        router.replace(safeTarget);
        router.refresh();
      }
    });
    return () => {
      active = false;
    };
  }, [router, safeTarget]);

  function update(field: keyof Fields, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
    setFormMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = registering
      ? validateSignUp(values)
      : validateSignIn({ email: values.email, password: values.password });
    setErrors(validation);
    setFormError('');
    setFormMessage('');
    if (Object.keys(validation).length) return;

    setSubmitting(true);
    try {
      if (registering) {
        await signUpWithEmailClient({
          name: values.name,
          email: values.email,
          password: values.password,
          courseYear: values.courseYear,
        });
      } else {
        await signInWithEmailClient(values.email, values.password);
      }
      router.replace(safeTarget);
      router.refresh();
    } catch (error) {
      if (error instanceof AuthServiceError) {
        setFormError(error.message);
      } else {
        setFormError('We couldn’t reach CampusHub. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrors({});
    setFormError('');
    setFormMessage('');
    setGooglePending(true);
    try {
      const result = await signInWithGoogleClient();
      if (result.cancelled) return;
      router.replace(safeTarget);
      router.refresh();
    } catch (error) {
      if (error instanceof AuthServiceError) {
        setFormError(error.message);
      } else {
        setFormError('Google sign-in could not be completed. Please try again.');
      }
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-heading">
        <h1 className="auth-heading__title">{registering ? 'Join CampusHub' : 'Welcome back'}</h1>
        <p>{registering ? 'Create your student account to get started.' : 'Sign in with your email address or Google to continue.'}</p>
      </div>
      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button id="auth-tab-login" className={registering ? 'auth-tab' : 'auth-tab auth-tab--active'}
          type="button" role="tab" aria-selected={!registering} aria-controls="auth-form"
          onClick={() => { setActiveMode('sign-in'); setErrors({}); setFormError(''); setFormMessage(''); }}>
          Login
        </button>
        <button id="auth-tab-register" className={registering ? 'auth-tab auth-tab--active' : 'auth-tab'}
          type="button" role="tab" aria-selected={registering} aria-controls="auth-form"
          onClick={() => { setActiveMode('register'); setErrors({}); setFormError(''); setFormMessage(''); }}>
          Register
        </button>
      </div>
      <form id="auth-form" className="auth-form" role="tabpanel"
        aria-labelledby={registering ? 'auth-tab-register' : 'auth-tab-login'}
        onSubmit={submit} noValidate>
      {registering && (
        <AuthTextField id="auth-name" label="Full name" value={values.name} autoComplete="name"
          error={errors.name} onChange={(value) => update('name', value)} />
      )}
      <AuthTextField id="auth-email" label="Email address" type="email" value={values.email}
        autoComplete="email" placeholder="you@example.com" error={errors.email}
        onChange={(value) => update('email', value)} />
      <PasswordField id="auth-password" label="Password" value={values.password}
        autoComplete={registering ? 'new-password' : 'current-password'} error={errors.password}
        onChange={(value) => update('password', value)} />
      {registering && (
        <>
          <PasswordField id="auth-confirm-password" label="Confirm password" value={values.confirmPassword}
            autoComplete="new-password" error={errors.confirmPassword}
            onChange={(value) => update('confirmPassword', value)} />
          <div className="auth-field">
            <label className="field" htmlFor="auth-course-year">
              <span className="field__label">Course and year</span>
              <select id="auth-course-year" className="input" value={values.courseYear}
                onChange={(event) => update('courseYear', event.target.value)}
                aria-invalid={!!errors.courseYear} aria-describedby={errors.courseYear ? 'auth-course-year-error' : undefined}
                autoComplete="off" required>
                <option value="">Choose your course and year</option>
                {COURSE_YEARS.map((courseYear) => <option key={courseYear}>{courseYear}</option>)}
              </select>
            </label>
            {errors.courseYear && <span id="auth-course-year-error" className="form-error">{errors.courseYear}</span>}
          </div>
        </>
      )}
      {formError && <p className="form-error" role="alert">{formError}</p>}
      {formMessage && (
        <p className="form-success" role="status">{formMessage}</p>
      )}
      {!registering && (
        <Link href="/auth/forgot-password" className="auth-form__forgot">Forgot password?</Link>
      )}
      <button className="btn btn--primary auth-form__submit" type="submit" disabled={busy}>
        {submitting ? (registering ? 'Creating account…' : 'Signing in…') : (registering ? 'Create account' : 'Sign in')}
      </button>
      </form>

      <div className="auth-divider" aria-hidden="true">
        <span>or</span>
      </div>

      <button
        type="button"
        className="btn auth-google"
        onClick={handleGoogleSignIn}
        disabled={busy}
      >
        <GoogleMark />
        <span>{googlePending ? 'Connecting to Google…' : 'Continue with Google'}</span>
      </button>
    </div>
  );
}

function AuthTextField({
  id, label, type = 'text', value, autoComplete, placeholder, error, onChange,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  autoComplete: string;
  placeholder?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="auth-field">
      <label className="field" htmlFor={id}>
        <span className="field__label">{label}</span>
        <input id={id} className="input" type={type} value={value} autoComplete={autoComplete}
          placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error} aria-describedby={error ? errorId : undefined} required />
      </label>
      {error && <span id={errorId} className="form-error">{error}</span>}
    </div>
  );
}
