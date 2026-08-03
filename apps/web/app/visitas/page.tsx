'use client';

import { useEffect, useState } from 'react';
import type { Imovel, Oportunidade, Visita } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const ROTULOS_ESTADO: Record<Visita['estado'], string> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
};

export default function VisitasPage() {
  const { sessao } = useAuth();
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Visita[]>('/visitas'),
      apiFetch<Oportunidade[]>('/oportunidades'),
      apiFetch<Imovel[]>('/imoveis'),
    ])
      .then(([listaVisitas, listaOportunidades, listaImoveis]) => {
        setVisitas(listaVisitas);
        setOportunidades(listaOportunidades);
        setImoveis(listaImoveis);
      })
      .catch((e) => setErro(e instanceof ApiError ? 'Falha ao carregar visitas.' : 'Erro inesperado.'));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (erro) return <main><h1>Visitas</h1><p>{erro}</p></main>;
  if (!visitas) return <main><h1>Visitas</h1><p>Carregando...</p></main>;

  function enderecoDe(v: Visita) {
    const op = oportunidades.find((o) => o.id === v.oportunidadeId);
    return (op && imoveis.find((i) => i.id === op.imovelId)?.enderecoResumo) ?? '—';
  }

  const proximas = visitas.filter((v) => v.estado === 'AGENDADA' || v.estado === 'CONFIRMADA');
  const historico = visitas.filter((v) => v.estado === 'REALIZADA' || v.estado === 'CANCELADA');

  return (
    <main>
      <h1>Visitas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Todas as visitas (US-014/US-015) das oportunidades da sua unidade — agendar, confirmar e registrar
        resultado continua sendo feito dentro de cada oportunidade, no Kanban.
      </p>

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Próximas ({proximas.length})</h2>
      {proximas.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma visita agendada.</p>}
      <ul className="visit-list" style={{ maxWidth: 480 }}>
        {proximas.map((v) => (
          <li key={v.id}>
            <b>{new Date(v.dataHora).toLocaleString('pt-BR')}</b>
            <span>
              {enderecoDe(v)}
              <small>{ROTULOS_ESTADO[v.estado]}{v.precisaAlerta ? ' — sem confirmação, prazo de alerta atingido' : ''}</small>
            </span>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Histórico ({historico.length})</h2>
      {historico.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma visita concluída ou cancelada ainda.</p>}
      <ul className="visit-list" style={{ maxWidth: 480 }}>
        {historico.map((v) => (
          <li key={v.id}>
            <b>{new Date(v.dataHora).toLocaleDateString('pt-BR')}</b>
            <span>
              {enderecoDe(v)}
              <small>{ROTULOS_ESTADO[v.estado]}{v.resultado ? ` — ${v.resultado}` : ''}</small>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
