'use client';

import { useEffect, useState } from 'react';
import type { IndicadoresFunil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

export default function FunilPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<IndicadoresFunil>('/indicadores')
      .then(setDados)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? setSemPermissao(true) : setErro('Falha ao carregar o funil.')));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (semPermissao) return <main><h1>Funil de Vendas</h1><p>Apenas o perfil "Gestor de unidade" acessa o funil de vendas.</p></main>;
  if (erro) return <main><h1>Funil de Vendas</h1><p>{erro}</p></main>;
  if (!dados) return <main><h1>Funil de Vendas</h1><p>Carregando...</p></main>;

  const etapas: [number, string, string][] = [
    [dados.leadsDistribuidos, 'Leads distribuídos', String(dados.leadsDistribuidos)],
    [dados.leadsEmAtendimento, 'Em atendimento', String(dados.leadsEmAtendimento)],
    [dados.visitasRealizadas, 'Visitas realizadas', String(dados.visitasRealizadas)],
    [dados.propostasEnviadas, 'Propostas enviadas', String(dados.propostasEnviadas)],
    [dados.fechamentos, 'Fechamentos', String(dados.fechamentos)],
  ];
  const base = dados.leadsDistribuidos || 1;

  return (
    <main>
      <h1>Funil de Vendas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Reaproveita os dados de <code>GET /indicadores</code> (US-024) — mesma agregação da tela "Indicadores",
        aqui em formato de funil. Sempre por contagem, nunca dado individual de lead (RN-011).
      </p>

      <div className="funnel" style={{ marginTop: 16 }}>
        {etapas.map(([valor, nome, rotulo], i) => {
          const largura = Math.max(13, Math.round((valor / base) * 100));
          return (
            <div className={`funnel-step funnel-step--${i}`} style={{ width: `${largura}%` }} key={nome}>
              <span>{nome}</span>
              <b>{rotulo}</b>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
        SLA de atendimento dentro da janela de exclusividade (aproximação, ver "Indicadores"):{' '}
        <b>{dados.slaPercentualAtendidoDentroDaJanela}%</b>
      </p>
    </main>
  );
}
