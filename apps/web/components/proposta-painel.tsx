'use client';

import { useEffect, useState } from 'react';
import type { OportunidadeEstado, Proposta, Reserva } from '@crm/shared';
import { apiFetch } from '../lib/api';
import { buttonSecondaryStyle, buttonStyle, inputStyle } from '../lib/styles';

interface Props {
  oportunidadeId: string;
  oportunidadeEstado: OportunidadeEstado;
  usuarioId: string | null;
  onMudou: () => void;
}

const smallInput = { ...inputStyle, padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)', width: 'auto' };
const smallButton = { ...buttonSecondaryStyle, padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)' };

/** Implementa US-016, US-017 e US-018 (ART-014, EPIC-06 - Proposta, contraproposta e reserva). */
export function PropostaPainel({ oportunidadeId, oportunidadeEstado, usuarioId, onMudou }: Props) {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [valor, setValor] = useState('');
  const [condicoes, setCondicoes] = useState('');
  const [aprovadorUsuarioId, setAprovadorUsuarioId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    try {
      const [listaPropostas, listaReservas] = await Promise.all([
        apiFetch<Proposta[]>(`/oportunidades/${oportunidadeId}/propostas`),
        apiFetch<Reserva[]>(`/oportunidades/${oportunidadeId}/reservas`),
      ]);
      setPropostas(listaPropostas);
      setReservas(listaReservas);
    } catch {
      setErro('Falha ao carregar propostas/reservas.');
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadeId]);

  const ultimaProposta = propostas[propostas.length - 1];
  const propostaAceita = propostas.find((p) => p.status === 'ACEITA');
  const reservaAtiva = reservas.find((r) => r.estado === 'ATIVA');

  async function registrarProposta() {
    if (!usuarioId || !valor || !condicoes) return;
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/oportunidades/${oportunidadeId}/propostas`, {
        method: 'POST',
        body: JSON.stringify({ valor: Number(valor), condicoes }),
      });
      setValor('');
      setCondicoes('');
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao registrar proposta.');
    } finally {
      setCarregando(false);
    }
  }

  async function registrarContraproposta() {
    if (!usuarioId || !valor || !condicoes) return;
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/oportunidades/${oportunidadeId}/propostas/contraproposta`, {
        method: 'POST',
        body: JSON.stringify({
          valor: Number(valor),
          condicoes,
          aprovadorUsuarioId: aprovadorUsuarioId || undefined,
        }),
      });
      setValor('');
      setCondicoes('');
      setAprovadorUsuarioId('');
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao registrar contraproposta — desconto pode exigir aprovador (CA-002, US-017).');
    } finally {
      setCarregando(false);
    }
  }

  async function aceitar(propostaId: string) {
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/propostas/${propostaId}/aceitar`, { method: 'POST' });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao aceitar proposta.');
    } finally {
      setCarregando(false);
    }
  }

  async function formalizarReserva() {
    if (!usuarioId || !propostaAceita) return;
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/oportunidades/${oportunidadeId}/reservas`, {
        method: 'POST',
        body: JSON.stringify({ propostaId: propostaAceita.id }),
      });
      await carregar();
      onMudou();
    } catch {
      setErro('Falha ao formalizar reserva — este imóvel já pode estar reservado (RN-307).');
    } finally {
      setCarregando(false);
    }
  }

  const podeRegistrarProposta = oportunidadeEstado === 'QUALIFICACAO' || oportunidadeEstado === 'VISITA_REALIZADA';
  const podeContrapropor = oportunidadeEstado === 'PROPOSTA_ENVIADA' || oportunidadeEstado === 'EM_CONTRAPROPOSTA';
  const podeFormalizarReserva = podeContrapropor && !!propostaAceita && !reservaAtiva;

  return (
    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--color-border)', fontSize: 'var(--text-xs)' }}>
      {ultimaProposta && (
        <div style={{ color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
          Última proposta ({ultimaProposta.tipo === 'INICIAL' ? 'inicial' : 'contraproposta'}): R${' '}
          {ultimaProposta.valor.toLocaleString('pt-BR')} — {ultimaProposta.status}
          {ultimaProposta.status === 'ENVIADA' && (
            <button type="button" disabled={carregando} onClick={() => aceitar(ultimaProposta.id)} style={{ ...smallButton, marginLeft: '0.4rem' }}>
              Aceitar
            </button>
          )}
        </div>
      )}

      {podeRegistrarProposta && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          <input aria-label="Valor (R$)" type="number" placeholder="Valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...smallInput, width: '6rem' }} />
          <input aria-label="Condições" placeholder="Condições" value={condicoes} onChange={(e) => setCondicoes(e.target.value)} style={{ ...smallInput, flex: '1 1 8rem' }} />
          <button type="button" disabled={carregando || !valor || !condicoes} onClick={registrarProposta} style={smallButton}>
            Registrar proposta (US-016)
          </button>
        </div>
      )}

      {podeContrapropor && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
          <input aria-label="Novo valor (R$)" type="number" placeholder="Novo valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...smallInput, width: '6.5rem' }} />
          <input aria-label="Condições" placeholder="Condições" value={condicoes} onChange={(e) => setCondicoes(e.target.value)} style={{ ...smallInput, flex: '1 1 7rem' }} />
          <input aria-label="ID do aprovador (se desconto alto)" placeholder="ID aprovador (se desconto alto)" value={aprovadorUsuarioId} onChange={(e) => setAprovadorUsuarioId(e.target.value)} style={{ ...smallInput, flex: '1 1 9rem' }} />
          <button type="button" disabled={carregando || !valor || !condicoes} onClick={registrarContraproposta} style={smallButton}>
            Contraproposta (US-017)
          </button>
        </div>
      )}

      {podeFormalizarReserva && (
        <button type="button" disabled={carregando} onClick={formalizarReserva} style={{ ...buttonStyle, marginTop: '0.4rem', padding: '0.3rem 0.6rem', fontSize: 'var(--text-xs)' }}>
          Formalizar reserva (US-018)
        </button>
      )}

      {reservaAtiva && (
        <div style={{ color: 'var(--color-accent)', marginTop: '0.3rem' }}>
          Reserva ativa até {new Date(reservaAtiva.expiraEm).toLocaleString('pt-BR')}
        </div>
      )}
      {reservas.some((r) => r.estado === 'EXPIRADA') && !reservaAtiva && (
        <div style={{ color: 'var(--color-danger)', marginTop: '0.3rem' }}>Reserva anterior expirou (CA-002, US-018).</div>
      )}

      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '0.25rem' }}>{erro}</p>}
    </div>
  );
}
