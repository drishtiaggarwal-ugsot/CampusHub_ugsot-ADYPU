import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from '@/components/auth/AuthForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · CampusHub · UGSOT' };

function getSafeRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; redirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirect(params.next ?? params.redirect);
  if (await getCurrentUser()) redirect(redirectTo);

  return (
    <div className="auth-content">
      <AuthForm mode="sign-in" redirectTo={redirectTo} />
      <div className="auth-links">
        <Link href="/welcome" className="auth-guest">Continue as guest</Link>
      </div>
    </div>
  );
}
