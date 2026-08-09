'use client';

import { useTheme, THEMES } from './theme-context';

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
      <path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
      <path d="M2 22 12 12"/>
    </svg>
  );
}

const THEME_ICONS = {
  'corporate-light': SunIcon,
  'executive-dark': MoonIcon,
  'graphite-copper': BriefcaseIcon,
  'midnight-emerald': LeafIcon,
};

export function TopThemeSelector() {
  const { tema, definirTema } = useTheme();

  return (
    <div className="top-theme-selector">
      <b>Tema</b>
      <div className="top-theme-pill" role="group" aria-label="Temas do sistema">
        {THEMES.map((item) => {
          const Icon = THEME_ICONS[item.id];
          if (!Icon) return null;
          const ativo = tema === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`top-theme-btn ${ativo ? 'active' : ''}`}
              aria-pressed={ativo}
              onClick={() => definirTema(item.id)}
              aria-label={item.nome}
              title={item.nome}
            >
              <Icon />
            </button>
          );
        })}
      </div>
    </div>
  );
}
