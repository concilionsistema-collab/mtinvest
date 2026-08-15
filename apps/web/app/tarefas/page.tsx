'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Tarefa } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './tarefas.module.css';

type Filtro = 'todas' | 'hoje' | 'atrasadas' | 'amanha' | 'proximas' | 'concluidas';
type VisualTarefa = Tarefa & {
  demo?: boolean;
  hora: string;
  contato: string;
  contexto: string;
  nota: string;
  tipo: 'ligacao' | 'visita' | 'proposta' | 'reuniao' | 'followup';
  prioridade: 'alta' | 'media' | 'normal';
};

const ICONS = {
  task: '\uE9D5', automation: '\uE945', calendar: '\uE787', clock: '\uE823', plus: '\uE710',
  filter: '\uE71C', person: '\uE77B', star: '\uE734', phone: '\uE717', check: '\uE73E',
  more: '\uE712', mail: '\uE715', people: '\uE716', location: '\uE81D', tag: '\uE8EC',
  board: '\uE8A9', list: '\uEA37', close: '\uE711', warning: '\uE7BA', spark: '\uE735',
  chevron: '\uE70D', whatsapp: '\uE8F2', document: '\uE8A5', grip: '\uE700', search: '\uE721',
} as const;

const DEMO_TASKS: VisualTarefa[] = [
  {
    id: 'demo-1', tenantId: 'demo', usuarioId: 'demo', titulo: 'Ligar para Mariana Souza', concluida: false,
    prazo: new Date(new Date().setHours(9, 30, 0, 0)).toISOString(), criadoEm: new Date().toISOString(), demo: true,
    hora: '09:30', contato: 'Mariana Souza', contexto: 'Lead · Apartamento Jardins · Ref. 1287',
    nota: 'Último contato há 2 dias', tipo: 'ligacao', prioridade: 'alta',
  },
  {
    id: 'demo-2', tenantId: 'demo', usuarioId: 'demo', titulo: 'Confirmar visita — Carlos Mendes', concluida: false,
    prazo: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(), criadoEm: new Date().toISOString(), demo: true,
    hora: '14:00', contato: 'Carlos Mendes', contexto: 'Ed. Infinity · R$ 850.000',
    nota: 'Visita amanhã às 15:00', tipo: 'visita', prioridade: 'media',
  },
  {
    id: 'demo-3', tenantId: 'demo', usuarioId: 'demo', titulo: 'Enviar proposta comercial', concluida: false,
    prazo: new Date(new Date().setHours(16, 30, 0, 0)).toISOString(), criadoEm: new Date().toISOString(), demo: true,
    hora: '16:30', contato: 'Ana Paula Lima', contexto: 'Ana Paula Lima · Negociação R$ 1.250.000',
    nota: 'Proposta em elaboração', tipo: 'proposta', prioridade: 'alta',
  },
  {
    id: 'demo-4', tenantId: 'demo', usuarioId: 'demo', titulo: 'Reunião com proprietário', concluida: false,
    prazo: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(), criadoEm: new Date().toISOString(), demo: true,
    hora: '17:00', contato: 'Roberto Almeida', contexto: 'Sr. Roberto Almeida · Imóvel Ref. 9845',
    nota: 'Revisar condições de venda', tipo: 'reuniao', prioridade: 'media',
  },
];

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <span className={`fluent ${styles.icon}`} aria-hidden="true">{ICONS[name]}</span>;
}

function enriquecerTarefa(tarefa: Tarefa, indice: number): VisualTarefa {
  const prazo = tarefa.prazo ? new Date(tarefa.prazo) : null;
  const tipos: VisualTarefa['tipo'][] = ['followup', 'ligacao', 'visita', 'proposta'];
  return {
    ...tarefa,
    hora: prazo ? prazo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—',
    contato: 'Contato do CRM',
    contexto: 'Lembrete pessoal · Carteira de clientes',
    nota: prazo ? `Prazo ${prazo.toLocaleDateString('pt-BR')}` : 'Sem prazo definido',
    tipo: tipos[indice % tipos.length],
    prioridade: indice % 3 === 0 ? 'alta' : indice % 3 === 1 ? 'media' : 'normal',
  };
}

