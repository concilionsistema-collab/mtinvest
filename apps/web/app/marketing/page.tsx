'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Imovel, IndicadoresFunil, Lead, Oportunidade, Proposta } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './marketing.module.css';

type Aba = 'visao' | 'canais' | 'campanhas' | 'leads' | 'conversoes' | 'fluxos' | 'performance';
type Visualizacao = 'lista' | 'graficos' | 'funil';
type Tom = 'primary' | 'secondary' | 'success' | 'warning';
type Canal = { chave: string; nome: string; quantidade: number; percentual: number; convertidos: number; taxa: number; receita: number };

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão geral' }, { id: 'canais', rotulo: 'Canais' }, { id: 'campanhas', rotulo: 'Campanhas' },
  { id: 'leads', rotulo: 'Leads' }, { id: 'conversoes', rotulo: 'Conversões' }, { id: 'fluxos', rotulo: 'Fluxos' }, { id: 'performance', rotulo: 'Performance' },
];
const NOMES: Record<string, string> = { whatsapp: 'WhatsApp', portal: 'Portal imobiliário', site: 'Site', indicacao: 'Indicação', captacao_ativa: 'Captação ativa', redes_sociais: 'Redes sociais', campanha: 'Campanha', instagram: 'Instagram', facebook: 'Facebook' };
const CORES = ['primary', 'secondary', 'success', 'warning'] as const;

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (compacto && valor >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function nomeCanal(chave: string) { return NOMES[chave.toLowerCase()] ?? chave.replaceAll('_', ' ').replace(/(^|\s)\p{L}/gu, (l) => l.toLocaleUpperCase('pt-BR')); }
function iconeCanal(chave: string) { const c = chave.toLowerCase(); return c.includes('whatsapp') ? '\uE8BD' : c.includes('site') || c.includes('portal') ? '\uE774' : c.includes('indica') ? '\uE716' : '\uE789'; }

export default function MarketingPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null); const [leads, setLeads] = useState<Lead[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]); const [propostas, setPropostas] = useState<Proposta[]>([]); const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [aba, setAba] = useState<Aba>('visao'); const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista');
  const [erro, setErro] = useState<string | null>(null); const [semPermissao, setSemPermissao] = useState(false); const [mensagem, setMensagem] = useState<string | null>(null); const [modalCampanha, setModalCampanha] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([apiFetch<IndicadoresFunil>('/indicadores'), apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Oportunidade[]>('/oportunidades').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []), apiFetch<Imovel[]>('/imoveis').catch(() => [])])
      .then(([d, l, o, p, i]) => { setDados(d); setLeads(l); setOportunidades(o); setPropostas(p); setImoveis(i); })
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setSemPermissao(true); else if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar o Marketing.'); else setErro('Não foi possível carregar os dados de Marketing.'); });
  }, [sessao?.tenantId]);
  useEffect(() => { const hash = () => { if (window.location.hash === '#nova-campanha') setModalCampanha(true); }; hash(); window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash); }, []);

  const canais = useMemo<Canal[]>(() => {
    if (!dados) return [];
    const total = Math.max(1, Object.values(dados.leadsPorCanal).reduce((s, v) => s + v, 0));
    return Object.entries(dados.leadsPorCanal).map(([chave, quantidade]) => {
      const leadsCanal = leads.filter((l) => l.origemCanal.toLowerCase() === chave.toLowerCase()); const ids = new Set(leadsCanal.map((l) => l.id));
      const oportunidadesCanal = oportunidades.filter((o) => ids.has(o.leadId)); const fechadas = oportunidadesCanal.filter((o) => o.estado === 'FECHADA');
      const receita = fechadas.reduce((s, o) => { const p = propostas.filter((item) => item.oportunidadeId === o.id).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0]; return s + (p?.valor ?? imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0); }, 0);
      const convertidos = leadsCanal.filter((l) => l.estado === 'CONVERTIDO').length;
      return { chave, nome: nomeCanal(chave), quantidade, percentual: Math.round(quantidade / total * 1000) / 10, convertidos, taxa: quantidade ? Math.round(convertidos / quantidade * 1000) / 10 : 0, receita };
    }).sort((a, b) => b.quantidade - a.quantidade);
  }, [dados, leads, oportunidades, propostas, imoveis]);

  if (!sessao) return null;
  if (semPermissao) return <main className={styles.state}><Icon code={'\uE72E'} /><h1>Acesso restrito</h1><p>Apenas o perfil Gestor de unidade pode consultar os indicadores de Marketing.</p></main>;
  if (erro) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Marketing indisponível</h1><p>{erro}</p></main>;
  if (!dados) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando Marketing</h1><p>Carregando canais, leads e conversões...</p></main>;

  const totalLeads = canais.reduce((s, c) => s + c.quantidade, 0); const totalConvertidos = canais.reduce((s, c) => s + c.convertidos, 0); const receita = canais.reduce((s, c) => s + c.receita, 0);
  const conversao = totalLeads ? Math.round(totalConvertidos / totalLeads * 1000) / 10 : 0;
  const funil = [
    { rotulo: 'Leads gerados', valor: totalLeads, tom: 'primary' },
    { rotulo: 'Contato realizado', valor: dados.leadsDistribuidos + dados.leadsEmAtendimento + dados.leadsConvertidos, tom: 'secondary' },
    { rotulo: 'Visita realizada', valor: dados.visitasRealizadas, tom: 'success' },
    { rotulo: 'Proposta enviada', valor: dados.propostasEnviadas, tom: 'warning' },
    { rotulo: 'Negociação', valor: (dados.oportunidadesPorEstagio.EM_CONTRAPROPOSTA ?? 0) + (dados.oportunidadesPorEstagio.RESERVA ?? 0), tom: 'danger' },
    { rotulo: 'Fechado', valor: dados.fechamentos, tom: 'cyan' },
  ];
  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '\uE716', valor: String(totalLeads), titulo: 'Leads gerados', apoio: `${canais.length} canal(is) de origem` },
    { tom: 'secondary', icone: '\uE789', valor: '—', titulo: 'Custo por lead', apoio: 'investimento não cadastrado' },
    { tom: 'success', icone: '\uE9D2', valor: `${conversao.toLocaleString('pt-BR')}%`, titulo: 'Taxa de conversão', apoio: `${totalConvertidos} lead(s) convertido(s)` },
    { tom: 'warning', icone: '\uE8C7', valor: moeda(receita || dados.vgvFechado, true), titulo: 'Receita atribuída', apoio: `${dados.fechamentos} fechamento(s)` },
    { tom: 'success', icone: '\uE9D9', valor: '—', titulo: 'Retorno sobre investimento', apoio: 'aguardando custos de campanha' },
  ];

  function exportar() {
    const linhas = [['Canal', 'Leads', 'Conversões', 'Taxa', 'Receita'], ...canais.map((c) => [c.nome, c.quantidade, c.convertidos, `${c.taxa}%`, c.receita])];
    const blob = new Blob([linhas.map((l) => l.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'marketing-canais.csv'; a.click(); URL.revokeObjectURL(url); setMensagem('Relatório de canais exportado.');
  }
  function fecharModal() { setModalCampanha(false); window.history.replaceState(null, '', window.location.pathname); }

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.metrics}>{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
        <div className={styles.toolbar} id="marketing-filtros"><div className={styles.tabs}>{ABAS.map((item) => <button type="button" className={aba === item.id ? styles.active : ''} onClick={() => setAba(item.id)} key={item.id}>{item.rotulo}</button>)}</div><div className={styles.views}>{(['lista', 'graficos', 'funil'] as Visualizacao[]).map((item) => <button type="button" className={visualizacao === item ? styles.activeView : ''} onClick={() => setVisualizacao(item)} key={item}><Icon code={item === 'lista' ? '\uE8FD' : item === 'graficos' ? '\uE9D2' : '\uE9D9'} />{item === 'graficos' ? 'Gráficos' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
        {visualizacao === 'lista' && <section className={styles.channels} id="marketing-canais"><header><div><h1>{aba === 'campanhas' ? 'Desempenho por campanha de origem' : aba === 'leads' ? 'Aquisição de leads por canal' : 'Desempenho por canal de origem'} <Icon code={'\uE946'} /></h1><p>Dados reais agregados a partir da origem dos leads e das oportunidades vinculadas.</p></div><div><span><Icon code={'\uE787'} /> Período atual⌄</span><button type="button" onClick={exportar}><Icon code={'\uE896'} /> Exportar</button></div></header><div className={styles.channelBars}>{canais.map((c, index) => <article key={c.chave}><span data-tone={CORES[index % CORES.length]}><Icon code={iconeCanal(c.chave)} /></span><div><b>{c.nome}</b><i><em style={{ width: `${c.percentual}%` }} data-tone={CORES[index % CORES.length]} /></i></div><strong>{c.quantidade}<small>LEADS</small></strong><strong>{c.percentual.toLocaleString('pt-BR')}%<small>PERCENTUAL</small></strong><strong>—<small>CUSTO POR LEAD</small></strong></article>)}</div><h2>Leads por canal</h2><div className={styles.tableHeader}><span>Canal</span><span>Leads</span><span>Conversões</span><span>Taxa de conversão</span><span>Custo por lead</span><span>Receita atribuída</span><span>Ações</span></div><div className={styles.channelTable}>{canais.map((c, index) => <article key={c.chave}><section><span data-tone={CORES[index % CORES.length]}><Icon code={iconeCanal(c.chave)} /></span><div><b>{c.nome}</b><small>{c.chave}</small></div></section><b>{c.quantidade}</b><b>{c.convertidos}</b><section className={styles.conversion}><b>{c.taxa.toLocaleString('pt-BR')}%</b><i><em style={{ width: `${c.taxa}%` }} /></i></section><b>—</b><b>{moeda(c.receita)}</b><section className={styles.actions}><button type="button" onClick={() => setMensagem(`${c.nome}: ${c.quantidade} leads e ${c.convertidos} conversões.`)}>Ver detalhes</button><button type="button">⋮</button></section></article>)}</div><footer>Mostrando 1 a {canais.length} de {canais.length} canais <label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option></select></label></footer></section>}
        {visualizacao === 'graficos' && <section className={styles.charts}><header><h2>Comparativo de canais</h2><p>Volume, conversão e receita atribuída.</p></header><div>{canais.map((c, index) => <article key={c.chave}><b>{c.nome}</b><span>Leads: {c.quantidade}</span><i><em data-tone={CORES[index % CORES.length]} style={{ height: `${Math.max(8, c.percentual * 2.5)}px` }} /></i><small>{c.percentual.toLocaleString('pt-BR')}%</small></article>)}</div></section>}
        {visualizacao === 'funil' && <section className={styles.mainFunnel}><header><h2>Funil de conversão</h2><p>Jornada agregada desde a entrada do lead até o fechamento.</p></header>{funil.map((f, index) => <article key={f.rotulo}><span data-tone={f.tom} style={{ width: `${100 - index * 10}%` }}>{f.rotulo}<b>{f.valor}</b></span></article>)}</section>}
      </div>
      <aside className={styles.side}>
        <section className={styles.sideCard}><header><h2>Distribuição de leads</h2><small>{canais.length} canais</small></header><div className={styles.distribution}><div className={styles.donut} style={{ '--p1': `${canais[0]?.percentual ? canais[0].percentual * 3.6 : 0}deg`, '--p2': `${canais[1]?.percentual ? (canais[0].percentual + canais[1].percentual) * 3.6 : 360}deg` } as CSSProperties}><strong>{totalLeads}</strong><small>Total</small></div><ul>{canais.slice(0, 4).map((c, i) => <li key={c.chave}><i data-tone={CORES[i % CORES.length]} /><span>{c.nome}<small>{c.quantidade} ({c.percentual.toLocaleString('pt-BR')}%)</small></span></li>)}</ul></div><a href="/relatorios">Ver relatório completo →</a></section>
        <section className={styles.sideCard}><header><h2>Top canais</h2><small>Este mês⌄</small></header><div className={styles.campaigns}>{canais.slice(0, 3).map((c, i) => <article key={c.chave}><span data-tone={CORES[i % CORES.length]}><Icon code={iconeCanal(c.chave)} /></span><div><b>{c.nome}</b><small>{c.quantidade} leads · {c.taxa.toLocaleString('pt-BR')}% conversão</small></div><strong>{c.convertidos}</strong></article>)}</div><button type="button" onClick={() => setAba('canais')}>Ver todos os canais →</button></section>
        <section className={styles.sideCard}><header><h2>Funil de conversão</h2><small>Este mês⌄</small></header><div className={styles.funnel}>{funil.map((f, index) => <article key={f.rotulo}><i data-tone={f.tom} style={{ width: `${78 - index * 9}px` }} /><span>{f.rotulo}</span><b>{f.valor}</b></article>)}</div></section>
      </aside>
    </section>
    {modalCampanha && <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) fecharModal(); }}><section className={styles.modal} role="dialog" aria-modal="true"><header><div><h2>Nova campanha</h2><p>Estrutura comercial do Marketing</p></div><button type="button" onClick={fecharModal}>×</button></header><div><Icon code={'\uE789'} /><h3>Cadastro de campanhas em preparação</h3><p>O sistema já mede as origens reais dos leads. Para cadastrar campanhas com investimento, orçamento e ROI, o backend precisa receber o módulo financeiro de campanhas.</p><button type="button" onClick={fecharModal}>Entendi</button></div></section></div>}
  </main>;
}
