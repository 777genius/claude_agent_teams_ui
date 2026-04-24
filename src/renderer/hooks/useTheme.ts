import { useCallback, useEffect, useState } from 'react';

import { useShallow } from 'zustand/react/shallow';

import { useStore } from '../store';

type Theme = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

const THEME_CACHE_KEY = 'agent-teams-theme-cache';
const LEGACY_THEME_CACHE_KEY = 'claude-devtools-theme-cache';

function parseCachedTheme(value: string | null): ResolvedTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function readCachedResolvedTheme(storage: Storage = localStorage): ResolvedTheme | null {
  try {
    return (
      parseCachedTheme(storage.getItem(THEME_CACHE_KEY)) ??
      parseCachedTheme(storage.getItem(LEGACY_THEME_CACHE_KEY))
    );
  } catch {
    return null;
  }
}

export function writeCachedResolvedTheme(
  resolvedTheme: ResolvedTheme,
  storage: Storage = localStorage
): void {
  try {
    storage.setItem(THEME_CACHE_KEY, resolvedTheme);
  } catch {
    // localStorage may not be available
  }
}

/**
 * Hook to manage theme state and application.
 * - Fetches theme preference from config on mount
 * - Listens to system theme changes when set to 'system'
 * - Applies theme class to document root
 * - Caches theme in localStorage for flash prevention
 */
export function useTheme(): {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  isLight: boolean;
} {
  const { appConfig, fetchConfig } = useStore(
    useShallow((s) => ({
      appConfig: s.appConfig,
      fetchConfig: s.fetchConfig,
    }))
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    // Initialize from cache to prevent flash
    const cached = readCachedResolvedTheme();
    if (cached) return cached;

    // No cache — detect system preference for flash-free first launch
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Fetch config on mount if not loaded.
  // The centralized init chain also calls fetchConfig — configLoading guard
  // in the store action prevents duplicate IPC calls.
  const configLoading = useStore((s) => s.configLoading);
  useEffect(() => {
    if (!appConfig && !configLoading) {
      void fetchConfig();
    }
  }, [appConfig, configLoading, fetchConfig]);

  // Get configured theme
  const configuredTheme: Theme = appConfig?.general?.theme ?? 'system';

  // Get system theme preference
  const getSystemTheme = useCallback((): ResolvedTheme => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  // Resolve 'system' theme and listen for changes
  useEffect(() => {
    const updateTheme = (): void => {
      const resolved = configuredTheme === 'system' ? getSystemTheme() : configuredTheme;
      setResolvedTheme(resolved);

      // Cache for flash prevention
      writeCachedResolvedTheme(resolved);
    };

    updateTheme();

    // Listen to system theme changes when in 'system' mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
      if (configuredTheme === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [configuredTheme, getSystemTheme]);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    body.classList.add('theme-transitioning');

    // Remove existing theme classes
    root.classList.remove('dark', 'light');

    // Add new theme class
    root.classList.add(resolvedTheme);

    const timer = window.setTimeout(() => {
      body.classList.remove('theme-transitioning');
    }, 250);

    return () => {
      window.clearTimeout(timer);
      body.classList.remove('theme-transitioning');
    };
  }, [resolvedTheme]);

  return {
    theme: configuredTheme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  };
}