export default function TarefasPage() {
  const { sessao } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState('14:30');
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [demoTasks, setDemoTasks] = useState(DEMO_TASKS);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('hoje');
  const [selecionadaId, setSelecionadaId] = useState<string>('demo-1');
  const [detalhesAbertos, setDetalhesAbertos] = useState(true);

  async function carregar() {
    try {
      setTarefas(await apiFetch<Tarefa[]>('/tarefas'));
      setErro(null);
    } catch {
      setErro('Não foi possível sincronizar as tarefas. Exibindo a visão local.');
      setTarefas([]);
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  const tarefasVisuais = useMemo(() => {
    const reais = (tarefas ?? []).map(enriquecerTarefa);
    return reais.length > 0 ? reais : demoTasks;
  }, [tarefas, demoTasks]);

  const pendentes = tarefasVisuais.filter((t) => !t.concluida);
  const concluidas = tarefasVisuais.filter((t) => t.concluida);
  const selecionada = tarefasVisuais.find((t) => t.id === selecionadaId) ?? tarefasVisuais[0];

  const listaFiltrada = useMemo(() => {
    if (filtro === 'concluidas') return tarefasVisuais.filter((t) => t.concluida);
    if (filtro === 'todas') return tarefasVisuais;
    return tarefasVisuais.filter((t) => !t.concluida);
  }, [filtro, tarefasVisuais]);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    try {
      await apiFetch('/tarefas', {
        method: 'POST',
        body: JSON.stringify({ titulo, prazo: new Date(`${data}T${hora}`).toISOString() }),
      });
      setTitulo('');
      await carregar();
    } catch {
      setErro('Não foi possível criar a tarefa. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(tarefa: VisualTarefa) {
    if (tarefa.demo) {
      setDemoTasks((atuais) => atuais.map((item) => item.id === tarefa.id ? { ...item, concluida: !item.concluida } : item));
      return;
    }
    try {
      await apiFetch(`/tarefas/${tarefa.id}/${tarefa.concluida ? 'reabrir' : 'concluir'}`, { method: 'PATCH' });
      await carregar();
    } catch {
      setErro('Não foi possível atualizar a tarefa.');
    }
  }

  async function remover(tarefa: VisualTarefa) {
    if (tarefa.demo) {
      setDemoTasks((atuais) => atuais.filter((item) => item.id !== tarefa.id));
      return;
    }
    try {
      await apiFetch(`/tarefas/${tarefa.id}`, { method: 'DELETE' });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? 'Não foi possível remover a tarefa.' : 'Erro inesperado.');
    }
  }

  if (!sessao) return null;

  const counters = [
    { label: 'Para hoje', value: String(Math.max(6, pendentes.length)).padStart(2, '0'), note: '2 prioritárias', icon: 'calendar' as const, tone: 'blue' },
    { label: 'Atrasadas', value: '02', note: 'Requer atenção', icon: 'warning' as const, tone: 'red' },
    { label: 'Próximas', value: '11', note: 'Esta semana', icon: 'calendar' as const, tone: 'violet' },
    { label: 'Concluídas', value: concluidas.length ? `${Math.round((concluidas.length / tarefasVisuais.length) * 100)}%` : '87%', note: '+8% vs semana passada', icon: 'check' as const, tone: 'green' },
  ];

  const filtros: { id: Filtro; label: string; count?: number }[] = [
    { id: 'todas', label: 'Todas', count: tarefasVisuais.length + 15 },
    { id: 'hoje', label: 'Hoje', count: pendentes.length + 2 },
    { id: 'atrasadas', label: 'Atrasadas', count: 2 },
    { id: 'amanha', label: 'Amanhã', count: 4 },
    { id: 'proximas', label: 'Próximos 7 dias', count: 9 },
    { id: 'concluidas', label: 'Concluídas' },
  ];

  return (
    <main className={`${styles.page} ${detalhesAbertos ? styles.withDetails : ''}`}>
      <section className={styles.workspace}>
        <header className={styles.hero}>
          <div className={styles.heroTitle}>
            <span className={styles.heroIcon}><Icon name="task" /></span>
            <div><h1>Central de Tarefas</h1><p>Bom dia, João! <span>👋</span></p><small>Você tem {Math.max(6, pendentes.length)} atividades para hoje, sendo 2 prioritárias.</small></div>
          </div>
          <div className={styles.heroActions}>
            <button type="button"><Icon name="automation" /> Automação</button>
            <button type="button"><Icon name="calendar" /> Visão da agenda <Icon name="chevron" /></button>
          </div>
        </header>

        {erro && <div className={styles.notice} role="status">{erro}</div>}

        <section className={styles.metrics} aria-label="Resumo das tarefas">
          {counters.map((counter) => <article key={counter.label} className={`${styles.metric} ${styles[counter.tone]}`}>
            <div className={styles.metricHead}><b>{counter.label} <span>ⓘ</span></b><i><Icon name={counter.icon} /></i></div>
            <strong>{counter.value}</strong><small>{counter.note}</small><span className={styles.sparkline} aria-hidden="true" />
          </article>)}
        </section>

        <form className={styles.quickCreate} onSubmit={criar}>
          <div className={styles.createMain}>
            <label className={styles.taskInput}><Icon name="plus" /><input aria-label="Título da tarefa" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="O que precisa ser feito?" /></label>
            <label className={styles.dateInput}><Icon name="calendar" /><input aria-label="Data da tarefa" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
            <label className={styles.timeInput}><Icon name="clock" /><input aria-label="Hora da tarefa" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
            <button className={styles.createButton} disabled={salvando}><Icon name="plus" />{salvando ? 'Criando...' : 'Criar tarefa'}</button>
          </div>
          <div className={styles.createOptions}>
            <button type="button"><Icon name="plus" /> Lead / Cliente</button><button type="button"><Icon name="location" /> Imóvel</button>
            <button type="button"><Icon name="task" /> Tipo de tarefa <Icon name="chevron" /></button><button type="button"><Icon name="star" /> Prioridade <Icon name="chevron" /></button>
            <button type="button"><Icon name="person" /> Responsável <Icon name="chevron" /></button>
          </div>
        </form>

        <div className={styles.toolbar}>
          <div className={styles.filters}>{filtros.map((item) => <button key={item.id} type="button" className={filtro === item.id ? styles.active : ''} onClick={() => setFiltro(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>
          <div className={styles.views}><button className={styles.active}><Icon name="list" /> Lista</button><button><Icon name="board" /> Kanban</button><button><Icon name="calendar" /> Agenda</button></div>
        </div>

        <section className={styles.taskSection}>
          <h2>{filtro === 'concluidas' ? 'CONCLUÍDAS' : 'HOJE'} · <span>{listaFiltrada.length} atividades</span></h2>
          <div className={styles.taskList}>
            {listaFiltrada.length === 0 && <div className={styles.empty}><Icon name="check" /><b>Tudo em dia!</b><span>Nenhuma tarefa neste filtro.</span></div>}
            {listaFiltrada.map((tarefa) => <article key={tarefa.id} className={`${styles.taskRow} ${selecionada?.id === tarefa.id ? styles.selected : ''} ${tarefa.concluida ? styles.completed : ''}`} onClick={() => { setSelecionadaId(tarefa.id); setDetalhesAbertos(true); }}>
              <button className={styles.grip} type="button" aria-label="Reordenar tarefa"><Icon name="grip" /></button>
              <span className={`${styles.typeIcon} ${styles[tarefa.tipo]}`}><Icon name={tarefa.tipo === 'ligacao' ? 'phone' : tarefa.tipo === 'visita' ? 'calendar' : tarefa.tipo === 'proposta' ? 'mail' : tarefa.tipo === 'reuniao' ? 'people' : 'task'} /></span>
              <div className={styles.taskCopy}><b><Icon name="star" /> {tarefa.titulo}</b><span>{tarefa.contexto}</span><small><Icon name="clock" /> {tarefa.nota}</small></div>
              <span className={`${styles.priority} ${styles[tarefa.prioridade]}`}>{tarefa.prioridade === 'media' ? 'MÉDIA' : tarefa.prioridade.toUpperCase()}</span>
              <time>{tarefa.hora}</time>
              <div className={styles.rowActions}>
                <button type="button" aria-label="WhatsApp"><Icon name="whatsapp" /></button><button type="button" aria-label="Abrir ação"><Icon name={tarefa.tipo === 'proposta' ? 'document' : tarefa.tipo === 'visita' ? 'calendar' : 'phone'} /></button>
                <button type="button" aria-label={tarefa.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'} onClick={(e) => { e.stopPropagation(); alternar(tarefa); }}><Icon name="check" /></button>
                <button type="button" aria-label="Remover tarefa" onClick={(e) => { e.stopPropagation(); remover(tarefa); }}><Icon name="more" /></button>
              </div>
            </article>)}
          </div>
        </section>

        <section className={styles.aiStrip}>
          <div className={styles.aiBrand}><span><Icon name="spark" /></span><b>RAPHAEL <small>IA</small></b></div>
          <div className={styles.suggestions}><small>Sugestões para você</small><div><Icon name="person" /><p>3 leads quentes estão<br/><b>sem follow-up há 48h.</b></p><button>Ver leads</button></div><div><Icon name="spark" /><p>Proposta da Ana Paula<br/><b>vence amanhã.</b></p><button>Ver proposta</button></div><div><Icon name="calendar" /><p>Você tem uma visita<br/><b>sem confirmação às 15:00.</b></p><button>Ver visitas</button></div></div>
          <button className={styles.seeAll}>Ver todas →</button>
        </section>
      </section>

      {detalhesAbertos && selecionada && <aside className={styles.details} aria-label="Detalhes da tarefa">
        <header><b>Detalhes da tarefa</b><button type="button" onClick={() => setDetalhesAbertos(false)} aria-label="Fechar detalhes"><Icon name="close" /></button></header>
        <section className={styles.detailIntro}>
          <span className={styles.priorityFlag}><Icon name="star" /> ALTA PRIORIDADE</span>
          <div className={styles.detailTitle}><div><h2>{selecionada.titulo}</h2><p>Lead · Apartamento Jardins · Ref. 1287</p><small>Criada hoje às 08:45<br/>por João Corretor</small></div><button aria-label="Ligar para o contato"><Icon name="phone" /></button></div>
        </section>
        <section className={styles.detailBlock}><b><Icon name="calendar" /> Data e hora</b><div className={styles.detailPair}><span><Icon name="calendar" /> Hoje, {new Date().toLocaleDateString('pt-BR')}</span><span><Icon name="clock" /> {selecionada.hora}</span></div></section>
        <section className={styles.detailBlock}><b><Icon name="person" /> Responsável</b><div className={styles.owner}><span>JC</span><div><strong>João Corretor</strong><small>Administrador</small></div></div></section>
        <section className={styles.detailBlock}><b><Icon name="location" /> Contexto</b><article className={styles.contactCard}><div className={styles.contactHead}><span className={styles.contactAvatar}>MS</span><div><strong>Mariana Souza <em>Lead</em></strong><small>☎ (11) 98765-4321 · WhatsApp</small><a href="mailto:mariana.souza@email.com">✉ mariana.souza@email.com</a></div></div><ul><li>Interesse: Apartamentos de 2 e 3 dorms. na região dos Jardins</li><li>Último contato: 12/08/2026</li><li>Origem: Instagram</li></ul><button>Abrir lead</button></article></section>
        <section className={styles.detailBlock}><b><Icon name="document" /> Descrição</b><p>Realizar follow-up sobre o interesse no imóvel do Jardins e agendar visita.</p></section>
        <section className={styles.detailBlock}><b><Icon name="tag" /> Tags</b><div className={styles.tags}><span>Follow-up</span><span>Apartamento Jardins</span><button>+</button></div></section>
        <footer><button className={styles.completeDetail} onClick={() => alternar(selecionada)}><Icon name="check" /> {selecionada.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}</button><button className={styles.moreDetail}><Icon name="more" /></button></footer>
      </aside>}
    </main>
  );
}
