'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Imovel, IndicadoresFunil, Lead, Oportunidade, Proposta, Usuario, Visita } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './relatorios.module.css';

type Serie = { nome: string; valores: number[]; cor: string; total: number };
type Tom = 'primary' | 'secondary' | 'success' | 'warning';
const NOMES: Record<string, string> = { whatsapp: 'WhatsApp', portal: 'Portal imobiliário', site: 'Site', indicacao: 'Indicação', captacao_ativa: 'Captação ativa', redes_sociais: 'Redes sociais', campanha: 'Campanha' };

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function nomeCanal(chave: string) { return NOMES[chave.toLowerCase()] ?? chave.replaceAll('_', ' ').replace(/(^|\s)\p{L}/gu, (l) => l.toLocaleUpperCase('pt-BR')); }
function moeda(valor: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor); }
function acumulado(datas: string[]) {
  const agora = new Date(); const ano = agora.getFullYear(); const mes = agora.getMonth(); const contagens = Array.from({ length: 31 }, () => 0);
  for (const iso of datas) { const d = new Date(iso); if (d.getFullYear() === ano && d.getMonth() === mes) contagens[Math.min(30, d.getDate() - 1)] += 1; }
  let soma = 0; return contagens.map((v) => (soma += v));
}

function PerformanceChart({ series }: { series: Serie[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const elemento = canvas.current; if (!elemento) return;
    const desenhar = () => {
      const largura = elemento.clientWidth; const altura = elemento.clientHeight; const escala = window.devicePixelRatio || 1;
      elemento.width = largura * escala; elemento.height = altura * escala; const ctx = elemento.getContext('2d'); if (!ctx) return; ctx.scale(escala, escala); ctx.clearRect(0, 0, largura, altura);
      const css = getComputedStyle(document.documentElement); const grade = css.getPropertyValue('--border').trim() || '#243248'; const texto = css.getPropertyValue('--text-secondary').trim() || '#8a96aa';
      const margem = { x: 34, y: 20, baixo: 28, direita: 12 }; const w = largura - margem.x - margem.direita; const h = altura - margem.y - margem.baixo; const max = Math.max(5, ...series.flatMap((s) => s.valores));
      ctx.strokeStyle = grade; ctx.lineWidth = 1; ctx.fillStyle = texto; ctx.font = '9px sans-serif';
      for (let i = 0; i <= 4; i += 1) { const y = margem.y + h * i / 4; ctx.beginPath(); ctx.moveTo(margem.x, y); ctx.lineTo(largura - margem.direita, y); ctx.stroke(); ctx.fillText(String(Math.round(max * (1 - i / 4))), 3, y + 3); }
      ['01', '07', '14', '21', '28', '31'].forEach((d, i) => ctx.fillText(`${d} ${new Date().toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`, margem.x + w * i / 5 - 8, altura - 7));
      series.forEach((s) => { ctx.strokeStyle = s.cor; ctx.lineWidth = 2.2; ctx.beginPath(); s.valores.forEach((v, i) => { const x = margem.x + w * i / 30; const y = margem.y + h - v / max * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); });
    };
    desenhar(); const observador = new ResizeObserver(desenhar); observador.observe(elemento); return () => observador.disconnect();
  }, [series]);
  return <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Evolução mensal dos principais indicadores" />;
}

export default function RelatoriosPage() {
  const { sessao } = useAuth();
  const [indicadores, setIndicadores] = useState<IndicadoresFunil | null>(null); const [leads, setLeads] = useState<Lead[]>([]); const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]); const [propostas, setPropostas] = useState<Proposta[]>([]); const [imoveis, setImoveis] = useState<Imovel[]>([]); const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [erro, setErro] = useState<string | null>(null); const [semPermissao, setSemPermissao] = useState(false); const [mensagem, setMensagem] = useState<string | null>(null); const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([apiFetch<IndicadoresFunil>('/indicadores'), apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Oportunidade[]>('/oportunidades').catch(() => []), apiFetch<Visita[]>('/visitas').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []), apiFetch<Imovel[]>('/imoveis').catch(() => []), apiFetch<Usuario[]>('/usuarios').catch(() => [])])
      .then(([i, l, o, v, p, im, u]) => { setIndicadores(i); setLeads(l); setOportunidades(o); setVisitas(v); setPropostas(p); setImoveis(im); setUsuarios(u); })
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setSemPermissao(true); else if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar os relatórios.'); else setErro('Não foi possível carregar os relatórios da sua unidade.'); });
  }, [sessao?.tenantId]);
  useEffect(() => { const hash = () => { if (window.location.hash === '#novo-relatorio') setModal(true); }; hash(); window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash); }, []);

  const canais = useMemo(() => {
    if (!indicadores) return [];
    const total = Math.max(1, Object.values(indicadores.leadsPorCanal).reduce((s, v) => s + v, 0));
    return Object.entries(indicadores.leadsPorCanal).sort(([, a], [, b]) => b - a).map(([chave, quantidade]) => ({ chave, nome: nomeCanal(chave), quantidade, percentual: Math.round(quantidade / total * 1000) / 10 }));
  }, [indicadores]);
  const series = useMemo<Serie[]>(() => [
    { nome: 'Leads gerados', valores: acumulado(leads.map((l) => l.criadoEm)), total: leads.length, cor: '#237bff' },
    { nome: 'Visitas realizadas', valores: acumulado(visitas.filter((v) => v.estado === 'REALIZADA').map((v) => v.dataHora)), total: visitas.filter((v) => v.estado === 'REALIZADA').length, cor: '#7b46df' },
    { nome: 'Propostas', valores: acumulado(propostas.map((p) => p.criadoEm)), total: propostas.length, cor: '#20bac1' },
    { nome: 'Vendas', valores: acumulado(oportunidades.filter((o) => o.estado === 'FECHADA').map((o) => o.criadoEm)), total: oportunidades.filter((o) => o.estado === 'FECHADA').length, cor: '#f59a08' },
  ], [leads, visitas, propostas, oportunidades]);

  if (!sessao) return null;
  if (semPermissao) return <main className={styles.state}><Icon code={'\uE72E'} /><h1>Acesso restrito</h1><p>Apenas o perfil Gestor de unidade pode consultar os relatórios consolidados.</p></main>;
  if (erro) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Relatórios indisponíveis</h1><p>{erro}</p></main>;
  if (!indicadores) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando relatórios</h1><p>Carregando indicadores e análises...</p></main>;

  const totalLeads = canais.reduce((s, c) => s + c.quantidade, 0); const qualificados = indicadores.leadsDistribuidos + indicadores.leadsEmAtendimento + indicadores.leadsConvertidos;
  const funil = [
    { rotulo: 'Leads gerados', valor: totalLeads, tom: 'primary' }, { rotulo: 'Qualificados', valor: qualificados, tom: 'secondary' },
    { rotulo: 'Visitas realizadas', valor: indicadores.visitasRealizadas, tom: 'success' }, { rotulo: 'Propostas enviadas', valor: indicadores.propostasEnviadas, tom: 'warning' },
    { rotulo: 'Vendas fechadas', valor: indicadores.fechamentos, tom: 'cyan' },
  ];
  const taxa = totalLeads ? Math.round(indicadores.fechamentos / totalLeads * 1000) / 10 : 0;
  const relatorios = [
    { href: '/indicadores', titulo: 'Indicadores', descricao: 'Funil de oportunidades, leads por estado, visitas, propostas e SLA.', icone: '\uE9D2', tom: 'primary' as Tom, itens: 'Indicadores', qtd: 4 },
    { href: '/funil', titulo: 'Funil de Vendas', descricao: 'Visualização do funil com conversões, perdas e previsões.', icone: '\uE9D9', tom: 'secondary' as Tom, itens: 'Etapas', qtd: 7 },
    { href: '/marketing', titulo: 'Marketing', descricao: 'Leads por canal, campanhas, conversão e desempenho.', icone: '\uE789', tom: 'success' as Tom, itens: 'Canais', qtd: canais.length },
    { href: '/financeiro', titulo: 'Financeiro', descricao: 'VGV realizado, comissões, recebimentos e inadimplência.', icone: '\uE8C7', tom: 'warning' as Tom, itens: 'Métricas', qtd: 2 },
  ];
  const autor = usuarios.find((u) => u.id === sessao.usuarioId)?.nome ?? 'Equipe de gestão';
  const insights = [
    `${totalLeads} leads gerados nos canais cadastrados.`,
    canais[0] ? `${canais[0].nome} é o principal canal, com ${canais[0].percentual.toLocaleString('pt-BR')}% dos leads.` : 'Nenhum canal de origem registrado.',
    `Taxa geral de conversão em vendas: ${taxa.toLocaleString('pt-BR')}%.`,
    `${indicadores.propostasEnviadas} proposta(s) e ${indicadores.fechamentos} fechamento(s) registrados.`,
  ];
  function fecharModal() { setModal(false); window.history.replaceState(null, '', window.location.pathname); }

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.available} id="relatorios-disponiveis"><header><div><h1>Relatórios disponíveis</h1><p>Cada relatório é um hub com múltiplos indicadores e análises detalhadas.</p></div><button type="button" onClick={() => setModal(true)}><Icon code={'\uE713'} /> Gerenciar relatórios</button></header><div className={styles.reportCards}>{relatorios.map((r) => <article data-tone={r.tom} key={r.href}><div className={styles.reportIntro}><span><Icon code={r.icone} /></span><div><h2>{r.titulo}</h2><p>{r.descricao}</p></div></div><div className={styles.reportMeta}><span><Icon code={'\uE8A5'} /> <b>{r.qtd}</b> {r.itens}</span><em>Atualizado</em><small>dados em tempo real</small></div><Link href={r.href}>Acessar relatório →</Link></article>)}</div></section>
    <section className={styles.overviewTitle}><div><h2>Visão geral dos principais indicadores</h2><p>Resumo dos dados mais importantes do seu negócio.</p></div><div><span><Icon code={'\uE787'} /> Este mês⌄</span><button type="button" onClick={() => setMensagem('A comparação histórica requer snapshots mensais, ainda não armazenados pelo sistema.')}>Comparar período →</button></div></section>
    <section className={styles.dashboardGrid}>
      <section className={`${styles.panel} ${styles.performance}`}><header><h2>Performance geral</h2><small>Este mês⌄</small></header><div className={styles.legend}>{series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}</div><PerformanceChart series={series} /><div className={styles.summary}>{series.map((s) => <article key={s.nome}><strong>{s.total}</strong><small>{s.nome}</small><b>dados atuais</b></article>)}</div></section>
      <section className={`${styles.panel} ${styles.channelPanel}`}><header><div><h2>Leads por canal</h2><p>Total: {totalLeads} leads</p></div></header><div className={styles.channelWrap}><div className={styles.donut} style={{ '--p1': `${(canais[0]?.percentual ?? 0) * 3.6}deg`, '--p2': `${((canais[0]?.percentual ?? 0) + (canais[1]?.percentual ?? 0)) * 3.6}deg`, '--p3': `${((canais[0]?.percentual ?? 0) + (canais[1]?.percentual ?? 0) + (canais[2]?.percentual ?? 0)) * 3.6}deg` } as CSSProperties}><strong>{totalLeads}</strong><small>Leads</small></div><ul>{canais.slice(0, 5).map((c, i) => <li key={c.chave}><i data-index={i} /><span>{c.nome}<small>{c.quantidade} ({c.percentual.toLocaleString('pt-BR')}%)</small></span></li>)}</ul></div><Link href="/marketing">Ver detalhes completos →</Link></section>
      <section className={`${styles.panel} ${styles.funnelPanel}`}><header><h2>Conversão por etapa</h2><small>Este mês⌄</small></header><div className={styles.funnel}>{funil.map((f, i) => <article key={f.rotulo}><i data-tone={f.tom} style={{ width: `${145 - i * 20}px` }} /><span>{f.rotulo}</span><b>{f.valor}</b><small>{totalLeads ? Math.round(f.valor / totalLeads * 1000) / 10 : 0}%</small></article>)}</div><p>Taxa geral de conversão: <b>{taxa.toLocaleString('pt-BR')}%</b></p><Link href="/funil">Ver funil completo →</Link></section>
      <section className={`${styles.panel} ${styles.recent}`}><header><h2>Relatórios acessados recentemente</h2><small>Disponíveis agora</small></header><div className={styles.recentHead}><span>Relatório</span><span>Descrição</span><span>Atualização</span><span>Responsável</span><span>Ações</span></div>{relatorios.map((r) => <article data-tone={r.tom} key={r.href}><span><Icon code={r.icone} /></span><b>{r.titulo} - Visão Geral</b><p>{r.descricao}</p><small>Tempo real</small><em>{autor}</em><Link href={r.href} aria-label={`Abrir ${r.titulo}`}><Icon code={'\uE890'} /></Link></article>)}<Link href="#relatorios-disponiveis">Ver todos os relatórios →</Link></section>
      <aside className={`${styles.panel} ${styles.insights}`}><header><h2><Icon code={'\uE9D2'} /> Insights do período</h2><small>Dados atuais</small></header>{insights.map((texto, i) => <article key={texto} data-index={i}><span><Icon code={i === 0 ? '\uE9D2' : i === 1 ? '\uE789' : i === 2 ? '\uE81C' : '\uE7BA'} /></span><p>{texto}</p></article>)}<button type="button" onClick={() => setMensagem('Todos os insights exibidos foram calculados com os dados atuais da unidade.')}>Ver todos os insights →</button></aside>
    </section>
    {modal && <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) fecharModal(); }}><section className={styles.modal} role="dialog" aria-modal="true"><header><div><h2>Novo relatório</h2><p>Central de relatórios do sistema</p></div><button type="button" onClick={fecharModal}>×</button></header><div><Icon code={'\uE9D2'} /><h3>Relatórios conectados aos módulos</h3><p>Os relatórios disponíveis são gerados automaticamente por Indicadores, Funil, Marketing e Financeiro. A criação de modelos personalizados exigirá um construtor de métricas no backend.</p><button type="button" onClick={fecharModal}>Entendi</button></div></section></div>}
  </main>;
}
