'use client';

import { useEffect, useState } from 'react';
import type { Visita, VisitaResultado } from '@crm/shared';
import { apiFetch } from '../lib/api';
import { buttonSecondaryStyle, inputStyle } from '../lib/styles';

const RESULTADOS: { valor: VisitaResultado; rotulo: string }[] = [
  { valor: 'INTERESSADO', rotulo: 'Interessado' },
  { valor: 'NAO_INTERESSADO', rotulo: 'Não interessado' },
  { valor: 'INTERESSADO_EM_OUTRO_IMOVEL', rotulo: 'Interessado em outro imóvel' },
  { valor: 'NAO_COMPARECEU', rotulo: 'Não compareceu' },
];

interface Props {
  oportunidadeId: string;
  usuarioId: string | null;
  onMudou: () => void;
}

/** Implementa US-014 e US-015 (ART-014, EPIC-05 - Agenda e visitas). */
export function VisitasPainel({ oportunidadeId, usuarioId, onMudou }: Props) {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [dataHora, setDataHora] = useState('');
  const [resultado, setResultado] = useState<VisitaResultado>('INTERESSADO');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    try {
      setVisitas(await apiFetch<Visita[]>(`/visitas?oportunidadeId=${oportunidadeId}`));
    } catch {
      setErro('Falha ao carregar visitas.');
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadeId]);

  const visitaAtiva = visitas.find((v) => v.estado === 'AGENDADA' || v.estado === 'CONFIRMADA');

  async function agendar() {
    if (!usuarioId || !dataHora) return;
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch('/visitas', {
        method: 'POST',
        body: JSON.stringify({ oportunidadeId, dataHora: new Date(dataHora).toISOString() }),
      });
      setDataHora('');
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao agendar visita.');
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar(visitaId: string) {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/visitas/${visitaId}/confirmar`, { method: 'POST' });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao confirmar visita.');
    } finally {
      setCarregando(false);
    }
  }

  async function cancelar(visitaId: string) {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/visitas/${visitaId}/cancelar`, { method: 'POST' });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao cancelar visita.');
    } finally {
      setCarregando(false);
    }
  }

  async function realizar(visitaId: string) {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/visitas/${visitaId}/realizar`, {
        method: 'POST',
        body: JSON.stringify({ resultado }),
      });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao registrar resultado da visita.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--color-border)', fontSize: 'var(--text-xs)' }}>
      {!visitaAtiva && (
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <input
            aria-label="Data e hora da visita"
            type="datetime-local"
            value={dataHora}
            onChange={(evento) => setDataHora(evento.target.value)}
            style={{ ...inputStyle, padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)', width: 'auto', flex: '1 1 auto' }}
          />
          <button type="button" disabled={carregando || !dataHora} onClick={agendar} style={{ ...buttonSecondaryStyle, padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' }}>
            Agendar visita
          </button>
        </div>
      )}

      {visitaAtiva && (
        <div>
          <div style={{ color: visitaAtiva.precisaAlerta ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            Visita {visitaAtiva.estado === 'AGENDADA' ? 'agendada' : 'confirmada'} para{' '}
            {new Date(visitaAtiva.dataHora).toLocaleString('pt-BR')}
            {visitaAtiva.precisaAlerta && ' — sem confirmação, prazo de alerta atingido (RN-303)'}
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            {visitaAtiva.estado === 'AGENDADA' && (
              <button type="button" disabled={carregando} onClick={() => confirmar(visitaAtiva.id)} style={{ ...buttonSecondaryStyle, padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' }}>
                Confirmar
              </button>
            )}
            {visitaAtiva.estado === 'CONFIRMADA' && (
              <>
                <select
                  aria-label="Resultado da visita"
                  value={resultado}
                  onChange={(evento) => setResultado(evento.target.value as VisitaResultado)}
                  style={{ ...inputStyle, padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)', width: 'auto' }}
                >
                  {RESULTADOS.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={carregando} onClick={() => realizar(visitaAtiva.id)} style={{ ...buttonSecondaryStyle, padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' }}>
                  Concluir (US-015)
                </button>
              </>
            )}
            <button type="button" disabled={carregando} onClick={() => cancelar(visitaAtiva.id)} style={{ ...buttonSecondaryStyle, padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '0.25rem' }}>{erro}</p>}
    </div>
  );
}
