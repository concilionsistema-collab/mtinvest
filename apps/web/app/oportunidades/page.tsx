'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Imovel, Lead, Oportunidade, OportunidadeEstado, Pessoa, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';
import './negociacoes.css';

type EstagioId = 'PROSPECCAO' | 'VISITA' | 'PROPOSTA' | 'ANALISE' | 'AGUARDANDO' | 'FECHADAS';

/**
 * Os 6 estágios visuais do Kanban são um agrupamento dos 10 estados reais de
 * Oportunidade (o board foi desenhado para 6 colunas). PERDIDA não entra em
 * nenhuma coluna (fica fora do pipeline ativo, só conta no resumo lateral).
 * "Fechadas (Mês)" é território deliberadamente restrito ao mês corrente,
 * igual ao VGV Fechado do Dashboard.
 */
const ESTAGIOS: { id: EstagioId; titulo: string; tone: 'purple' | 'blue' | 'cyan' | 'orange' | 'yellow' | 'green'; estados: OportunidadeEstado[]; apenasEsteMes?: boolean }[] = [
  { id: 'PROSPECCAO', titulo: 'Em Prospecção', tone: 'purple', estados: ['QUALIFICACAO'] },
  { id: 'VISITA', titulo: 'Em Visita', tone: 'blue', estados: ['VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA'] },
  { id: 'PROPOSTA', titulo: 'Em Proposta', tone: 'cyan', estados: ['PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA'] },
  { id: 'ANALISE', titulo: 'Em Análise', tone: 'orange', estados: ['RESERVA'] },
  { id: 'AGUARDANDO', titulo: 'Aguardando Cliente', tone: 'yellow', estados: ['DOCUMENTACAO_CONCLUIDA'] },
  { id: 'FECHADAS', titulo: 'Fechadas (Mês)', tone: 'green', estados: ['FECHADA'], apenasEsteMes: true },
];

const LABEL_ESTADO: Record<OportunidadeEstado, string> = {
  QUALIFICACAO: 'Qualificação', VISITA_AGENDADA: 'Visita Agendada', VISITA_CONFIRMADA: 'Visita Confirmada',
  VISITA_REALIZADA: 'Visita Realizada', PROPOSTA_ENVIADA: 'Proposta Enviada', EM_CONTRAPROPOSTA: 'Em Contraproposta',
  RESERVA: 'Reserva', DOCUMENTACAO_CONCLUIDA: 'Documentação', FECHADA: 'Fechada', PERDIDA: 'Perdida',
};

/** Distância no funil (para "negociações quentes" e "avanço" na tabela) - não é probabilidade real, é só a posição na sequência. */
const SEQUENCIA_ESTADOS: OportunidadeEstado[] = ['QUALIFICACAO', 'VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA', 'PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA', 'RESERVA', 'DOCUMENTACAO_CONCLUIDA', 'FECHADA'];
function avancoPercentual(estado: OportunidadeEstado): number {
  const indice = SEQUENCIA_ESTADOS.indexOf(estado);
  return indice === -1 ? 0 : Math.round(((indice + 1) / SEQUENCIA_ESTADOS.length) * 100);
}

function claseTone(tone: string): string { return tone === 'purple' ? '' : ` deals-tone--${tone}`; }
function claseStage(tone: string): string { return tone === 'purple' ? 'deals-stage' : `deals-stage deals-stage--${tone}`; }
function claseLegend(tone: string): string { return tone === 'purple' ? '' : ` deals-legend--${tone}`; }

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function formatarValor(valor: number | null | undefined): string { return valor != null ? formatadorMoeda.format(valor) : 'Sem valor definido'; }

