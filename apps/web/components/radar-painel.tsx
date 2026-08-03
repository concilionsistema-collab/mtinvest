'use client';

import { useState } from 'react';
import type { SugestaoImovel } from '@crm/shared';
import { apiFetch } from '../lib/api';
import { buttonSecondaryStyle, buttonStyle } from '../lib/styles';

interface Props {
  leadId: string;
  onCriarOportunidade: (imovelId: string) => void;
}

const smallButton = { padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' };

/** Implementa US-022 (ART-014, EPIC-09 - Busca e radar) / RN-316 (ART-009): nunca cria oportunidade sozinho. */
export function RadarPainel({ leadId, onCriarOportunidade }: Props) {
  const [aberto, setAberto] = useState(false);
  const [sugestoes, setSugestoes] = useState<SugestaoImovel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await apiFetch<SugestaoImovel[]>(`/leads/${leadId}/sugestoes-imoveis`);
      setSugestoes(resultado);
    } catch {
      setErro('Falha ao consultar o radar.');
    } finally {
      setCarregando(false);
    }
  }

  async function abrir() {
    const proximoEstado = !aberto;
    setAberto(proximoEstado);
    if (proximoEstado && sugestoes === null) {
      await carregar();
    }
  }

  async function decidir(imovelId: string, status: 'ACEITA' | 'RECUSADA') {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/leads/${leadId}/sugestoes-imoveis/${imovelId}/decidir`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await carregar();
    } catch {
      setErro('Falha ao registrar decisão.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button type="button" onClick={abrir} style={{ ...buttonSecondaryStyle, ...smallButton }}>
        {aberto ? 'Ocultar' : 'Ver'} sugestões do radar (US-022)
      </button>

      {aberto && (
        <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed var(--color-border)', fontSize: 'var(--text-xs)' }}>
          {carregando && !sugestoes && <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>}
          {sugestoes?.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum imóvel compatível encontrado agora.</p>
          )}
          {sugestoes?.map((sugestao) => (
            <div
              key={sugestao.imovel.id}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}
            >
              <span>
                {sugestao.imovel.enderecoResumo}
                {sugestao.imovel.valorAnunciado ? ` — R$ ${sugestao.imovel.valorAnunciado.toLocaleString('pt-BR')}` : ''}
              </span>
              {sugestao.decisao ? (
                <span style={{ color: 'var(--color-text-muted)' }}>({sugestao.decisao.toLowerCase()})</span>
              ) : (
                <>
                  <button type="button" disabled={carregando} onClick={() => decidir(sugestao.imovel.id, 'ACEITA')} style={{ ...buttonStyle, ...smallButton }}>
                    Aceitar
                  </button>
                  <button type="button" disabled={carregando} onClick={() => decidir(sugestao.imovel.id, 'RECUSADA')} style={{ ...buttonSecondaryStyle, ...smallButton }}>
                    Recusar
                  </button>
                </>
              )}
              {sugestao.decisao === 'ACEITA' && (
                <button
                  type="button"
                  onClick={() => onCriarOportunidade(sugestao.imovel.id)}
                  style={{ ...buttonStyle, ...smallButton }}
                >
                  Criar oportunidade
                </button>
              )}
            </div>
          ))}
          {erro && <p style={{ color: 'var(--color-danger)' }}>{erro}</p>}
        </div>
      )}
    </div>
  );
}
