'use client';

import { useSyncExternalStore } from 'react';

const THEME_STORAGE_KEY = 'campushub-theme';
const THEME_EVENT = 'campushub-theme-change';

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getClientTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      if (document.documentElement.dataset.theme !== saved) {
        document.documentElement.dataset.theme = saved;
      }
      return saved;
    }
  } catch {
    // Ignore storage access failures
  }
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function getServerTheme(): 'light' | 'dark' {
  return 'light';
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getClientTheme, getServerTheme);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage access failures
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      className="topbar-icon"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={theme === 'dark'}
      onClick={toggleTheme}
    >
      ◐
    </button>
  );
}
