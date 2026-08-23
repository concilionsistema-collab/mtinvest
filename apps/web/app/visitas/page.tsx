'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Imovel, Lead, Oportunidade, Pessoa, Usuario, Visita } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './visitas.module.css';

type Aba = 'agenda' | 'calendario' | 'mapa' | 'historico' | 'performance';
type Tom = 'primary' | 'secondary' | 'success' | 'warning' | 'danger';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'agenda', rotulo: 'Agenda' }, { id: 'calendario', rotulo: 'Calendário' },
  { id: 'mapa', rotulo: 'Mapa' }, { id: 'historico', rotulo: 'Histórico' },
  { id: 'performance', rotulo: 'Performance' },
];

const ESTADOS: Record<Visita['estado'], string> = {
  AGENDADA: 'Aguardando confirmação', CONFIRMADA: 'Confirmada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada',
};

const RESULTADOS: Record<NonNullable<Visita['resultado']>, string> = {
  INTERESSADO: 'Cliente interessado', NAO_INTERESSADO: 'Sem interesse',
  INTERESSADO_EM_OUTRO_IMOVEL: 'Interesse em outro imóvel', NAO_COMPARECEU: 'Não compareceu',
};

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function mesmoDia(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function mesmoMes(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function inicioDoDia(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function contagem(n: number) { return String(n).padStart(2, '0'); }
function moeda(n?: number | null) { return n == null ? 'Valor sob consulta' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n); }
function titulo(endereco: string) { return endereco.split(/[,—-]/)[0]?.trim() || 'Imóvel selecionado'; }
function tempoAte(iso: string) {
  const minutos = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutos < 0) return 'Horário já iniciado';
  if (minutos < 60) return `Faltam ${minutos} min`;
  return `Visita em ${Math.floor(minutos / 60)}h${minutos % 60 ? ` ${String(minutos % 60).padStart(2, '0')}min` : ''}`;
}

export default function VisitasPage() {
  const { sessao } = useAuth();
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [data, setData] = useState(() => new Date());
  const [aba, setAba] = useState<Aba>('agenda');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Visita[]>('/visitas'), apiFetch<Oportunidade[]>('/oportunidades'), apiFetch<Imovel[]>('/imoveis'),
      apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Pessoa[]>('/pessoas').catch(() => []),
      apiFetch<Usuario[]>('/usuarios').catch(() => []),
    ]).then(([v, o, i, l, p, u]) => {
      const ordenadas = [...v].sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
      setVisitas(ordenadas); setOportunidades(o); setImoveis(i); setLeads(l); setPessoas(p); setUsuarios(u);
      const hoje = new Date();
      if (!ordenadas.some((item) => mesmoDia(new Date(item.dataHora), hoje))) {
        const proxima = ordenadas.find((item) => ['AGENDADA', 'CONFIRMADA'].includes(item.estado) && new Date(item.dataHora).getTime() >= inicioDoDia(hoje));
        if (proxima) setData(new Date(proxima.dataHora));
      }
    }).catch((e) => setErro(e instanceof ApiError ? 'Não foi possível carregar a agenda de visitas.' : 'Ocorreu um erro inesperado.'));
  }, [sessao?.tenantId]);

  const doDia = useMemo(() => (visitas ?? []).filter((v) => mesmoDia(new Date(v.dataHora), data)), [visitas, data]);
  const ativas = useMemo(() => (visitas ?? []).filter((v) => ['AGENDADA', 'CONFIRMADA'].includes(v.estado)), [visitas]);
  const historico = useMemo(() => (visitas ?? []).filter((v) => ['REALIZADA', 'CANCELADA'].includes(v.estado)).reverse(), [visitas]);
  const realizadas = (visitas ?? []).filter((v) => v.estado === 'REALIZADA');
  const interessadas = realizadas.filter((v) => ['INTERESSADO', 'INTERESSADO_EM_OUTRO_IMOVEL'].includes(v.resultado ?? ''));
  const conversao = realizadas.length ? Math.round(interessadas.length / realizadas.length * 1000) / 10 : 0;
  const confirmadas = doDia.filter((v) => v.estado === 'CONFIRMADA').length;
  const aguardando = doDia.filter((v) => v.estado === 'AGENDADA').length;
  const canceladas = doDia.filter((v) => v.estado === 'CANCELADA').length;

  const calendario = useMemo(() => {
    const primeiro = new Date(data.getFullYear(), data.getMonth(), 1);
    const inicio = new Date(primeiro.getFullYear(), primeiro.getMonth(), 1 - primeiro.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + index));
  }, [data]);

  function contexto(v: Visita) {
    const oportunidade = oportunidades.find((o) => o.id === v.oportunidadeId);
    const imovel = oportunidade ? imoveis.find((i) => i.id === oportunidade.imovelId) : undefined;
    const lead = oportunidade ? leads.find((l) => l.id === oportunidade.leadId) : undefined;
    return {
      imovel, pessoa: lead ? pessoas.find((p) => p.id === lead.pessoaId) : undefined,
      corretor: lead?.responsavelUsuarioId ? usuarios.find((u) => u.id === lead.responsavelUsuarioId) : undefined,
    };
  }

  function moverData(dias: number) { setData((atual) => new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + dias)); }
  function moverMes(meses: number) { setData((atual) => new Date(atual.getFullYear(), atual.getMonth() + meses, 1)); }

  async function confirmar(id: string) {
    setConfirmando(id); setMensagem(null);
    try {
      await apiFetch(`/visitas/${id}/confirmar`, { method: 'POST' });
      setVisitas((lista) => lista?.map((v) => v.id === id ? { ...v, estado: 'CONFIRMADA' } : v) ?? null);
      setMensagem('Visita confirmada com sucesso.');
    } catch { setMensagem('Não foi possível confirmar esta visita.'); }
    finally { setConfirmando(null); }
  }

  function contato(telefone?: string | null, whatsapp = false) {
    if (!telefone) { setMensagem('Este cliente ainda não possui telefone cadastrado.'); return; }
    const numero = telefone.replace(/\D/g, '');
    window.open(whatsapp ? `https://wa.me/55${numero}` : `tel:${numero}`, '_blank', 'noopener,noreferrer');
  }

  if (!sessao) return null;
  if (erro) return <main className={styles.state}><Icon code="" /><h1>Agenda indisponível</h1><p>{erro}</p></main>;
  if (!visitas) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando sua agenda</h1><p>Carregando visitas, clientes e imóveis...</p></main>;

  let exibidas = doDia;
  if (aba === 'historico' || aba === 'performance') exibidas = historico;
  if (aba === 'mapa') exibidas = ativas;
  if (aba === 'calendario') exibidas = visitas.filter((v) => mesmoMes(new Date(v.dataHora), data));
  const rota = (doDia.length ? doDia : ativas).slice(0, 3);
  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '', valor: contagem(doDia.length), titulo: 'Visitas no dia', apoio: 'Agenda selecionada' },
    { tom: 'success', icone: '', valor: contagem(confirmadas), titulo: 'Confirmadas', apoio: `${doDia.length ? Math.round(confirmadas / doDia.length * 100) : 0}% do dia` },
    { tom: 'warning', icone: '', valor: contagem(aguardando), titulo: 'Aguardando', apoio: 'Confirmação do cliente' },
    { tom: 'danger', icone: '', valor: contagem(canceladas), titulo: 'Canceladas', apoio: `${doDia.length ? Math.round(canceladas / doDia.length * 100) : 0}% do dia` },
    { tom: 'secondary', icone: '', valor: `${conversao.toLocaleString('pt-BR')}%`, titulo: 'Conversão', apoio: 'Visita → interesse' },
  ];

  return <main className={styles.page}>
    {mensagem && <button className={styles.toast} type="button" onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.metrics} aria-label="Resumo das visitas">
      {metricas.map((m) => <article key={m.titulo} className={styles.metric} data-tone={m.tom}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}
    </section>

    <section className={styles.workspace}>
      <div className={styles.schedule}>
        <div className={styles.tabsBar}>
          <div className={styles.tabs} role="tablist">{ABAS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={aba === item.id} className={aba === item.id ? styles.activeTab : ''} onClick={() => setAba(item.id)}>{item.rotulo}</button>)}</div>
          <div className={styles.dateControls}><button className={styles.dateLabel} type="button" onClick={() => setData(new Date())}><Icon code="" />{data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}</button><button type="button" aria-label="Dia anterior" onClick={() => moverData(-1)}>‹</button><button type="button" aria-label="Próximo dia" onClick={() => moverData(1)}>›</button></div>
        </div>

        {aba === 'performance' && <div className={styles.performance}>{[
          ['Comparecimento', realizadas.length ? Math.round(realizadas.filter((v) => v.resultado !== 'NAO_COMPARECEU').length / realizadas.length * 100) : 0],
          ['Interesse pós-visita', conversao], ['Confirmações da agenda', doDia.length ? Math.round(confirmadas / doDia.length * 100) : 0],
        ].map(([rotulo, valor]) => <div key={String(rotulo)}><span>{rotulo}</span><strong>{valor}%</strong><i><b style={{ width: `${Math.min(Number(valor), 100)}%` }} /></i></div>)}</div>}

        <div className={styles.timeline}>{exibidas.length === 0 ? <div className={styles.empty}><span><Icon code="" /></span><h2>Nenhuma visita nesta visualização</h2><p>Escolha outra data ou abra uma negociação para agendar uma visita.</p><Link href="/oportunidades">Abrir negociações</Link></div> : exibidas.map((visita, index) => {
          const { imovel, pessoa, corretor } = contexto(visita);
          const quando = new Date(visita.dataHora);
          const endereco = imovel?.enderecoResumo ?? 'Endereço a confirmar';
          const tom: Tom = visita.estado === 'CONFIRMADA' ? 'success' : visita.estado === 'AGENDADA' ? 'warning' : visita.estado === 'REALIZADA' ? 'primary' : 'danger';
          return <article className={styles.timelineItem} data-tone={tom} key={visita.id}>
            <div className={styles.timeRail}><time>{quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><span /></div>
            <div className={styles.visitCard}>
              <div className={`${styles.photo} ${styles[`photo${index % 3 + 1}`]}`} role="img" aria-label={`Imagem de ${titulo(endereco)}`} />
              <div className={styles.visitMain}>
                <div className={styles.visitHeading}><div><h2>{titulo(endereco)}</h2><p>{endereco}</p></div><span className={styles.mobileStatus}>{ESTADOS[visita.estado]}</span></div>
                <div className={styles.details}><span><Icon code="" /><small>Cliente</small><b>{pessoa?.nome ?? 'Cliente não identificado'}</b></span><span><Icon code="" /><small>Corretor</small><b>{corretor?.nome ?? 'Equipe comercial'}</b></span><span><Icon code="" /><small>Valor</small><b>{moeda(imovel?.valorAnunciado)}</b></span></div>
                <div className={styles.actions}>{visita.estado === 'AGENDADA' && <button className={styles.confirmButton} type="button" disabled={confirmando === visita.id} onClick={() => confirmar(visita.id)}><Icon code="" />{confirmando === visita.id ? 'Confirmando...' : 'Confirmar'}</button>}<Link href="/imoveis"><Icon code="" />Ver imóvel</Link><button type="button" onClick={() => contato(pessoa?.telefoneNormalizado, true)}><Icon code="" />WhatsApp</button><button type="button" onClick={() => contato(pessoa?.telefoneNormalizado)}><Icon code="" />Ligar</button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noreferrer"><Icon code="" />Como chegar</a></div>
              </div>
              <aside className={styles.statusPanel}><span className={styles.status}>{ESTADOS[visita.estado]}</span><p><Icon code="" />{['AGENDADA', 'CONFIRMADA'].includes(visita.estado) ? tempoAte(visita.dataHora) : quando.toLocaleDateString('pt-BR')}</p>{visita.precisaAlerta && <small><Icon code="" />Confirmação pendente</small>}{visita.resultado && <small>{RESULTADOS[visita.resultado]}</small>}</aside>
            </div>
          </article>;
        })}</div>
      </div>

      <aside className={styles.side}>
        <section className={styles.sideCard}><header><div><h2>Calendário</h2><strong>{data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong></div><span><button type="button" aria-label="Mês anterior" onClick={() => moverMes(-1)}>‹</button><button type="button" aria-label="Próximo mês" onClick={() => moverMes(1)}>›</button></span></header><div className={styles.week}>{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <b key={`${d}-${i}`}>{d}</b>)}</div><div className={styles.days}>{calendario.map((dia) => <button key={dia.toISOString()} type="button" data-outside={!mesmoMes(dia, data)} data-selected={mesmoDia(dia, data)} data-event={visitas.some((v) => mesmoDia(new Date(v.dataHora), dia))} onClick={() => setData(dia)}>{dia.getDate()}</button>)}</div></section>
        <section className={styles.sideCard}><header><div><h2>Rota otimizada do dia</h2><small>{rota.length} parada(s) planejada(s)</small></div></header><div className={styles.route}><i />{rota.length === 0 ? <p>As próximas visitas aparecerão aqui.</p> : rota.map((v, index) => { const c = contexto(v); return <span key={v.id} className={styles[`stop${index + 1}`]}><b>{index + 1}</b><em>{titulo(c.imovel?.enderecoResumo ?? 'Imóvel')}<small>{new Date(v.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></em></span>; })}</div></section>
        <section className={styles.sideCard}><header><div><h2>Insights do dia</h2><small>Ações para melhorar sua agenda</small></div></header><div className={styles.insights}><article data-tone="success"><span><Icon code="" /></span><div><b>Melhor horário</b><p>Entre 09h e 11h, suas visitas têm melhor potencial de avanço.</p></div></article><article data-tone="warning"><span><Icon code="" /></span><div><b>Taxa de confirmação</b><p>Você está com {doDia.length ? Math.round(confirmadas / doDia.length * 100) : 0}% de confirmações nesta agenda.</p></div></article><article data-tone="primary"><span><Icon code="" /></span><div><b>Próxima ação sugerida</b><p>{aguardando ? `Envie lembrete para ${aguardando} visita(s) ainda não confirmada(s).` : 'Sua agenda selecionada está em dia.'}</p></div></article></div></section>
      </aside>
    </section>
  </main>;
}
