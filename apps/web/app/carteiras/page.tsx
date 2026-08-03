'use client';

import { useEffect, useState } from 'react';
import type { TransferenciaDeCarteira, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { cardStyle, buttonStyle } from '../../lib/styles';

/**
 * Implementa US-010, CA-002 (ART-014, EPIC-03 - Leads) / RN-008/RN-009
 * (ART-004): fila de decisão do gestor para leads com oportunidade em
 * estágio avançado cujo responsável foi desligado (CA-001, transferência
 * automática, não passa por aqui).
 */
export default function CarteirasPage() {
  const { sessao } = useAuth();
  const [pendentes, setPendentes] = useState<TransferenciaDeCarteira[] | null>(null);
  const [candidatos, setCandidatos] = useState<Usuario[]>([]);
  const [destinoEscolhido, setDestinoEscolhido] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    setSemPermissao(false);
    try {
      const [transferencias, usuarios] = await Promise.all([
        apiFetch<TransferenciaDeCarteira[]>('/carteiras/transferencias'),
        apiFetch<Usuario[]>('/usuarios'),
      ]);
      setPendentes(transferencias);
      setCandidatos(usuarios.filter((u) => u.unidadeId === sessao?.unidadeId && u.status === 'ATIVO'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSemPermissao(true);
      } else {
        setErro('Falha ao carregar a fila de transferência de carteira.');
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.tenantId]);

  async function decidir(transferenciaId: string) {
    const destinoUsuarioId = destinoEscolhido[transferenciaId];
    if (!destinoUsuarioId) return;
    setErro(null);
    try {
      await apiFetch(`/carteiras/transferencias/${transferenciaId}/decidir`, {
        method: 'POST',
        body: JSON.stringify({ destinoUsuarioId }),
      });
      await carregar();
    } catch {
      setErro('Falha ao decidir o destino — confira se o usuário escolhido está ativo na sua unidade.');
    }
  }

  const listaPendente = pendentes?.filter((t) => t.estado === 'PENDENTE') ?? [];
  const listaEscalada = pendentes?.filter((t) => t.estado === 'ESCALADA_MATRIZ') ?? [];

  return (
    <main>
      <h1 style={{ fontSize: 'var(--text-xl)' }}>Fila de transferência de carteira</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Implementa US-010, CA-002 (ART-014). Leads com negociação em estágio avançado (RN-009: visita
        confirmada, proposta em análise ou reserva) não são transferidos automaticamente quando o
        responsável é desligado — ficam aqui até você escolher o destino, dentro do SLA de 5 dias
        (hipótese de trabalho, DEC-NEG-005 ainda pendente). Vencido o SLA, o item escala para a matriz
        e não pode mais ser decidido por aqui — esse perfil não existe nesta fatia.
      </p>

      {semPermissao && (
        <p style={{ color: 'var(--color-danger)' }}>
          Apenas o perfil "Gestor de unidade" acessa a fila de transferência de carteira (RN-008).
        </p>
      )}
      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '1rem' }}>{erro}</p>}
      {carregando && !pendentes && <p style={{ color: 'var(--color-text-muted)', marginTop: '1rem' }}>Carregando...</p>}

      {pendentes && (
        <>
          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)' }}>Aguardando sua decisão ({listaPendente.length})</h2>
            {listaPendente.length === 0 && (
              <p style={{ color: 'var(--color-text-muted)' }}>Nenhum item pendente no momento.</p>
            )}
            {listaPendente.map((t) => (
              <div key={t.id} style={cardStyle}>
                <div>
                  <strong>Lead {t.leadId}</strong>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t.motivo}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  SLA até {t.slaDecisaoFim ? new Date(t.slaDecisaoFim).toLocaleString('pt-BR') : '—'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <select
                    aria-label="Novo responsável"
                    value={destinoEscolhido[t.id] ?? ''}
                    onChange={(e) => setDestinoEscolhido((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    style={{ padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)' }}
                  >
                    <option value="">Escolha o novo responsável...</option>
                    {candidatos
                      .filter((c) => c.id !== t.origemUsuarioId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!destinoEscolhido[t.id]}
                    onClick={() => decidir(t.id)}
                    style={{ ...buttonStyle, padding: '0.4rem 0.8rem', fontSize: 'var(--text-sm)' }}
                  >
                    Transferir
                  </button>
                </div>
              </div>
            ))}
          </section>

          {listaEscalada.length > 0 && (
            <section style={{ marginTop: '1.5rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)' }}>Escalado para a matriz ({listaEscalada.length})</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                SLA vencido sem decisão. Ação indisponível aqui — requer o perfil "matriz", que não
                existe nesta fatia do sistema.
              </p>
              {listaEscalada.map((t) => (
                <div key={t.id} style={cardStyle}>
                  <strong>Lead {t.leadId}</strong>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t.motivo}</div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
