'use client';

import { useEffect, useState } from 'react';
import type { ChecklistDocumentoItem, Imovel, Oportunidade } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const ESTAGIOS_PIPELINE = ['RESERVA', 'DOCUMENTACAO_CONCLUIDA', 'FECHADA'] as const;
const ROTULOS_ESTAGIO: Record<string, string> = {
  RESERVA: 'Reserva formalizada',
  DOCUMENTACAO_CONCLUIDA: 'Documentação concluída',
  FECHADA: 'Fechada',
};

export default function ContratosPage() {
  const { sessao } = useAuth();
  const [oportunidades, setOportunidades] = useState<Oportunidade[] | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [checklistPorOportunidade, setChecklistPorOportunidade] = useState<Record<string, ChecklistDocumentoItem[]>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([apiFetch<Oportunidade[]>('/oportunidades'), apiFetch<Imovel[]>('/imoveis')])
      .then(async ([listaOportunidades, listaImoveis]) => {
        setImoveis(listaImoveis);
        const pipeline = listaOportunidades.filter((o) => (ESTAGIOS_PIPELINE as readonly string[]).includes(o.estado));
        setOportunidades(pipeline);
        const entradas = await Promise.all(
          pipeline.map((o) =>
            apiFetch<ChecklistDocumentoItem[]>(`/oportunidades/${o.id}/checklist`)
              .then((itens) => [o.id, itens] as const)
              .catch(() => [o.id, []] as const),
          ),
        );
        setChecklistPorOportunidade(Object.fromEntries(entradas));
      })
      .catch((e) => setErro(e instanceof ApiError ? 'Falha ao carregar contratos.' : 'Erro inesperado.'));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (erro) return <main><h1>Contratos</h1><p>{erro}</p></main>;
  if (!oportunidades) return <main><h1>Contratos</h1><p>Carregando...</p></main>;

  function enderecoDe(o: Oportunidade) {
    return imoveis.find((i) => i.id === o.imovelId)?.enderecoResumo ?? '—';
  }

  return (
    <main>
      <h1>Contratos</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Pipeline de fechamento: oportunidades em reserva, documentação concluída ou já fechadas (US-018 a
        US-020), com o status do checklist documental (US-019).
      </p>

      {oportunidades.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma oportunidade nessa etapa ainda.</p>}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16, maxWidth: 640 }}>
        {oportunidades.map((o) => {
          const itens = checklistPorOportunidade[o.id] ?? [];
          const obrigatorios = itens.filter((i) => i.obrigatorio);
          const concluidos = obrigatorios.filter((i) => i.concluido).length;
          return (
            <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, margin: '10px 0', fontSize: 12 }}>
              <div>
                <b>{enderecoDe(o)}</b>
                <small style={{ display: 'block', color: 'var(--muted)' }}>{ROTULOS_ESTAGIO[o.estado] ?? o.estado}</small>
              </div>
              <small style={{ color: 'var(--muted)' }}>
                {obrigatorios.length > 0 ? `Checklist: ${concluidos}/${obrigatorios.length}` : '—'}
              </small>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
