'use client';

import { useEffect, useState } from 'react';
import type { Imovel, Oportunidade, Proposta } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const ROTULOS_STATUS: Record<Proposta['status'], string> = {
  ENVIADA: 'Enviada',
  ACEITA: 'Aceita',
  RECUSADA: 'Recusada',
};

export default function PropostasPage() {
  const { sessao } = useAuth();
  const [propostas, setPropostas] = useState<Proposta[] | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Proposta[]>('/propostas'),
      apiFetch<Oportunidade[]>('/oportunidades'),
      apiFetch<Imovel[]>('/imoveis'),
    ])
      .then(([listaPropostas, listaOportunidades, listaImoveis]) => {
        setPropostas(listaPropostas);
        setOportunidades(listaOportunidades);
        setImoveis(listaImoveis);
      })
      .catch((e) => (e instanceof ApiError && e.status === 403 ? setSemPermissao(true) : setErro('Falha ao carregar propostas.')));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (erro) return <main><h1>Propostas</h1><p>{erro}</p></main>;
  if (!propostas) return <main><h1>Propostas</h1><p>Carregando...</p></main>;

  function enderecoDaProposta(p: Proposta) {
    const op = oportunidades.find((o) => o.id === p.oportunidadeId);
    const imovel = op && imoveis.find((i) => i.id === op.imovelId);
    return imovel?.enderecoResumo ?? '—';
  }

  return (
    <main>
      <h1>Propostas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Todas as propostas e contrapropostas (US-016/US-017) das oportunidades da sua unidade, não só dentro
        de uma oportunidade específica.
      </p>
      {semPermissao && <p>Sem oportunidades visíveis nesta unidade ainda.</p>}

      {propostas.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma proposta registrada ainda.</p>}

      <ul className="deal-list" style={{ maxWidth: 640, marginTop: 16, listStyle: 'none', padding: 0 }}>
        {propostas.map((p) => (
          <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', margin: '8px 0', fontSize: 12 }}>
            <div>
              <b>{enderecoDaProposta(p)}</b>
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                {p.tipo === 'CONTRAPROPOSTA' ? 'Contraproposta' : 'Proposta inicial'} · {p.condicoes}
              </small>
            </div>
            <small>R$ {p.valor.toLocaleString('pt-BR')}</small>
            <em style={{ fontStyle: 'normal', padding: '4px 8px', borderRadius: 8, background: 'var(--surface2)' }}>
              {ROTULOS_STATUS[p.status]}
            </em>
          </li>
        ))}
      </ul>
    </main>
  );
}
