'use client';

import { useState, useEffect } from 'react';
import Button from './ui/Button';

interface ForkButtonProps {
  targetUserId: string;
  targetName: string;
  initialIsForking?: boolean;
  initialDockersCount?: number;
  onCountChange?: (newCount: number, isForking: boolean) => void;
  size?: 'sm' | 'md';
}

export default function ForkButton({
  targetUserId,
  targetName,
  initialIsForking = false,
  initialDockersCount = 0,
  onCountChange,
  size = 'md',
}: ForkButtonProps) {
  const [override, setOverride] = useState<{
    key: string;
    isForking: boolean;
    dockersCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  const stateKey = targetUserId;
  const isForking = override && override.key === stateKey ? override.isForking : initialIsForking;
  const dockersCount = override && override.key === stateKey ? override.dockersCount : initialDockersCount;

  useEffect(() => {
    let ignore = false;
    fetch(`/api/students/${targetUserId}/fork`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data) {
          setOverride({
            key: targetUserId,
            isForking: Boolean(data.isForking),
            dockersCount: typeof data.dockersCount === 'number' ? data.dockersCount : 0,
          });
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [targetUserId, stateKey]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    // Save previous state for rollback
    const prevForking = isForking;
    const prevCount = dockersCount;
    const nextForking = !prevForking;
    const optimisticCount = Math.max(0, prevCount + (nextForking ? 1 : -1));

    // Optimistic UI update
    setOverride({
      key: stateKey,
      isForking: nextForking,
      dockersCount: optimisticCount,
    });
    setRateLimitError(null);
    setLoading(true);

    onCountChange?.(optimisticCount, nextForking);

    try {
      const res = await fetch(`/api/students/${targetUserId}/fork`, {
        method: nextForking ? 'POST' : 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        // Rollback optimistic state
        setOverride({
          key: stateKey,
          isForking: prevForking,
          dockersCount: prevCount,
        });
        onCountChange?.(prevCount, prevForking);

        const errorMsg = data.error || (res.status === 429 ? 'Slow down, try again in a minute.' : 'Failed to update Fork status');
        setRateLimitError(errorMsg);

        setTimeout(() => setRateLimitError(null), 4000);
        return;
      }

      // Server confirmed live state
      const confirmedForking = Boolean(data.is_forking ?? data.isForking);
      const confirmedCount = data.dockers_count ?? data.dockersCount;
      const resolvedCount = typeof confirmedCount === 'number' ? confirmedCount : optimisticCount;

      setOverride({
        key: stateKey,
        isForking: confirmedForking,
        dockersCount: resolvedCount,
      });
      if (typeof confirmedCount === 'number') {
        onCountChange?.(confirmedCount, confirmedForking);
      }
    } catch {
      // Network rollback
      setOverride({
        key: stateKey,
        isForking: prevForking,
        dockersCount: prevCount,
      });
      onCountChange?.(prevCount, prevForking);
      setRateLimitError('Network error. Please try again.');
      setTimeout(() => setRateLimitError(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <Button
        type="button"
        variant={isForking ? 'outline' : 'primary'}
        onClick={handleToggle}
        disabled={loading}
        aria-busy={loading}
        aria-label={isForking ? `Unfork ${targetName}` : `Fork ${targetName}`}
        style={{
          minHeight: size === 'sm' ? 34 : 44,
          padding: size === 'sm' ? '0 12px' : '0 18px',
          fontSize: size === 'sm' ? 13 : 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 800,
          opacity: loading ? 0.7 : 1,
        }}
      >
        <span>{isForking ? '⚓' : '🍴'}</span>
        <span>{loading ? 'Updating…' : isForking ? 'Docking' : 'Fork'}</span>
      </Button>

      {rateLimitError && (
        <span
          role="alert"
          style={{
            fontSize: 11,
            color: '#b91c1c',
            fontWeight: 700,
            background: '#fee2e2',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid #f87171',
            maxWidth: 220,
            lineHeight: 1.2,
          }}
        >
          {rateLimitError}
        </span>
      )}
    </div>
  );
}
