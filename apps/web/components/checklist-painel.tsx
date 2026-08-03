'use client';

import { useEffect, useState } from 'react';
import type { ChecklistDocumentoItem, ComissaoCruzadaAcionada, OportunidadeEstado } from '@crm/shared';
import { apiFetch } from '../lib/api';
import { buttonStyle } from '../lib/styles';

interface Props {
  oportunidadeId: string;
  oportunidadeEstado: OportunidadeEstado;
  usuarioId: string | null;
  onMudou: () => void;
}

const smallButton = { padding: '0.3rem 0.6rem', fontSize: 'var(--text-xs)' };

/** Implementa US-019 e US-020 (ART-014, EPIC-07 - Documentação e fechamento). */
export function ChecklistPainel({ oportunidadeId, oportunidadeEstado, usuarioId, onMudou }: Props) {
  const [itens, setItens] = useState<ChecklistDocumentoItem[]>([]);
  const [comissoes, setComissoes] = useState<ComissaoCruzadaAcionada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    try {
      const [listaItens, listaComissoes] = await Promise.all([
        apiFetch<ChecklistDocumentoItem[]>(`/oportunidades/${oportunidadeId}/checklist`),
        apiFetch<ComissaoCruzadaAcionada[]>(`/oportunidades/${oportunidadeId}/comissao-cruzada`),
      ]);
      setItens(listaItens);
      setComissoes(listaComissoes);
    } catch {
      setErro('Falha ao carregar checklist documental.');
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadeId]);

  async function alternarItem(item: ChecklistDocumentoItem) {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/oportunidades/${oportunidadeId}/checklist/${item.id}/concluir`, {
        method: 'POST',
        body: JSON.stringify({ concluido: !item.concluido }),
      });
      await carregar();
    } catch {
      setErro('Falha ao atualizar item do checklist.');
    } finally {
      setCarregando(false);
    }
  }

  async function fechar() {
    if (!usuarioId) return;
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/oportunidades/${oportunidadeId}/fechar`, { method: 'POST' });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao fechar oportunidade — confira se você é o responsável (US-020).');
    } finally {
      setCarregando(false);
    }
  }

  const pendentes = itens.filter((item) => item.obrigatorio && !item.concluido);
  const checklistCompleto = itens.length > 0 && pendentes.length === 0;

  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--color-border)', fontSize: 'var(--text-xs)' }}>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
        Checklist documental (US-019, RN-308) — {itens.length - pendentes.length}/{itens.length} concluídos
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {itens.map((item) => (
          <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              aria-label={item.descricao}
              checked={item.concluido}
              disabled={carregando}
              onChange={() => alternarItem(item)}
            />
            <span style={{ textDecoration: item.concluido ? 'line-through' : 'none' }}>{item.descricao}</span>
          </li>
        ))}
      </ul>

      {oportunidadeEstado === 'DOCUMENTACAO_CONCLUIDA' && (
        <button type="button" disabled={carregando} onClick={fechar} style={{ ...buttonStyle, ...smallButton, marginTop: '0.4rem' }}>
          Fechar oportunidade (US-020)
        </button>
      )}

      {oportunidadeEstado === 'RESERVA' && !checklistCompleto && (
        <div style={{ color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
          Faltam {pendentes.length} item(ns) obrigatório(s) para liberar "Documentação concluída" (CA-001, US-019).
        </div>
      )}

      {comissoes.length > 0 && (
        <div style={{ color: 'var(--color-accent)', marginTop: '0.3rem' }}>
          Comissão cruzada acionada (RN-309) — imóvel de outra unidade.
        </div>
      )}

      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '0.25rem' }}>{erro}</p>}
    </div>
  );
}
