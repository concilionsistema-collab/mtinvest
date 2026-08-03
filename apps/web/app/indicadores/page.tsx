'use client';

import { useEffect, useState } from 'react';
import type { IndicadoresFunil, OportunidadeEstado, Unidade } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { cardStyle } from '../../lib/styles';

const ROTULOS_ESTAGIO: Record<OportunidadeEstado, string> = {
  QUALIFICACAO: 'Qualificação',
  VISITA_AGENDADA: 'Visita agendada',
  VISITA_CONFIRMADA: 'Visita confirmada',
  VISITA_REALIZADA: 'Visita realizada',
  PROPOSTA_ENVIADA: 'Proposta enviada',
  EM_CONTRAPROPOSTA: 'Em contraproposta',
  RESERVA: 'Reserva',
  DOCUMENTACAO_CONCLUIDA: 'Documentação concluída',
  FECHADA: 'Fechada',
  PERDIDA: 'Perdida',
};

const cardMetrica: typeof cardStyle = { ...cardStyle, textAlign: 'center', marginBottom: 0 };

/** Implementa US-024 (ART-014, EPIC-11 - Indicadores básicos) / RN-011 (ART-004). */
export default function IndicadoresPage() {
  const { sessao } = useAuth();
  const [nomeUnidade, setNomeUnidade] = useState<string | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresFunil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<Unidade[]>('/unidades')
      .then((unidades) => setNomeUnidade(unidades.find((u) => u.id === sessao.unidadeId)?.nomeFantasia ?? null))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.tenantId]);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    setSemPermissao(false);
    try {
      const resultado = await apiFetch<IndicadoresFunil>('/indicadores');
      setIndicadores(resultado);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSemPermissao(true);
      } else {
        setErro('Falha ao carregar indicadores.');
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.tenantId]);

  return (
    <main>
      <h1 style={{ fontSize: 'var(--text-xl)' }}>Indicadores{nomeUnidade ? ` — ${nomeUnidade}` : ''}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Implementa US-024 do backlog (ART-014). Sempre agregação — nunca mostra dado individual de
        lead ou pessoa (RN-011, ART-004). Só Gestor de unidade acessa, e só vê a própria unidade — a
        visão "consolidado" de RN-011 (perfil de gestor da matriz) não existe nesta fatia, ver
        `UsuarioPerfil`. O percentual de SLA é uma aproximação documentada, não uma verificação exata
        contra o prazo original da janela de exclusividade.
      </p>

      {semPermissao && (
        <p style={{ color: 'var(--color-danger)' }}>
          Apenas o perfil "Gestor de unidade" pode consultar indicadores ("Permissões", US-024).
        </p>
      )}
      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '1rem' }}>{erro}</p>}
      {carregando && !indicadores && <p style={{ color: 'var(--color-text-muted)', marginTop: '1rem' }}>Carregando...</p>}

      {indicadores && (
        <>
          <div
            style={{
              marginTop: '1.5rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.leadsDistribuidos}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Leads distribuídos</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.leadsEmAtendimento}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Em atendimento</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.leadsConvertidos}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Convertidos</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.leadsInativos}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Inativos</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.visitasRealizadas}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Visitas realizadas</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.propostasEnviadas}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Propostas enviadas</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{indicadores.fechamentos}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Fechamentos</div>
            </div>
            <div style={cardMetrica}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                {indicadores.slaPercentualAtendidoDentroDaJanela}%
              </div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>SLA (aproximado)</div>
            </div>
          </div>

          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)' }}>Funil de oportunidades por estágio</h2>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
              {(Object.keys(ROTULOS_ESTAGIO) as OportunidadeEstado[]).map((estado) => (
                <li key={estado} style={{ display: 'flex', justifyContent: 'space-between', ...cardStyle, marginBottom: '0.35rem' }}>
                  <span>{ROTULOS_ESTAGIO[estado]}</span>
                  <strong>{indicadores.oportunidadesPorEstagio[estado]}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
