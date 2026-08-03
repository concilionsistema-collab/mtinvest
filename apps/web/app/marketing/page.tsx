'use client';

import { useEffect, useState } from 'react';
import type { IndicadoresFunil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const NOMES_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  site: 'Site',
  indicacao: 'Indicação',
  captacao_ativa: 'Captação ativa',
};

export default function MarketingPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<IndicadoresFunil>('/indicadores')
      .then(setDados)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? setSemPermissao(true) : setErro('Falha ao carregar Marketing.')));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (semPermissao) return <main><h1>Marketing</h1><p>Apenas o perfil "Gestor de unidade" acessa esta tela.</p></main>;
  if (erro) return <main><h1>Marketing</h1><p>{erro}</p></main>;
  if (!dados) return <main><h1>Marketing</h1><p>Carregando...</p></main>;

  const entradas = Object.entries(dados.leadsPorCanal).sort(([, a], [, b]) => b - a);
  const total = entradas.reduce((soma, [, v]) => soma + v, 0) || 1;

  return (
    <main>
      <h1>Marketing</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Leads por canal de origem (<code>Lead.origemCanal</code>) — dado real, agregado a partir de <code>GET /indicadores</code>.
        Sem dado individual de lead (RN-011).
      </p>

      {entradas.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum lead capturado ainda.</p>}

      <ul className="bar-list" style={{ maxWidth: 480, marginTop: 16 }}>
        {entradas.map(([canal, quantidade]) => (
          <li key={canal}>
            <span>{NOMES_CANAL[canal] ?? canal}</span>
            <i><b style={{ width: `${Math.round((quantidade / total) * 100)}%` }} /></i>
            <em>{quantidade}</em>
          </li>
        ))}
      </ul>
    </main>
  );
}
