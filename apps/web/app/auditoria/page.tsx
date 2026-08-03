'use client';

import { useEffect, useState } from 'react';
import type { RegistroDeAuditoria, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { cardStyle } from '../../lib/styles';

/** Implementa a trilha de auditoria (ART-005, RegistroDeAuditoria) referenciada em várias US do backlog. */
export default function AuditoriaPage() {
  const { sessao } = useAuth();
  const [registros, setRegistros] = useState<RegistroDeAuditoria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    setCarregando(true);
    setErro(null);
    setSemPermissao(false);
    Promise.all([apiFetch<RegistroDeAuditoria[]>('/auditoria'), apiFetch<Usuario[]>('/usuarios')])
      .then(([listaRegistros, listaUsuarios]) => {
        setRegistros(listaRegistros);
        setUsuarios(listaUsuarios);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          setSemPermissao(true);
        } else {
          setErro('Falha ao carregar a trilha de auditoria.');
        }
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.tenantId]);

  function nomeDoAtor(id: string | null) {
    if (id === null) return 'Sistema';
    return usuarios.find((u) => u.id === id)?.nome ?? id;
  }

  return (
    <main>
      <h1 style={{ fontSize: 'var(--text-xl)' }}>Auditoria</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Trilha de auditoria (`RegistroDeAuditoria`, ART-005) — append-only, nunca editada ou
        excluída. Cobre toda mudança manual de estágio do funil (Kanban, propostas, visitas,
        reservas, checklist) e as varreduras automáticas agendadas (reabertura de lead por SLA,
        inatividade, expiração de reserva, escalonamento de carteira) — estas últimas aparecem como
        <strong> Sistema</strong>, sem usuário humano por trás (`atorUsuarioId` nulo). Restrito a
        Gestor de unidade.
      </p>

      {semPermissao && (
        <p style={{ color: 'var(--color-danger)' }}>
          Apenas o perfil "Gestor de unidade" pode consultar a trilha de auditoria.
        </p>
      )}
      {erro && <p style={{ color: 'var(--color-danger)', marginTop: '1rem' }}>{erro}</p>}
      {carregando && <p style={{ color: 'var(--color-text-muted)', marginTop: '1rem' }}>Carregando...</p>}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
        {registros.map((registro) => (
          <li key={registro.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>{registro.acao}</strong>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                {new Date(registro.criadoEm).toLocaleString('pt-BR')}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', marginTop: '0.25rem' }}>
              {nomeDoAtor(registro.atorUsuarioId)} · {registro.entidadeTipo} #{registro.entidadeId.slice(0, 8)}
              {registro.motivo && <> · {registro.motivo}</>}
            </div>
          </li>
        ))}
        {!carregando && registros.length === 0 && !semPermissao && (
          <p style={{ color: 'var(--color-text-muted)' }}>Nenhum registro de auditoria ainda.</p>
        )}
      </ul>
    </main>
  );
}
