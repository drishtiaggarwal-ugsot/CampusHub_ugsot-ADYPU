import { redirect } from 'next/navigation';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { getCurrentUser } from '@/lib/auth';
import { getAdminEventsData } from '@/lib/db/admin-events';
import AdminEventsDashboard from '@/components/admin/AdminEventsDashboard';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Event Management · CampusHub Admin',
  description: 'View event registrations, create new events, and manage event participation.',
};

export default async function AdminEventsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/auth/sign-in?redirect=/admin/events');
  }

  if (currentUser.role !== 'organizer') {
    return (
      <main className="container page" style={{ minHeight: '70vh', justifyContent: 'center' }}>
        <PageHero
          tag="Access Restricted"
          before="Event "
          highlight="Management"
          sub="Organizer privileges required to access event management tools."
        />
        <div className="card" style={{ maxWidth: 520, margin: '24px auto', padding: 32, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Organizer Access Required</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
            You are signed in as <strong>{currentUser.email}</strong>, which does not currently have organizer credentials.
          </p>
          <Link href="/admin" className="btn btn--primary">Back to Admin Panel</Link>
        </div>
      </main>
    );
  }

  const { events, stats } = await getAdminEventsData();

  return (
    <main className="container page" style={{ gap: 24 }}>
      <PageHero
        tag="Event Management"
        before="Campus "
        highlight="Events"
        sub="Create events, view registrations, and track participation across all campus activities."
      />
      <AdminEventsDashboard 
        events={events}
        stats={stats}
        currentUser={currentUser}
      />
    </main>
  );
}