import { redirect } from 'next/navigation';
import PageHero from '@/components/PageHero';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getAllTeams } from '@/lib/db/teams';
import { createDbClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Admin Panel · Firestore Console · CampusHub',
  description: 'Manage campus teams, hackathon rosters, and real-time student activity.',
};

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/auth/sign-in?redirect=/admin');
  }

  if (!isAdmin(currentUser)) {
    return (
      <main className="container page" style={{ minHeight: '70vh', justifyContent: 'center' }}>
        <PageHero
          tag="Access Restricted"
          before="Admin "
          highlight="Console"
          sub="Organizer privileges required to access the Firestore admin panel."
        />
        <div className="card" style={{ maxWidth: 520, margin: '24px auto', padding: 32, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>Organizer Access Required</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
            You are signed in as <strong>{currentUser.email}</strong>, which does not currently have organizer credentials.
            Admin access is granted to authorized coordinators (including <code>sahildehadray157@gmail.com</code>).
          </p>
        </div>
      </main>
    );
  }

  const db = await createDbClient();
  const [teams, invitesRes, profilesRes, certsRes, eventsRes] = await Promise.all([
    getAllTeams(),
    db.from('team_invitations').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('profiles').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('event_certificates').select('*').order('issued_at', { ascending: false }).limit(100),
    db.from('event_catalog').select('id, title, start_date'),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  const eventMap = new Map((eventsRes.data || []).map((e) => [e.id, e]));

  const initialCertificates = (certsRes.data || []).map((c) => {
    const p = profileMap.get(c.user_id);
    const e = eventMap.get(c.event_id);
    return {
      id: c.id,
      certificateId: c.id,
      certificateNumber: (c as { certificate_number?: string }).certificate_number || c.id.slice(0, 8).toUpperCase(),
      eventId: c.event_id,
      eventTitle: e?.title || c.event_id,
      userId: c.user_id,
      attendeeName: p?.full_name || 'Student',
      attendeeEmail: p?.email || '',
      courseYear: p?.course_year || '',
      issuedAt: c.issued_at,
    };
  });

  return (
    <main className="container page" style={{ gap: 24 }}>
      <PageHero
        tag="Campus Administration"
        before="Campus "
        highlight="Admin Panel"
        sub="Manage registered teams, squad invitations, student accounts, and official certificates."
      />
      <AdminDashboard
        initialTeams={teams}
        initialInvitations={invitesRes.data || []}
        initialProfiles={profilesRes.data || []}
        initialCertificates={initialCertificates}
        eventsList={(eventsRes.data || []).map((e) => ({ id: e.id, title: e.title }))}
        currentUserId={currentUser.id}
        currentUserEmail={currentUser.email}
      />
    </main>
  );
}
