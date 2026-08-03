'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Tarefa } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { buttonStyle, cardStyle, inputStyle } from '../../lib/styles';

export default function TarefasPage() {
  const { sessao } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [prazo, setPrazo] = useState('');
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      setTarefas(await apiFetch<Tarefa[]>('/tarefas'));
    } catch {
      setErro('Falha ao listar tarefas.');
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    try {
      await apiFetch('/tarefas', {
        method: 'POST',
        body: JSON.stringify({ titulo, prazo: prazo ? new Date(prazo).toISOString() : null }),
      });
      setTitulo('');
      setPrazo('');
      await carregar();
    } catch {
      setErro('Falha ao criar tarefa.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(t: Tarefa) {
    try {
      await apiFetch(`/tarefas/${t.id}/${t.concluida ? 'reabrir' : 'concluir'}`, { method: 'PATCH' });
      await carregar();
    } catch {
      setErro('Falha ao atualizar tarefa.');
    }
  }

  async function remover(id: string) {
    try {
      await apiFetch(`/tarefas/${id}`, { method: 'DELETE' });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? 'Falha ao remover tarefa.' : 'Erro inesperado.');
    }
  }

  if (!sessao) return null;
  if (erro) return <main><h1>Tarefas</h1><p>{erro}</p></main>;
  if (!tarefas) return <main><h1>Tarefas</h1><p>Carregando...</p></main>;

  const pendentes = tarefas.filter((t) => !t.concluida);
  const concluidas = tarefas.filter((t) => t.concluida);

  return (
    <main>
      <h1>Tarefas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Lembretes pessoais de follow-up — não vinculados a leads ou oportunidades.
      </p>

      <form onSubmit={criar} style={{ display: 'flex', gap: 12, margin: '24px 0', flexWrap: 'wrap' }}>
        <input
          aria-label="Título da tarefa"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          placeholder="Ex.: Ligar para o lead João"
        />
        <input
          aria-label="Prazo (opcional)"
          type="datetime-local"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          style={inputStyle}
        />
        <button style={buttonStyle} disabled={salvando}>{salvando ? 'Salvando...' : 'Adicionar tarefa'}</button>
      </form>

      <h2 style={{ fontSize: 14 }}>Pendentes ({pendentes.length})</h2>
      {pendentes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma tarefa pendente.</p>}
      {pendentes.map((t) => (
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} key={t.id}>
          <div>
            <b>{t.titulo}</b>
            {t.prazo && <small style={{ display: 'block', color: 'var(--muted)' }}>{new Date(t.prazo).toLocaleString('pt-BR')}</small>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={buttonStyle} onClick={() => alternar(t)}>Concluir</button>
            <button style={buttonStyle} onClick={() => remover(t.id)}>Remover</button>
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Concluídas ({concluidas.length})</h2>
      {concluidas.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma tarefa concluída ainda.</p>}
      {concluidas.map((t) => (
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6 }} key={t.id}>
          <div>
            <b style={{ textDecoration: 'line-through' }}>{t.titulo}</b>
            {t.prazo && <small style={{ display: 'block', color: 'var(--muted)' }}>{new Date(t.prazo).toLocaleString('pt-BR')}</small>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={buttonStyle} onClick={() => alternar(t)}>Reabrir</button>
            <button style={buttonStyle} onClick={() => remover(t.id)}>Remover</button>
          </div>
        </div>
      ))}
    </main>
  );
}
