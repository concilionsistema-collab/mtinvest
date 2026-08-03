import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './branding.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './themes.css';
import { AuthProvider } from '../components/auth-context';
import { AppShell } from '../components/app-shell';
import { ThemeProvider } from '../components/theme-context';

const themeBootstrap = `(() => {
  try {
    const valid = ['executive-dark','corporate-light','midnight-emerald','graphite-copper'];
    const saved = localStorage.getItem('concilion-crm-theme');
    const theme = valid.includes(saved) ? saved : 'executive-dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'corporate-light' ? 'light' : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'executive-dark';
  }
})();`;

export const metadata: Metadata = {
  title: 'MT INVEST | CIONLARIS CRM',
  description: 'CRM imobiliário da MT INVEST, criado pela CIONLARIS by Concilion.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="executive-dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
