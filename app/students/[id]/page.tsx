import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProfileView from '@/components/ProfileView';
import { getPublicStudentById } from '@/lib/db/dashboard';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getMyEventRegistrations, getMyCertificates, type MyEventRegistration, type UserCertificate } from '@/lib/db/events';
import { getMyBookmarkedProjects } from '@/lib/db/projects';
import type { Project } from '@/lib/types';
import { getMyTeamInvitations } from '@/lib/db/teams';
import type { TeamInvitation } from '@/lib/types';
import { getUserDashboardData, type DashboardStats } from '@/lib/db/dashboard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getPublicStudentById(id);
  return { title: s ? `${s.name} · CampusHub · UGSOT` : 'Student not found · CampusHub · UGSOT' };
}

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await getPublicStudentById(id);
  if (!student) notFound();

  const currentUser = await getCurrentUser();
  const isOwn = currentUser ? currentUser.id === student.id : false;

  // Fetch data for current user (needed for Squad Up modal to show registered events)
  let registrations: MyEventRegistration[] = [];
  let registrationsError = '';
  try {
    registrations = await getMyEventRegistrations();
  } catch (error) {
    console.error('Unable to load the profile event registrations.', error);
    registrationsError = 'Your registrations are temporarily unavailable.';
  }

  let certificates: UserCertificate[] = [];
  try {
    certificates = await getMyCertificates();
  } catch (error) {
    console.error('Unable to load certificates:', error);
  }

  let bookmarkedProjects: Project[] = [];
  try {
    bookmarkedProjects = await getMyBookmarkedProjects();
  } catch (error) {
    console.error('Unable to load bookmarks:', error);
  }

  let dashboardStats: DashboardStats | undefined;
  try {
    dashboardStats = await getUserDashboardData(currentUser?.id ?? '', currentUser?.githubUsername ?? null);
  } catch (error) {
    console.error('Unable to load dashboard stats:', error);
  }

  let initialInvitations: { received: TeamInvitation[]; sent: TeamInvitation[] } = { received: [], sent: [] };
  try {
    initialInvitations = await getMyTeamInvitations();
  } catch (error) {
    console.error('Unable to load team invitations:', error);
  }

  return (
    <main className="container page" style={{ gap: 12 }}>
      <Link href="/students" className="back-link">← All students</Link>
      <ProfileView
        key={student.id}
        student={student}
        isOwn={isOwn}
        isAdminView={isAdmin(currentUser)}
        currentUserEmail={currentUser?.email ?? null}
        registrations={registrations}
        registrationsError={registrationsError}
        certificates={certificates}
        bookmarkedProjects={bookmarkedProjects}
        dashboardStats={dashboardStats}
        initialGithubUsername={currentUser?.githubUsername ?? null}
        initialInvitations={initialInvitations}
      />
    </main>
  );
}
