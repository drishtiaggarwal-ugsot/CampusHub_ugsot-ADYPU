import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '@/components/PageHero';
import Card from '@/components/ui/Card';
import SquadInviteAcceptView from '@/components/teams/SquadInviteAcceptView';
import { getInvitationById } from '@/lib/db/teams';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const invite = await getInvitationById(inviteId);
  return {
    title: invite ? `Squad Invite: ${invite.teamName} · CampusHub` : 'Squad Invitation · CampusHub',
  };
}

export default async function SquadInvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const [invite, currentUser] = await Promise.all([
    getInvitationById(inviteId),
    getCurrentUser(),
  ]);

  if (!invite) {
    if (!currentUser) {
      const nextUrl = encodeURIComponent(`/squad-up/${inviteId}`);
      return (
        <main className="container page" style={{ minHeight: '75vh', justifyContent: 'center' }}>
          <PageHero
            tag="Campus Teams · Squad Up"
            before="Sign in to view "
            highlight="your team invite"
            sub="Sign in with your CampusHub account to accept or decline this squad invitation."
          />
          <Card style={{ maxWidth: 540, width: '100%', padding: '28px 24px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="card__title">Authentication required</h2>
            <p className="muted-note" style={{ margin: 0 }}>
              Team invitations are private to invited students. Sign in with your invited account to view and respond.
            </p>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <Link href={`/auth/sign-in?next=${nextUrl}`} className="btn btn--primary">
                Sign in to respond
              </Link>
              <Link href={`/auth/register?next=${nextUrl}`} className="btn btn--outline">
                Create account
              </Link>
            </div>
          </Card>
        </main>
      );
    }
    notFound();
  }

  return (
    <main className="container page" style={{ minHeight: '75vh', justifyContent: 'center' }}>
      <PageHero
        tag="Campus Teams · Squad Up"
        before="Join "
        highlight={invite.teamName}
        sub="You have been invited to team up for upcoming campus events and hackathons."
      />
      <SquadInviteAcceptView invite={invite} currentUser={currentUser} />
    </main>
  );
}
