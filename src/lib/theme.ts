import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'chapter.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function apply(pref: ThemePref) {
  const resolved = pref === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : pref;
  document.documentElement.setAttribute('data-theme', resolved);
}

/** Per-device appearance preference (kept in localStorage by design). */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readPref);

  // keep every hook instance in step when the preference changes anywhere
  useEffect(() => {
    const onChange = () => setPref(readPref());
    window.addEventListener('chapter-theme', onChange);
    return () => window.removeEventListener('chapter-theme', onChange);
  }, []);

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const set = useCallback((p: ThemePref) => {
    try { localStorage.setItem(KEY, p); } catch { /* private mode */ }
    setPref(p);
    window.dispatchEvent(new Event('chapter-theme'));
  }, []);

  return [pref, set];
}
