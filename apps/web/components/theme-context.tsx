'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const THEMES = [
  { id: 'executive-dark', nome: 'Executive Dark', descricao: 'Tecnológico, moderno e corporativo.', recomendado: true },
  { id: 'corporate-light', nome: 'Corporate Light', descricao: 'Claro, organizado e produtivo.', recomendado: false },
  { id: 'midnight-emerald', nome: 'Midnight Emerald', descricao: 'Crescimento, segurança e resultados.', recomendado: false },
  { id: 'graphite-copper', nome: 'Graphite Copper', descricao: 'Luxo, exclusividade e alto padrão.', recomendado: false },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const THEME_STORAGE_KEY = 'concilion-crm-theme';
const DEFAULT_THEME: ThemeId = 'executive-dark';

type ThemeContextValue = {
  tema: ThemeId;
  definirTema: (tema: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function temaValido(valor: string | null): valor is ThemeId {
  return THEMES.some((tema) => tema.id === valor);
}

function aplicarTema(tema: ThemeId) {
  document.documentElement.dataset.theme = tema;
  document.documentElement.style.colorScheme = tema === 'corporate-light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const temaSalvo = window.localStorage.getItem(THEME_STORAGE_KEY);
    const temaInicial = temaValido(temaSalvo) ? temaSalvo : DEFAULT_THEME;
    setTema(temaInicial);
    aplicarTema(temaInicial);

    function sincronizar(evento: StorageEvent) {
      if (evento.key !== THEME_STORAGE_KEY || !temaValido(evento.newValue)) return;
      setTema(evento.newValue);
      aplicarTema(evento.newValue);
    }

    window.addEventListener('storage', sincronizar);
    return () => window.removeEventListener('storage', sincronizar);
  }, []);

  const definirTema = useCallback((novoTema: ThemeId) => {
    setTema(novoTema);
    aplicarTema(novoTema);
    window.localStorage.setItem(THEME_STORAGE_KEY, novoTema);
  }, []);

  const valor = useMemo(() => ({ tema, definirTema }), [tema, definirTema]);
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const contexto = useContext(ThemeContext);
  if (!contexto) throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  return contexto;
}
