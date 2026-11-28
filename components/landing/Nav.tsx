'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CurrentUser } from '@/lib/auth';
import LogoMark from './LogoMark';
import styles from './welcome.module.css';

const links = [
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/noticeboard', label: 'Noticeboard' },
];

export default function Nav({ currentUser }: { currentUser?: CurrentUser | null } = {}) {
  const pathname = usePathname();

  const handleBrandClick = (e: React.MouseEvent) => {
    if (pathname === '/welcome' || pathname === '/') {
      e.preventDefault();
      const hero = document.getElementById('hero');
      if (hero) {
        hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <header className={styles.header} data-landing-nav data-theme="light">
      <div className={styles.headerInner}>
        <Link
          href="/#hero"
          className={styles.brand}
          aria-label="UGSOT Campus Hub"
          onClick={handleBrandClick}
        >
          <LogoMark />
          <span>UGSOT <span className={styles.brandHub}>CampusHub</span></span>
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          {links.map((link) => (
            <Link href={link.href} key={link.href}>
              <span className={styles.navRoll}>
                <span>{link.label}</span>
                <span aria-hidden="true">{link.label}</span>
              </span>
            </Link>
          ))}
        </nav>
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              href="/"
              className={styles.signIn}
              style={{
                background: 'var(--ink, #000)',
                color: 'var(--canvas, #fff)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
              }}
            >
              Dashboard →
            </Link>
            <Link
              href="/profile"
              title={`Signed in as ${currentUser.name}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--electric-blue, #2563eb)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {currentUser.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        ) : (
          <Link href="/auth/sign-in" className={styles.signIn}>Sign in</Link>
        )}
      </div>
    </header>
  );
}
