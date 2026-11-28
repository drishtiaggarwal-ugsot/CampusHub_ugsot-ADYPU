import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import WelcomeExperience from '@/components/landing/WelcomeExperience';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Welcome · CampusHub · UGSOT',
  description: 'Build, connect, collaborate and grow with UGSOT CampusHub.',
};

export default async function WelcomePage() {
  const currentUser = await getCurrentUser();
  return <WelcomeExperience currentUser={currentUser} />;
}
