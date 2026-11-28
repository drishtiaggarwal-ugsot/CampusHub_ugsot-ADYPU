import { pastel } from '@/lib/colors';

function colorHash(str: string): number {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function initialsOf(name: string) {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean);
  if (!parts.length) return '?';
  return parts.join('').slice(0, 2).toUpperCase();
}

export default function Avatar({
  studentId,
  name,
  size = 'md',
}: {
  studentId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const c = pastel[colorHash(studentId || name) % pastel.length];
  return (
    <span aria-hidden="true" className={`avatar avatar--${size}`} style={{ background: c.bg, color: c.fg }}>
      {initialsOf(name)}
    </span>
  );
}
