// Dark mode state — tách từ App.tsx. Persist 'dark' | 'light' vào localStorage
// ('theme'); mặc định theo prefers-color-scheme của hệ thống.

import { useEffect, useState } from 'react';

export function useDarkMode(): { isDarkMode: boolean; toggleDarkMode: () => void } {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light');
      } catch {
        /* quota ignore */
      }
      return next;
    });
  };

  return { isDarkMode, toggleDarkMode };
}
