import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './branding.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AuthProvider } from '../components/auth-context';
import { AppShell } from '../components/app-shell';

export const metadata: Metadata = {
  title: 'Concilion CRM | MT Invest',
  description: 'Concilion CRM para a operação imobiliária da MT Invest.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
