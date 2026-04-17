import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const ThemeContext = createContext(null);

export const COLOR_THEMES = [
  { id: 'default', label: 'Classic', group: 'boy', accent: '#FFE500', secondary: '#0066FF', tertiary: '#FF4D4D' },
  { id: 'dragon', label: 'Dragon Fire', group: 'boy', accent: '#FF4D4D', secondary: '#FF7A59', tertiary: '#FFE500' },
  { id: 'forest', label: 'Enchanted Forest', group: 'boy', accent: '#00A95C', secondary: '#39B54A', tertiary: '#FFE500' },
  { id: 'arctic', label: 'Arctic', group: 'boy', accent: '#0066FF', secondary: '#1E90FF', tertiary: '#FFE500' },
  { id: 'rose', label: 'Rose Gold', group: 'girl', accent: '#FF4D4D', secondary: '#FF7BAC', tertiary: '#FFE500' },
  { id: 'galaxy', label: 'Galaxy', group: 'girl', accent: '#7C3AED', secondary: '#A855F7', tertiary: '#0066FF' },
  { id: 'sunshine', label: 'Sunshine', group: 'girl', accent: '#FFE500', secondary: '#FFD100', tertiary: '#FF4D4D' },
  { id: 'fairy', label: 'Fairy Dust', group: 'girl', accent: '#A855F7', secondary: '#C084FC', tertiary: '#FFE500' },
];

export function ThemeProvider({ children }) {
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem('dinoquest-color-theme') || 'default';
  });

  useEffect(() => {
    localStorage.setItem('dinoquest-theme', 'light');
    localStorage.setItem('dinoquest-color-theme', colorTheme);

    const el = document.documentElement;
    el.classList.remove('light-mode', 'dark-mode');

    COLOR_THEMES.forEach((t) => {
      if (t.id !== 'default') el.classList.remove(`theme-${t.id}`);
    });
    if (colorTheme !== 'default') {
      el.classList.add(`theme-${colorTheme}`);
    }
  }, [colorTheme]);

  const setColorThemeAndSync = useCallback(async (themeId) => {
    setColorTheme(themeId);
    try {
      const me = await api('/api/auth/me');
      const config = { ...(me.avatar_config || {}), color_theme: themeId };
      await api('/api/auth/me', {
        method: 'PUT',
        body: { avatar_config: config },
      });
    } catch {
      // localStorage already has the value
    }
  }, []);

  const syncFromUser = useCallback((user) => {
    if (user?.avatar_config?.color_theme) {
      const serverTheme = user.avatar_config.color_theme;
      if (COLOR_THEMES.some((t) => t.id === serverTheme)) {
        setColorTheme(serverTheme);
        localStorage.setItem('dinoquest-color-theme', serverTheme);
      }
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: 'light',
        mode: 'light',
        setMode: () => {},
        toggle: () => {},
        colorTheme,
        setColorTheme: setColorThemeAndSync,
        syncFromUser,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be within ThemeProvider');
  return ctx;
}
