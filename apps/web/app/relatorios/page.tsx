'use client';

import Link from 'next/link';
import { useAuth } from '../../components/auth-context';

const RELATORIOS = [
  ['/indicadores', 'Indicadores', 'Funil de oportunidades, leads por estado, visitas, propostas e SLA aproximado (US-024).'],
  ['/funil', 'Funil de Vendas', 'Visualização do funil, dos leads distribuídos até os fechamentos.'],
  ['/marketing', 'Marketing', 'Leads por canal de origem.'],
  ['/financeiro', 'Financeiro', 'VGV realizado e comissões cruzadas acionadas.'],
] as const;

export default function RelatoriosPage() {
  const { sessao } = useAuth();
  if (!sessao) return null;

  return (
    <main>
      <h1>Relatórios</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Atalho para os relatórios reais do sistema — cada um já existe como tela própria, aqui é só um hub.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, display: 'grid', gap: 10, maxWidth: 640 }}>
        {RELATORIOS.map(([href, titulo, descricao]) => (
          <li key={href} className="dash-panel">
            <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <b>{titulo}</b>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>{descricao}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
