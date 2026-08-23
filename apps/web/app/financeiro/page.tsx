'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Imovel, IndicadoresFunil, Lead, Oportunidade, Proposta, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './financeiro.module.css';

type Aba = 'geral' | 'vgv' | 'comissoes' | 'recebimentos' | 'despesas' | 'repasse' | 'corretores';
type Tom = 'primary' | 'success' | 'secondary' | 'warning' | 'cyan';
type Serie = { dia: number; valor: number };

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'geral', rotulo: 'Visão geral' }, { id: 'vgv', rotulo: 'VGV' }, { id: 'comissoes', rotulo: 'Comissões' },
  { id: 'recebimentos', rotulo: 'Recebimentos' }, { id: 'despesas', rotulo: 'Despesas' }, { id: 'repasse', rotulo: 'Repasse' }, { id: 'corretores', rotulo: 'Corretores' },
];

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (compacto && valor >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function valorOportunidade(o: Oportunidade, propostas: Proposta[], imoveis: Imovel[]) {
  const proposta = propostas.filter((p) => p.oportunidadeId === o.id).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
  return proposta?.valor ?? imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0;
}
function serieMes(oportunidades: Oportunidade[], imoveis: Imovel[]): Serie[] {
  const agora = new Date(); const dias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate(); const porDia = Array.from({ length: dias }, () => 0);
  oportunidades.filter((o) => o.estado === 'FECHADA').forEach((o) => { const d = new Date(o.criadoEm); if (d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()) porDia[d.getDate() - 1] += imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0; });
  let total = 0; return porDia.map((valor, indice) => ({ dia: indice + 1, valor: (total += valor) }));
}

function VgvChart({ serie }: { serie: Serie[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const elemento = canvas.current; if (!elemento) return;
    const desenhar = () => {
      const largura = elemento.clientWidth; const altura = elemento.clientHeight; const escala = window.devicePixelRatio || 1; elemento.width = largura * escala; elemento.height = altura * escala;
      const ctx = elemento.getContext('2d'); if (!ctx) return; ctx.scale(escala, escala); ctx.clearRect(0, 0, largura, altura);
      const css = getComputedStyle(document.documentElement); const primaria = css.getPropertyValue('--primary').trim() || '#237bff'; const borda = css.getPropertyValue('--border').trim() || '#243248'; const texto = css.getPropertyValue('--text-secondary').trim() || '#8a96aa';
      const m = { e: 42, d: 11, t: 16, b: 28 }; const w = largura - m.e - m.d; const h = altura - m.t - m.b; const max = Math.max(1, ...serie.map((p) => p.valor));
      ctx.font = '9px sans-serif'; ctx.fillStyle = texto; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) { const y = m.t + h * i / 4; ctx.strokeStyle = borda; ctx.beginPath(); ctx.moveTo(m.e, y); ctx.lineTo(largura - m.d, y); ctx.stroke(); const valor = max * (1 - i / 4); ctx.fillText(valor >= 1_000_000 ? `${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `${Math.round(valor / 1_000)} mil`, 0, y + 3); }
      const x = (i: number) => m.e + w * i / Math.max(1, serie.length - 1); const y = (v: number) => m.t + h - v / max * h;
      const grad = ctx.createLinearGradient(0, m.t, 0, altura - m.b); grad.addColorStop(0, 'rgba(35,123,255,.38)'); grad.addColorStop(1, 'rgba(35,123,255,0)'); ctx.beginPath(); serie.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.valor)) : ctx.moveTo(x(i), y(p.valor))); ctx.lineTo(x(serie.length - 1), altura - m.b); ctx.lineTo(m.e, altura - m.b); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); serie.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.valor)) : ctx.moveTo(x(i), y(p.valor))); ctx.strokeStyle = primaria; ctx.lineWidth = 2.2; ctx.stroke();
      [0, 6, 13, 20, 27, serie.length - 1].filter((i, pos, a) => i >= 0 && i < serie.length && a.indexOf(i) === pos).forEach((i) => { ctx.fillStyle = texto; ctx.fillText(String(i + 1).padStart(2, '0'), x(i) - 5, altura - 7); });
    };
    desenhar(); const observador = new ResizeObserver(desenhar); observador.observe(elemento); return () => observador.disconnect();
  }, [serie]);
  return <canvas ref={canvas} className={styles.canvas} role="img" aria-label="Evolução do VGV fechado no mês atual" />;
}

export default function FinanceiroPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null); const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]); const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]); const [leads, setLeads] = useState<Lead[]>([]); const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [aba, setAba] = useState<Aba>('geral'); const [semPermissao, setSemPermissao] = useState(false); const [erro, setErro] = useState<string | null>(null); const [mensagem, setMensagem] = useState<string | null>(null); const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([apiFetch<IndicadoresFunil>('/indicadores'), apiFetch<Oportunidade[]>('/oportunidades').catch(() => []), apiFetch<Imovel[]>('/imoveis').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []), apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Usuario[]>('/usuarios').catch(() => [])])
      .then(([d, o, i, p, l, u]) => { setDados(d); setOportunidades(o); setImoveis(i); setPropostas(p); setLeads(l); setUsuarios(u); })
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setSemPermissao(true); else if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar o Financeiro.'); else setErro('Não foi possível carregar os dados financeiros da unidade.'); });
  }, [sessao?.tenantId]);
  useEffect(() => { const hash = () => { if (window.location.hash === '#registrar-recebimento') setModal(true); }; hash(); window.addEventListener('hashchange', hash); return () => window.removeEventListener('hashchange', hash); }, []);

  const consolidado = useMemo(() => {
    const grupos = [
      { nome: 'Fechados', estados: ['FECHADA'], tom: 'primary' as Tom },
      { nome: 'Em negociação', estados: ['QUALIFICACAO', 'VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA', 'EM_CONTRAPROPOSTA', 'DOCUMENTACAO_CONCLUIDA'], tom: 'success' as Tom },
      { nome: 'Proposta enviada', estados: ['PROPOSTA_ENVIADA'], tom: 'secondary' as Tom },
      { nome: 'Reserva', estados: ['RESERVA'], tom: 'warning' as Tom },
    ];
    return grupos.map((g) => ({ ...g, valor: oportunidades.filter((o) => g.estados.includes(o.estado)).reduce((s, o) => s + valorOportunidade(o, propostas, imoveis), 0) }));
  }, [oportunidades, propostas, imoveis]);
  const ranking = useMemo(() => usuarios.filter((u) => u.perfil === 'CORRETOR').map((usuario) => { const idsLeads = new Set(leads.filter((l) => l.responsavelUsuarioId === usuario.id).map((l) => l.id)); const fechadas = oportunidades.filter((o) => o.estado === 'FECHADA' && idsLeads.has(o.leadId)); return { usuario, negocios: fechadas.length, vgv: fechadas.reduce((s, o) => s + (imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0) }; }).sort((a, b) => b.vgv - a.vgv), [usuarios, leads, oportunidades, imoveis]);
  const serie = useMemo(() => serieMes(oportunidades, imoveis), [oportunidades, imoveis]);

  if (!sessao) return null;
  if (semPermissao) return <main className={styles.state}><Icon code={'\uE72E'} /><h1>Acesso restrito</h1><p>Apenas o perfil Gestor de unidade pode consultar o Financeiro.</p></main>;
  if (erro) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Financeiro indisponível</h1><p>{erro}</p></main>;
  if (!dados) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando Financeiro</h1><p>Carregando VGV, negócios e corretores...</p></main>;

  const totalPipeline = consolidado.reduce((s, g) => s + g.valor, 0); const fechados = consolidado[0].valor; const ticket = dados.fechamentos ? dados.vgvFechado / dados.fechamentos : 0;
  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '\uE8C7', valor: moeda(dados.vgvFechado, true), titulo: 'VGV realizado', apoio: `${dados.fechamentos} negócio(s) fechado(s)` },
    { tom: 'success', icone: '\uE8B0', valor: '—', titulo: 'Comissões geradas', apoio: 'regra de cálculo não cadastrada' },
    { tom: 'secondary', icone: '\uE787', valor: '—', titulo: 'Comissões recebidas', apoio: 'recebimentos não cadastrados' },
    { tom: 'warning', icone: '\uE81C', valor: '—', titulo: 'Taxa de recebimento', apoio: 'aguardando módulo financeiro' },
    { tom: 'cyan', icone: '\uE789', valor: '—', titulo: 'A receber', apoio: 'sem parcelas registradas' },
  ];
  function fecharModal() { setModal(false); window.history.replaceState(null, '', window.location.pathname); }
  function exportar() { const linhas = [['Corretor', 'Negócios fechados', 'VGV realizado'], ...ranking.map((r) => [r.usuario.nome, r.negocios, r.vgv])]; const blob = new Blob([linhas.map((l) => l.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'financeiro-vgv.csv'; a.click(); URL.revokeObjectURL(url); setMensagem('Resumo financeiro exportado.'); }

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.metrics}>{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
    <section className={styles.toolbar} id="financeiro-filtros"><div className={styles.tabs}>{ABAS.map((item) => <button type="button" className={aba === item.id ? styles.active : ''} onClick={() => { setAba(item.id); if (item.id !== 'geral') setMensagem(`${item.rotulo}: visão detalhada será conectada quando o módulo contábil estiver disponível.`); }} key={item.id}>{item.rotulo}</button>)}</div><div className={styles.toolbarActions}><span><Icon code={'\uE787'} /> Mês atual⌄</span><button type="button" onClick={exportar}><Icon code={'\uE896'} /> Exportar</button></div></section>
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.topGrid}>
          <article className={`${styles.panel} ${styles.vgvPanel}`}><header><div><h2>VGV realizado <Icon code={'\uE946'} /></h2><p>Evolução acumulada dos fechamentos no mês.</p></div><small>Este mês⌄</small></header><div className={styles.highlight}><strong>{moeda(dados.vgvFechado, true)}</strong><span>{dados.fechamentos} fechamento(s)</span></div><VgvChart serie={serie} /><div className={styles.miniMetrics}><span><small>Negócios fechados</small><b>{dados.fechamentos}</b></span><span><small>Ticket médio</small><b>{moeda(ticket, true)}</b></span><span><small>Comissão média</small><b>—</b></span><span><small>Gatilhos cruzados</small><b>{dados.comissoesCruzadasQuantidade}</b></span></div></article>
          <article className={`${styles.panel} ${styles.distributionPanel}`}><header><h2>Distribuição do VGV por status</h2><small>Atual⌄</small></header><div className={styles.distribution}><div className={styles.donut} style={{ '--p1': `${totalPipeline ? fechados / totalPipeline * 360 : 0}deg`, '--p2': `${totalPipeline ? (fechados + consolidado[1].valor) / totalPipeline * 360 : 0}deg`, '--p3': `${totalPipeline ? (fechados + consolidado[1].valor + consolidado[2].valor) / totalPipeline * 360 : 0}deg` } as CSSProperties}><strong>{moeda(totalPipeline, true)}</strong><small>Total</small></div><ul>{consolidado.map((g) => <li key={g.nome}><i data-tone={g.tom} /><span>{g.nome}<small>{moeda(g.valor, true)} ({totalPipeline ? Math.round(g.valor / totalPipeline * 100) : 0}%)</small></span></li>)}</ul></div><Link href="/funil">Ver funil de vendas →</Link></article>
          <article className={`${styles.panel} ${styles.commissionPanel}`}><header><h2>Funil de comissão</h2><small>Dados atuais</small></header><div className={styles.commissionFunnel}><article><i data-tone="primary" /><span>Negócios fechados</span><b>{dados.fechamentos}</b></article><article><i data-tone="secondary" /><span>Gatilhos cruzados</span><b>{dados.comissoesCruzadasQuantidade}</b></article><article><i data-tone="success" /><span>Comissões calculadas</span><b>—</b></article><article><i data-tone="warning" /><span>Recebidas</span><b>—</b></article></div><p>Os percentuais de comissão dependem da regra comercial ainda não cadastrada.</p><button type="button" onClick={() => setMensagem('O cálculo de comissão será liberado quando a tabela de comissionamento estiver configurada.')}>Ver detalhes →</button></article>
        </section>
        <section className={`${styles.panel} ${styles.ranking}`}><header><h2>Resumo financeiro por corretor</h2><small>VGV real dos fechamentos</small></header><div className={styles.tableHead}><span>Corretor</span><span>VGV realizado</span><span>Negócios</span><span>Comissão gerada</span><span>Recebido</span><span>Taxa recebimento</span></div>{ranking.length ? ranking.slice(0, 6).map((r, index) => <article key={r.usuario.id}><span className={styles.avatar}>{r.usuario.temFotoPerfil ? <img src={`/api/usuarios/${r.usuario.id}/foto`} alt="" /> : r.usuario.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span><b>{r.usuario.nome}</b><strong>{moeda(r.vgv, true)}</strong><em>{r.negocios}</em><small>—</small><small>—</small><div><b>—</b><i><em style={{ width: `${r.vgv && ranking[0]?.vgv ? r.vgv / ranking[0].vgv * 100 : 0}%` }} /></i></div></article>) : <p className={styles.empty}>Nenhum corretor com dados financeiros disponíveis.</p>}<Link href="/equipe">Ver ranking completo →</Link></section>
      </div>
      <aside className={styles.side}>
        <section className={`${styles.panel} ${styles.receivable}`}><header><h2>A receber</h2><small>Próximos 30 dias⌄</small></header><strong>—</strong><div className={styles.emptyReceivable}><Icon code={'\uE787'} /><h3>Nenhuma parcela registrada</h3><p>O sistema ainda não possui agenda de recebimentos.</p></div><button type="button" onClick={() => setModal(true)}>Registrar recebimento →</button></section>
        <section className={`${styles.panel} ${styles.integrity}`}><header><h2>Integridade financeira</h2><small>Dados reais</small></header><article><Icon code={'\uE73E'} /><span><b>{dados.fechamentos} fechamentos</b><small>VGV calculado pelo valor anunciado</small></span></article><article><Icon code={'\uE8B0'} /><span><b>{dados.comissoesCruzadasQuantidade} gatilho(s)</b><small>Comissão cruzada acionada</small></span></article><article><Icon code={'\uE7BA'} /><span><b>Comissionamento pendente</b><small>Sem valores estimados ou inventados</small></span></article></section>
      </aside>
    </section>
    {modal && <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) fecharModal(); }}><section className={styles.modal} role="dialog" aria-modal="true"><header><div><h2>Registrar recebimento</h2><p>Módulo financeiro</p></div><button type="button" onClick={fecharModal}>×</button></header><div><Icon code={'\uE8C7'} /><h3>Agenda de recebimentos em preparação</h3><p>Para registrar parcelas com segurança, o backend precisa armazenar contrato, vencimento, beneficiário, valor e situação de pagamento.</p><button type="button" onClick={fecharModal}>Entendi</button></div></section></div>}
  </main>;
}