function formatarIdade(criadoEmIso: string): string {
  const dias = Math.floor((Date.now() - new Date(criadoEmIso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return '1d atrás';
  return `${dias}d atrás`;
}

const INICIO_DO_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function criadosNoMes<T extends { criadoEm: string }>(itens: T[]): number { return itens.filter((item) => new Date(item.criadoEm) >= INICIO_DO_MES).length; }
/** Mesma simplificação registrada no Dashboard: sem histórico de transição de estado, mede "quanto do total de hoje é novo este mês". */
function tendencia(totalAgora: number, criadosEsteMes: number): number | null {
  const totalInicioDoMes = totalAgora - criadosEsteMes;
  if (totalInicioDoMes <= 0) return criadosEsteMes > 0 ? 100 : null;
  return (criadosEsteMes / totalInicioDoMes) * 100;
}
function rotuloTendencia(percentual: number | null): string { return percentual === null ? 'sem base anterior' : `${percentual >= 0 ? '↑' : '↓'} ${Math.abs(percentual).toFixed(0)}% vs mês anterior`; }

function Avatar({ nome, index = 0 }: { nome: string; index?: number }) {
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  return <span className={`deals-avatar deals-avatar--${(index % 5) + 1}`}>{iniciais}</span>;
}

export default function OportunidadesPage() {
  const { sessao } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [leadId, setLeadId] = useState('');
  const [imovelId, setImovelId] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState<'TODAS' | EstagioId | 'PERDIDA'>('TODAS');
  const [filtroCorretor, setFiltroCorretor] = useState('TODOS');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarDados() {
    try {
      const [l, i, p, u, o] = await Promise.all([apiFetch<Lead[]>('/leads'), apiFetch<Imovel[]>('/imoveis'), apiFetch<Pessoa[]>('/pessoas'), apiFetch<Usuario[]>('/usuarios'), apiFetch<Oportunidade[]>('/oportunidades')]);
      setLeads(l); setImoveis(i); setPessoas(p); setUsuarios(u); setOportunidades(o);
    } catch { setErro('Não foi possível carregar as negociações. Tente novamente em instantes.'); }
  }
  useEffect(() => { if (sessao) void carregarDados(); }, [sessao?.tenantId]);
  useEffect(() => { const abrir = () => setModalAberto(window.location.hash === '#nova-negociacao'); abrir(); window.addEventListener('hashchange', abrir); return () => window.removeEventListener('hashchange', abrir); }, []);

  const leadsComResponsavel = leads.filter((lead) => lead.responsavelUsuarioId);
  const nomeLead = (lead: Lead) => pessoas.find((p) => p.id === lead.pessoaId)?.nome ?? lead.pessoaId;
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? 'Sem responsável';

  const leadPorOportunidade = useMemo(() => new Map(oportunidades.map((o) => [o.id, leads.find((l) => l.id === o.leadId)])), [oportunidades, leads]);
  const imovelPorOportunidade = useMemo(() => new Map(oportunidades.map((o) => [o.id, imoveis.find((i) => i.id === o.imovelId)])), [oportunidades, imoveis]);
  const nomeClientePorOportunidade = useMemo(() => new Map(oportunidades.map((o) => {
    const lead = leadPorOportunidade.get(o.id);
    const pessoa = lead ? pessoas.find((p) => p.id === lead.pessoaId) : undefined;
    return [o.id, pessoa?.nome ?? 'Cliente'];
  })), [oportunidades, leadPorOportunidade, pessoas]);
  const corretorPorOportunidade = useMemo(() => new Map(oportunidades.map((o) => {
    const lead = leadPorOportunidade.get(o.id);
    const corretor = lead?.responsavelUsuarioId ? usuarios.find((u) => u.id === lead.responsavelUsuarioId) : undefined;
    return [o.id, corretor ?? null];
  })), [oportunidades, leadPorOportunidade, usuarios]);

  function estagioDe(o: Oportunidade): EstagioId | null {
    for (const estagio of ESTAGIOS) {
      if (estagio.estados.includes(o.estado)) {
        if (estagio.apenasEsteMes && new Date(o.criadoEm) < INICIO_DO_MES) return null;
        return estagio.id;
      }
    }
    return null;
  }

  const porEstagio = useMemo(() => {
    const grupos = new Map<EstagioId, Oportunidade[]>(ESTAGIOS.map((e) => [e.id, []]));
    for (const o of oportunidades) { const estagio = estagioDe(o); if (estagio) grupos.get(estagio)!.push(o); }
    return grupos;
  }, [oportunidades]);

  const valorDe = (o: Oportunidade) => imovelPorOportunidade.get(o.id)?.valorAnunciado ?? 0;
  const somaValor = (lista: Oportunidade[]) => lista.reduce((soma, o) => soma + valorDe(o), 0);

  const kpis = useMemo(() => {
    const ativas = oportunidades.filter((o) => o.estado !== 'FECHADA' && o.estado !== 'PERDIDA');
    const emProposta = oportunidades.filter((o) => ['PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA'].includes(o.estado));
    const emVisita = oportunidades.filter((o) => ['VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA'].includes(o.estado));
    const emAnalise = oportunidades.filter((o) => o.estado === 'RESERVA');
    const aguardando = oportunidades.filter((o) => o.estado === 'DOCUMENTACAO_CONCLUIDA');
    const fechadasMes = oportunidades.filter((o) => o.estado === 'FECHADA' && new Date(o.criadoEm) >= INICIO_DO_MES);
    return [
      { label: 'Negociações Ativas', count: ativas.length, trend: tendencia(ativas.length, criadosNoMes(ativas)), tone: 'purple', detalhe: rotuloTendencia(tendencia(ativas.length, criadosNoMes(ativas))) },
      { label: 'Em Proposta', count: emProposta.length, tone: 'blue', detalhe: rotuloTendencia(tendencia(emProposta.length, criadosNoMes(emProposta))) },
      { label: 'Em Visita', count: emVisita.length, tone: 'green', detalhe: rotuloTendencia(tendencia(emVisita.length, criadosNoMes(emVisita))) },
      { label: 'Em Análise', count: emAnalise.length, tone: 'orange', detalhe: rotuloTendencia(tendencia(emAnalise.length, criadosNoMes(emAnalise))) },
      { label: 'Aguardando Cliente', count: aguardando.length, tone: 'yellow', detalhe: rotuloTendencia(tendencia(aguardando.length, criadosNoMes(aguardando))) },
      { label: 'Fechadas (Mês)', count: fechadasMes.length, tone: 'green', detalhe: formatarValor(somaValor(fechadasMes)) },
      { label: 'Valor em Negociação', count: null, valor: somaValor(ativas), tone: 'blue', detalhe: 'Valor total das negociações ativas' },
    ];
  }, [oportunidades, imoveis]);

  const resumoLateral = useMemo(() => {
    const total = oportunidades.length || 1;
    const itens: { nome: string; tone: string; count: number; percentual: number }[] = ESTAGIOS.map((estagio) => {
      const lista = oportunidades.filter((o) => estagio.estados.includes(o.estado));
      return { nome: estagio.titulo, tone: estagio.tone, count: lista.length, percentual: Math.round((lista.length / total) * 100) };
    });
    const perdidas = oportunidades.filter((o) => o.estado === 'PERDIDA');
    itens.push({ nome: 'Canceladas', tone: 'red', count: perdidas.length, percentual: Math.round((perdidas.length / total) * 100) });
    return itens;
  }, [oportunidades]);

  const negociacoesQuentes = useMemo(() => [...oportunidades]
    .filter((o) => o.estado !== 'FECHADA' && o.estado !== 'PERDIDA')
    .sort((a, b) => avancoPercentual(b.estado) - avancoPercentual(a.estado))
    .slice(0, 5), [oportunidades]);

  const rankingCorretores = useMemo(() => {
    const porCorretor = new Map<string, { nome: string; count: number; valor: number }>();
    for (const o of oportunidades) {
      if (o.estado === 'PERDIDA') continue;
      const corretor = corretorPorOportunidade.get(o.id);
      if (!corretor) continue;
      const atual = porCorretor.get(corretor.id) ?? { nome: corretor.nome, count: 0, valor: 0 };
      atual.count += 1; atual.valor += valorDe(o);
      porCorretor.set(corretor.id, atual);
    }
    const lista = [...porCorretor.values()].sort((a, b) => b.valor - a.valor);
    const totalValor = lista.reduce((soma, item) => soma + item.valor, 0) || 1;
    return lista.slice(0, 5).map((item) => ({ ...item, share: Math.round((item.valor / totalValor) * 100) }));
  }, [oportunidades, corretorPorOportunidade]);

  const valorPorEtapa = useMemo(() => {
    const itens = ESTAGIOS.map((estagio) => ({ titulo: estagio.titulo, tone: estagio.tone, valor: somaValor(porEstagio.get(estagio.id) ?? []) }));
    const maior = Math.max(...itens.map((i) => i.valor), 1);
    return itens.map((item) => ({ ...item, alturaPercentual: Math.round((item.valor / maior) * 100) }));
  }, [porEstagio, imoveis]);

  const conversaoFunil = useMemo(() => {
    const contagens = ESTAGIOS.map((estagio) => ({ titulo: estagio.titulo, count: (porEstagio.get(estagio.id) ?? []).length }));
    const base = contagens[0]?.count || 1;
    const taxaGeral = base > 0 ? Math.round(((contagens[contagens.length - 1]?.count ?? 0) / base) * 100) : 0;
    return { contagens: contagens.map((c) => ({ ...c, percentual: Math.round((c.count / base) * 100) })), taxaGeral };
  }, [porEstagio]);

  const totalPerdidas = useMemo(() => oportunidades.filter((o) => o.estado === 'PERDIDA').length, [oportunidades]);

  const linhasFiltradas = useMemo(() => oportunidades.filter((o) => {
    const cliente = nomeClientePorOportunidade.get(o.id) ?? '';
    const imovel = imovelPorOportunidade.get(o.id)?.enderecoResumo ?? '';
    const corretor = corretorPorOportunidade.get(o.id)?.nome ?? '';
    const buscaOk = `${cliente} ${imovel} ${corretor}`.toLowerCase().includes(busca.toLowerCase());
    const etapaOk = filtroEtapa === 'TODAS' || (filtroEtapa === 'PERDIDA' ? o.estado === 'PERDIDA' : estagioDe(o) === filtroEtapa);
    const corretorOk = filtroCorretor === 'TODOS' || corretorPorOportunidade.get(o.id)?.id === filtroCorretor;
    return buscaOk && etapaOk && corretorOk;
  }).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()), [oportunidades, busca, filtroEtapa, filtroCorretor, nomeClientePorOportunidade, imovelPorOportunidade, corretorPorOportunidade]);

  function fecharModal() { setModalAberto(false); if (location.hash) history.replaceState(null, '', '/oportunidades'); }
  async function criarNegociacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setCarregando(true); setErro(null); setMensagem(null);
    try { await apiFetch<Oportunidade>('/oportunidades', { method: 'POST', body: JSON.stringify({ leadId, imovelId }) }); setMensagem('Negociação criada com sucesso.'); setLeadId(''); setImovelId(''); fecharModal(); await carregarDados(); }
    catch { setErro('Não foi possível criar a negociação. Confirme se o lead possui corretor responsável e se já não existe uma negociação ativa para este imóvel.'); }
    finally { setCarregando(false); }
  }
  if (!sessao) return null;

  return <main className="deals-page"><h1 className="sr-only">Negociações</h1>
    {(mensagem || erro) && <div className={`deals-toast ${erro ? 'deals-toast--error' : ''}`}>{erro ?? mensagem}<button onClick={() => { setMensagem(null); setErro(null); }}>×</button></div>}

    <section className="deals-kpis" aria-label="Indicadores de negociações">{kpis.map((kpi, index) => <article className={`deals-kpi${claseTone(kpi.tone)} ${index === 6 ? 'deals-kpi--wide' : ''}`} key={kpi.label}><span>{index === 6 ? '＄' : index + 1}</span><div><small>{kpi.label}</small><strong>{kpi.count !== null ? kpi.count.toLocaleString('pt-BR') : formatarValor(kpi.valor)}</strong><em>{kpi.detalhe}</em></div></article>)}</section>

    <div className="deals-primary-grid">
      <section className="deals-surface deals-pipeline"><header className="deals-section-head"><h2>Pipeline de Negociações</h2></header><div className="deals-kanban">{ESTAGIOS.map((estagio) => {
        const lista = porEstagio.get(estagio.id) ?? [];
        const cardsVisiveis = lista.slice(0, 4);
        return <article className={claseStage(estagio.tone)} key={estagio.id}><header><b>{estagio.titulo}</b><small>{lista.length} negociações</small><strong>{formatarValor(somaValor(lista))}</strong></header><div>{cardsVisiveis.map((o, cardIdx) => {
          const imovel = imovelPorOportunidade.get(o.id);
          const nome = nomeClientePorOportunidade.get(o.id) ?? 'Cliente';
          return <button className="deals-card" key={o.id}><Avatar nome={nome} index={cardIdx} /><span><b>{nome}</b><small>{imovel?.enderecoResumo ?? 'Imóvel'}</small><strong>{formatarValor(imovel?.valorAnunciado)}</strong><em>{formatarIdade(o.criadoEm)}</em></span><i>{estagio.id === 'FECHADAS' ? '✓' : '›'}</i></button>;
        })}</div>{lista.length > 4 && <footer>＋ {lista.length - 4} negociações</footer>}</article>;
      })}</div></section>

      <aside className="deals-side">
        <section className="deals-surface deals-summary"><header className="deals-section-head"><h2>Resumo de Negociações</h2></header><div><div className="deals-donut"><strong>{oportunidades.length}</strong><span>Total</span></div><ul>{resumoLateral.map((item) => <li className={claseLegend(item.tone).trim()} key={item.nome}><i /><span>{item.nome}</span><b>{item.percentual}%</b><em>({item.count})</em></li>)}</ul></div></section>
        <section className="deals-surface deals-hot"><header className="deals-section-head"><h2>Mais Avançadas no Funil</h2></header><ul>{negociacoesQuentes.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '8px 10px' }}>Nenhuma negociação ativa.</p> : negociacoesQuentes.map((o, index) => { const nome = nomeClientePorOportunidade.get(o.id) ?? 'Cliente'; const imovel = imovelPorOportunidade.get(o.id); return <li key={o.id}><Avatar nome={nome} index={index} /><span><b>{nome}</b><small>{imovel?.enderecoResumo ?? 'Imóvel'}</small></span><em>{formatarValor(imovel?.valorAnunciado)}</em><strong>{avancoPercentual(o.estado)}%</strong></li>; })}</ul></section>
      </aside>
    </div>

    <div className="deals-analytics-grid">
      <section className="deals-surface deals-brokers"><header className="deals-section-head"><h2>Negociações por Corretor</h2></header>
        {rankingCorretores.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '8px 10px' }}>Nenhum lead com corretor responsável ainda.</p>
          : <ul>{rankingCorretores.map((item, index) => <li key={item.nome}><Avatar nome={item.nome} index={index} /><span><b>{item.nome}</b><i><u style={{ width: `${item.share}%` }} /></i></span><strong>{item.count}</strong><em>{formatarValor(item.valor)}</em><small>{item.share}%</small></li>)}</ul>}
      </section>
      <section className="deals-surface deals-stage-value"><header className="deals-section-head"><div><h2>Valor por Etapa do Funil</h2><small>Valor (R$)</small></div></header><div className="deals-bars-chart">{valorPorEtapa.map((item) => <i className={item.tone === 'purple' ? '' : `bar-${item.tone}`} style={{ height: `${Math.max(4, item.alturaPercentual)}%` }} key={item.titulo}><b>{formatarValor(item.valor)}</b><span>{item.titulo}</span></i>)}</div></section>
      <section className="deals-surface deals-conversion"><header className="deals-section-head"><h2>Taxa de Conversão do Funil</h2></header><div><div className="deals-funnel"><i /><i /><i /><i /><i /><i /></div><ul>{conversaoFunil.contagens.map((c) => <li key={c.titulo}>{c.titulo} <b>{c.count}</b><em>({c.percentual}%)</em></li>)}</ul></div><footer>Taxa geral: <b>{conversaoFunil.taxaGeral}%</b></footer></section>
      <section className="deals-surface deals-loss"><header className="deals-section-head"><h2>Negociações Perdidas</h2></header>
        <p style={{ color: 'var(--muted)', fontSize: 11, padding: '4px 11px' }}>{totalPerdidas} negociação(ões) perdida(s) ao todo. O sistema ainda não registra o motivo ao mover uma negociação para "Perdida".</p>
      </section>
    </div>

    <section className="deals-surface deals-table"><header><h2>Todas as Negociações <small>{oportunidades.length} reais</small></h2><label>⌕<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." /></label>
      <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value as typeof filtroEtapa)} aria-label="Filtrar por etapa"><option value="TODAS">Todas as etapas</option>{ESTAGIOS.map((e) => <option value={e.id} key={e.id}>{e.titulo}</option>)}<option value="PERDIDA">Perdidas</option></select>
      <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)} aria-label="Filtrar por corretor"><option value="TODOS">Todos os corretores</option>{usuarios.map((u) => <option value={u.id} key={u.id}>{u.nome}</option>)}</select>
    </header><div><table><thead><tr><th>Cliente</th><th>Imóvel</th><th>Etapa</th><th>Valor</th><th>Corretor</th><th>Avanço</th><th>Criada em</th><th>Ações</th></tr></thead><tbody>{linhasFiltradas.map((o, index) => {
      const nome = nomeClientePorOportunidade.get(o.id) ?? 'Cliente';
      const imovel = imovelPorOportunidade.get(o.id);
      const corretor = corretorPorOportunidade.get(o.id);
      const toneStatus = o.estado === 'FECHADA' ? 'blue' : o.estado === 'PERDIDA' ? '' : o.estado === 'PROPOSTA_ENVIADA' || o.estado === 'EM_CONTRAPROPOSTA' ? '' : o.estado === 'RESERVA' || o.estado === 'DOCUMENTACAO_CONCLUIDA' ? 'orange' : 'purple';
      return <tr key={o.id}>
        <td><Avatar nome={nome} index={index} /><b>{nome}</b></td>
        <td>{imovel?.enderecoResumo ?? '—'}</td>
        <td><em className={`deals-status${toneStatus ? ` deals-status--${toneStatus}` : ''}`}>{LABEL_ESTADO[o.estado]}</em></td>
        <td>{formatarValor(imovel?.valorAnunciado)}</td>
        <td>{corretor ? <><Avatar nome={corretor.nome} index={index + 1} />{corretor.nome}</> : 'Sem responsável'}</td>
        <td><strong>{avancoPercentual(o.estado)}%</strong><i className="probability"><u style={{ width: `${avancoPercentual(o.estado)}%` }} /></i></td>
        <td>{formatarIdade(o.criadoEm)}</td>
        <td><span className="deals-actions"><Link href="/leads" aria-label="Ver e movimentar em Leads">→</Link></span></td>
      </tr>;
    })}</tbody></table></div></section>

    {modalAberto && <div className="deals-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) fecharModal(); }}><section className="deals-modal" role="dialog" aria-modal="true" aria-labelledby="nova-negociacao-title"><header><div><h2 id="nova-negociacao-title">Nova Negociação</h2><p>Vincule um lead qualificado a um imóvel disponível.</p></div><button onClick={fecharModal}>×</button></header><form onSubmit={criarNegociacao}><label>Lead<select value={leadId} onChange={(e) => setLeadId(e.target.value)} required><option value="">Selecione o lead</option>{leadsComResponsavel.map((lead) => <option value={lead.id} key={lead.id}>{nomeLead(lead)} — {nomeUsuario(lead.responsavelUsuarioId)}</option>)}</select></label><label>Imóvel<select value={imovelId} onChange={(e) => setImovelId(e.target.value)} required><option value="">Selecione o imóvel</option>{imoveis.map((imovel) => <option value={imovel.id} key={imovel.id}>{imovel.enderecoResumo}</option>)}</select></label><footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={carregando || !leadId || !imovelId}>{carregando ? 'Criando...' : 'Criar Negociação'}</button></footer></form></section></div>}
  </main>;
}
