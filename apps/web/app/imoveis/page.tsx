'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Imovel, ImovelFinalidade, Lead, Oportunidade, Unidade, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';

// Carregado sob demanda (ssr:false): o MapLibre GL sozinho responde por
// ~270kB do bundle desta pagina (WebGL + parser de vetor/tiles) - sem isso,
// esse peso todo bloqueava o primeiro carregamento da tela inteira de
// Imoveis (KPIs, lista, filtros) so pra renderizar um mapa que nem esta
// acima da dobra. Tambem precisa ser client-only porque maplibre-gl usa
// WebGL/DOM, que nao existe durante o server-side render do Next.
const MapLibreSalesMap = dynamic(
  () => import('../../components/maplibre-sales-map').then((modulo) => modulo.MapLibreSalesMap),
  { ssr: false, loading: () => <div className="property-map-loading">Carregando mapa…</div> },
);

type StatusImovel = 'DISPONIVEL' | 'NEGOCIACAO' | 'RESERVADO' | 'VENDIDO';

const ESTADOS_RESERVA: string[] = ['RESERVA', 'DOCUMENTACAO_CONCLUIDA'];
const ESTADOS_ENCERRADOS: string[] = ['FECHADA', 'PERDIDA'];

const STATUS_INFO: Record<StatusImovel, { label: string; tone: string }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'green' },
  NEGOCIACAO: { label: 'Em Negociação', tone: 'orange' },
  RESERVADO: { label: 'Reservado', tone: 'purple' },
  VENDIDO: { label: 'Vendido', tone: 'blue' },
};

const NOMES_FINALIDADE: Record<ImovelFinalidade, string> = {
  VENDA: 'Venda',
  LOCACAO: 'Locação',
  AMBOS: 'Venda e locação',
};

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function formatarValor(valor: number | null): string {
  return valor != null ? formatadorMoeda.format(valor) : 'Valor a definir';
}

function formatarIdade(criadoEmIso: string): string {
  const dias = Math.floor((Date.now() - new Date(criadoEmIso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return `${dias}d atrás`;
}

const INICIO_DO_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const INICIO_MES_ANTERIOR = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

/** Deriva um status de negociação por imóvel a partir de Oportunidade (Imovel em si não guarda status de venda). */
function derivarStatus(imovelId: string, oportunidades: Oportunidade[]): StatusImovel {
  const doImovel = oportunidades.filter((o) => o.imovelId === imovelId);
  if (doImovel.some((o) => o.estado === 'FECHADA')) return 'VENDIDO';
  const ativas = doImovel.filter((o) => !ESTADOS_ENCERRADOS.includes(o.estado));
  if (ativas.some((o) => ESTADOS_RESERVA.includes(o.estado))) return 'RESERVADO';
  if (ativas.length > 0) return 'NEGOCIACAO';
  return 'DISPONIVEL';
}

function PortfolioPhoto({ photo, className = '' }: { photo: number; className?: string }) {
  return <span className={`portfolio-photo portfolio-photo--${photo} ${className}`} />;
}

export default function ImoveisPage() {
  const { sessao } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroFinalidade, setFiltroFinalidade] = useState<'TODAS' | ImovelFinalidade>('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | StatusImovel>('TODOS');
  const [unidadeProprietariaId, setUnidadeProprietariaId] = useState('');
  const [finalidade, setFinalidade] = useState<ImovelFinalidade>('VENDA');
  const [enderecoResumo, setEnderecoResumo] = useState('');
  const [valorAnunciado, setValorAnunciado] = useState('');
  const [percentualDesconto, setPercentualDesconto] = useState('');

  async function carregarDados() {
    try {
      const [listaUnidades, listaImoveis, listaOportunidades, listaLeads, listaUsuarios] = await Promise.all([
        apiFetch<Unidade[]>('/unidades'),
        apiFetch<Imovel[]>('/imoveis'),
        apiFetch<Oportunidade[]>('/oportunidades'),
        apiFetch<Lead[]>('/leads'),
        apiFetch<Usuario[]>('/usuarios'),
      ]);
      setUnidades(listaUnidades);
      setImoveis(listaImoveis);
      setOportunidades(listaOportunidades);
      setLeads(listaLeads);
      setUsuarios(listaUsuarios);
      if (listaUnidades[0]) setUnidadeProprietariaId((atual) => atual || listaUnidades[0].id);
    } catch {
      setErro('Não foi possível carregar os imóveis. Tente novamente em instantes.');
    }
  }
  useEffect(() => { if (sessao) void carregarDados(); }, [sessao?.tenantId]);
  useEffect(() => { const abrir = () => setModalAberto(window.location.hash === '#novo-imovel'); abrir(); window.addEventListener('hashchange', abrir); return () => window.removeEventListener('hashchange', abrir); }, []);
  useEffect(() => { const abrirImovel = () => { const hash = window.location.hash; const codigo = hash.startsWith('#imovel-') ? decodeURIComponent(hash.replace('#imovel-', '')) : ''; setBusca(codigo); if (hash === '#lista-imoveis' || codigo) window.setTimeout(() => document.querySelector('.property-table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }; abrirImovel(); window.addEventListener('hashchange', abrirImovel); return () => window.removeEventListener('hashchange', abrirImovel); }, []);

  const unidadePorId = useMemo(() => new Map(unidades.map((u) => [u.id, u.nomeFantasia])), [unidades]);
  const statusPorImovel = useMemo(() => new Map(imoveis.map((i) => [i.id, derivarStatus(i.id, oportunidades)])), [imoveis, oportunidades]);

  const kpis = useMemo(() => {
    const grupos: Record<StatusImovel, { count: number; valor: number }> = {
      DISPONIVEL: { count: 0, valor: 0 }, NEGOCIACAO: { count: 0, valor: 0 }, RESERVADO: { count: 0, valor: 0 }, VENDIDO: { count: 0, valor: 0 },
    };
    let valorTotal = 0;
    for (const imovel of imoveis) {
      const status = statusPorImovel.get(imovel.id) ?? 'DISPONIVEL';
      grupos[status].count += 1;
      grupos[status].valor += imovel.valorAnunciado ?? 0;
      valorTotal += imovel.valorAnunciado ?? 0;
    }
    const vendidosNoMes = oportunidades.filter((o) => o.estado === 'FECHADA' && new Date(o.criadoEm) >= INICIO_DO_MES);
    const valorVendidosNoMes = vendidosNoMes.reduce((soma, o) => soma + (imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0);
    return { grupos, valorTotal, vendidosNoMes: { count: vendidosNoMes.length, valor: valorVendidosNoMes } };
  }, [imoveis, oportunidades, statusPorImovel]);

  const tendenciaVendas = useMemo(() => {
    const somaNoPeriodo = (inicio: Date, fim: Date | null) => oportunidades
      .filter((o) => o.estado === 'FECHADA' && new Date(o.criadoEm) >= inicio && (fim === null || new Date(o.criadoEm) < fim))
      .reduce((soma, o) => soma + (imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0);
    const atual = somaNoPeriodo(INICIO_DO_MES, null);
    const anterior = somaNoPeriodo(INICIO_MES_ANTERIOR, INICIO_DO_MES);
    const percentual = anterior > 0 ? ((atual - anterior) / anterior) * 100 : (atual > 0 ? 100 : null);
    return { atual, percentual };
  }, [oportunidades, imoveis]);

  const vendasPorFinalidade = useMemo(() => {
    const totais: Record<ImovelFinalidade, number> = { VENDA: 0, LOCACAO: 0, AMBOS: 0 };
    for (const o of oportunidades) {
      if (o.estado !== 'FECHADA' || new Date(o.criadoEm) < INICIO_DO_MES) continue;
      const imovel = imoveis.find((i) => i.id === o.imovelId);
      if (!imovel) continue;
      totais[imovel.finalidade] += imovel.valorAnunciado ?? 0;
    }
    const total = totais.VENDA + totais.LOCACAO + totais.AMBOS || 1;
    return (Object.keys(totais) as ImovelFinalidade[])
      .map((f) => ({ finalidade: f, valor: totais[f], percentual: Math.round((totais[f] / total) * 100) }))
      .filter((item) => item.valor > 0);
  }, [oportunidades, imoveis]);

  /** Oportunidade não tem campo de corretor - usa o responsavelUsuarioId do Lead de origem como proxy real (uma negociação só existe se o lead já tiver responsável). */
  const vendasPorCorretor = useMemo(() => {
    const porCorretor = new Map<string, { nome: string; valor: number }>();
    for (const o of oportunidades) {
      if (o.estado !== 'FECHADA' || new Date(o.criadoEm) < INICIO_DO_MES) continue;
      const lead = leads.find((l) => l.id === o.leadId);
      const corretor = lead?.responsavelUsuarioId ? usuarios.find((u) => u.id === lead.responsavelUsuarioId) : undefined;
      if (!corretor) continue;
      const imovel = imoveis.find((i) => i.id === o.imovelId);
      const atual = porCorretor.get(corretor.id) ?? { nome: corretor.nome, valor: 0 };
      atual.valor += imovel?.valorAnunciado ?? 0;
      porCorretor.set(corretor.id, atual);
    }
    const lista = [...porCorretor.values()].sort((a, b) => b.valor - a.valor);
    const maior = Math.max(...lista.map((c) => c.valor), 1);
    return lista.slice(0, 5).map((c) => ({ ...c, percentual: Math.round((c.valor / maior) * 100) }));
  }, [oportunidades, imoveis, leads, usuarios]);

  const imoveisPorFinalidade = useMemo(() => {
    const totais: Record<ImovelFinalidade, number> = { VENDA: 0, LOCACAO: 0, AMBOS: 0 };
    for (const imovel of imoveis) totais[imovel.finalidade] += 1;
    const total = imoveis.length || 1;
    return (Object.keys(totais) as ImovelFinalidade[])
      .map((f) => ({ finalidade: f, count: totais[f], percentual: Math.round((totais[f] / total) * 100) }))
      .filter((item) => item.count > 0);
  }, [imoveis]);

  const imoveisEmDestaque = useMemo(
    () => [...imoveis].filter((i) => i.valorAnunciado != null).sort((a, b) => (b.valorAnunciado ?? 0) - (a.valorAnunciado ?? 0)).slice(0, 4),
    [imoveis],
  );

  const ultimosCadastrados = useMemo(
    () => [...imoveis].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()).slice(0, 4),
    [imoveis],
  );

  const rowsFiltradas = useMemo(() => imoveis.filter((imovel) => {
    const status = statusPorImovel.get(imovel.id) ?? 'DISPONIVEL';
    const nomeUnidade = unidadePorId.get(imovel.unidadeProprietariaId) ?? '';
    const buscaOk = `${imovel.enderecoResumo} ${nomeUnidade}`.toLowerCase().includes(busca.toLowerCase());
    const finalidadeOk = filtroFinalidade === 'TODAS' || imovel.finalidade === filtroFinalidade;
    const statusOk = filtroStatus === 'TODOS' || status === filtroStatus;
    return buscaOk && finalidadeOk && statusOk;
  }), [imoveis, busca, filtroFinalidade, filtroStatus, statusPorImovel, unidadePorId]);

  function fecharModal() { setModalAberto(false); if (typeof window !== 'undefined' && window.location.hash) window.history.replaceState(null, '', '/imoveis'); }
  function acaoIndisponivel() { setAviso('Visualização detalhada e edição de imóveis ainda não estão disponíveis nesta versão.'); }
  async function criarImovel(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!unidadeProprietariaId) { setErro('Cadastre uma unidade antes de captar um imóvel.'); return; }
    setCarregando(true); setErro(null); setAviso(null);
    try {
      await apiFetch<Imovel>('/imoveis', { method: 'POST', body: JSON.stringify({ unidadeProprietariaId, finalidade, enderecoResumo, valorAnunciado: valorAnunciado ? Number(valorAnunciado) : undefined, percentualDescontoPreAutorizado: percentualDesconto ? Number(percentualDesconto) : undefined }) });
      setEnderecoResumo(''); setValorAnunciado(''); setPercentualDesconto(''); setAviso('Imóvel cadastrado com sucesso.'); fecharModal(); await carregarDados();
    } catch { setErro('Não foi possível cadastrar o imóvel. Verifique os dados e tente novamente.'); }
    finally { setCarregando(false); }
  }
  if (!sessao) return null;

  return <main className="properties-page"><h1 className="sr-only">Imóveis</h1>
    {(aviso || erro) && <div className={`properties-toast ${erro ? 'properties-toast--error' : ''}`}>{erro ?? aviso}<button onClick={() => { setErro(null); setAviso(null); }}>×</button></div>}

    <section className="property-kpi-grid" aria-label="Indicadores do portfólio">
      <article className="property-kpi property-kpi--purple"><span className="property-kpi__icon fluent">&#xE821;</span><div><small>Total de Imóveis</small><strong>{imoveis.length}</strong><em>{unidades.length} unidade(s)</em></div></article>
      <article className="property-kpi property-kpi--green"><span className="property-kpi__icon fluent">&#xE8FB;</span><div><small>Disponíveis</small><strong>{kpis.grupos.DISPONIVEL.count}</strong><em>{formatarValor(kpis.grupos.DISPONIVEL.valor)}</em></div></article>
      <article className="property-kpi property-kpi--orange"><span className="property-kpi__icon fluent">&#xE81C;</span><div><small>Em Negociação</small><strong>{kpis.grupos.NEGOCIACAO.count}</strong><em>{formatarValor(kpis.grupos.NEGOCIACAO.valor)}</em></div></article>
      <article className="property-kpi property-kpi--blue"><span className="property-kpi__icon fluent">&#xE7EE;</span><div><small>Reservados</small><strong>{kpis.grupos.RESERVADO.count}</strong><em>{formatarValor(kpis.grupos.RESERVADO.valor)}</em></div></article>
      <article className="property-kpi property-kpi--green"><span className="property-kpi__icon fluent">&#xE73E;</span><div><small>Vendidos (Mês)</small><strong>{kpis.vendidosNoMes.count}</strong><em>{formatarValor(kpis.vendidosNoMes.valor)}</em></div></article>
      <article className="property-kpi property-kpi--purple property-kpi--wide"><span className="property-kpi__icon fluent">&#xE8C7;</span><div><small>Valor Geral do Portfólio</small><strong>{formatarValor(kpis.valorTotal)}</strong><em>{imoveis.length} imóveis cadastrados</em></div></article>
    </section>

    <div className="property-primary-grid">
      <div className="property-main-column">
        <section className="portfolio-surface property-map-card"><header className="portfolio-head"><div><h2>Mapa de Imóveis</h2><small>Dados ilustrativos — a localização real dos imóveis depende de geocodificação de endereço, ainda não implementada.</small></div></header><div className="property-map-stage"><MapLibreSalesMap /></div></section>
        <section className="portfolio-surface sales-performance-card"><header className="portfolio-head"><h2>Desempenho de Vendas</h2><small>Este mês</small></header><div className="property-performance-grid">
          <article className="property-sales-value">
            <small>Valor de Vendas (fechamentos deste mês)</small>
            <strong>{formatarValor(tendenciaVendas.atual)}</strong>
            <em>{tendenciaVendas.percentual === null ? 'sem base do mês anterior' : `${tendenciaVendas.percentual >= 0 ? '↗' : '↘'} ${Math.abs(tendenciaVendas.percentual).toFixed(0)}% vs mês anterior`}</em>
          </article>
          <article className="property-sales-bars"><h3>Vendas por Finalidade</h3>
            {vendasPorFinalidade.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: 11 }}>Nenhuma venda fechada neste mês ainda.</p>
              : <ul>{vendasPorFinalidade.map(({ finalidade: f, valor, percentual }) => <li key={f}><div><span>{NOMES_FINALIDADE[f]}</span><b>{formatarValor(valor)} <em>({percentual}%)</em></b></div><i><u style={{ width: `${percentual}%` }} /></i></li>)}</ul>}
          </article>
          <article className="property-broker-sales"><h3>Vendas por Corretor</h3>
            {vendasPorCorretor.length === 0
              ? <p style={{ color: 'var(--muted)', fontSize: 11 }}>Nenhuma venda fechada com corretor responsável neste mês.</p>
              : <ul>{vendasPorCorretor.map((corretor, index) => {
                const iniciais = corretor.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
                return <li key={corretor.nome}><i className={`portfolio-broker portfolio-broker--${(index % 5) + 1}`}>{iniciais}</i><span><b>{corretor.nome}</b><i><u style={{ width: `${corretor.percentual}%` }} /></i></span><strong>{formatarValor(corretor.valor)}</strong></li>;
              })}</ul>}
          </article>
        </div></section>
      </div>

      <aside className="property-side-column">
        <section className="portfolio-surface featured-properties"><header className="portfolio-head"><h2>Imóveis em Destaque</h2><small>Maior valor anunciado</small></header><div>
          {imoveisEmDestaque.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '0 10px' }}>Nenhum imóvel cadastrado ainda.</p>
            : imoveisEmDestaque.map((imovel, index) => {
              const status = statusPorImovel.get(imovel.id) ?? 'DISPONIVEL';
              return <article key={imovel.id} style={{ position: 'relative' }}>
                {index === 0 && <span className="hot-badge">Em Alta</span>}
                <div className="featured-photo-wrap"><PortfolioPhoto photo={(index % 3) + 1} /></div>
                <small>{NOMES_FINALIDADE[imovel.finalidade]}</small>
                <b>{imovel.enderecoResumo}</b>
                <strong>{formatarValor(imovel.valorAnunciado)}</strong>
                <em className={`portfolio-status portfolio-status--${STATUS_INFO[status].tone}`}>{STATUS_INFO[status].label}</em>
              </article>;
            })}
        </div></section>
        <section className="portfolio-surface property-types-card"><header className="portfolio-head"><h2>Imóveis por Finalidade</h2></header><div className="property-types-body"><ul>
          {imoveisPorFinalidade.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 11 }}>Nenhum imóvel cadastrado ainda.</p>
            : imoveisPorFinalidade.map(({ finalidade: f, count, percentual }, index) => <li className={`property-type--${['blue', 'cyan', 'orange'][index % 3]}`} key={f}><i /><span>{NOMES_FINALIDADE[f]}</span><b>{percentual}% <em>({count})</em></b></li>)}
        </ul></div></section>
        <section className="portfolio-surface latest-properties"><header className="portfolio-head"><h2>Últimos Imóveis Cadastrados</h2></header><ul>
          {ultimosCadastrados.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '0 11px' }}>Nenhum imóvel cadastrado ainda.</p>
            : ultimosCadastrados.map((imovel, index) => <li key={imovel.id}><PortfolioPhoto photo={(index % 3) + 1} /><span><b>{imovel.enderecoResumo}</b><small>{NOMES_FINALIDADE[imovel.finalidade]} · {unidadePorId.get(imovel.unidadeProprietariaId) ?? 'Unidade'}</small></span><strong>{formatarValor(imovel.valorAnunciado)}</strong><time>{formatarIdade(imovel.criadoEm)}</time></li>)}
        </ul></section>
      </aside>
    </div>

    <section className="portfolio-surface property-table-card"><header className="property-table-toolbar"><h2>Lista de Imóveis</h2>
      <select value={filtroFinalidade} onChange={(evento) => setFiltroFinalidade(evento.target.value as 'TODAS' | ImovelFinalidade)} aria-label="Filtrar por finalidade"><option value="TODAS">Todas as finalidades</option><option value="VENDA">Venda</option><option value="LOCACAO">Locação</option><option value="AMBOS">Venda e locação</option></select>
      <select value={filtroStatus} onChange={(evento) => setFiltroStatus(evento.target.value as 'TODOS' | StatusImovel)} aria-label="Filtrar por status"><option value="TODOS">Todos os status</option><option value="DISPONIVEL">Disponível</option><option value="NEGOCIACAO">Em Negociação</option><option value="RESERVADO">Reservado</option><option value="VENDIDO">Vendido</option></select>
      <label><span className="fluent">&#xE721;</span><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar por endereço ou unidade..." /></label>
      <button className="property-table-new" onClick={() => setModalAberto(true)}>＋ Novo Imóvel</button>
    </header><div className="property-table-scroll"><table><thead><tr><th>Imóvel</th><th>Finalidade</th><th>Unidade</th><th>Valor</th><th>Status</th><th>Desconto</th><th>Cadastrado</th><th>Ações</th></tr></thead><tbody>{rowsFiltradas.map((imovel, index) => {
      const status = statusPorImovel.get(imovel.id) ?? 'DISPONIVEL';
      return <tr key={imovel.id}>
        <td><span className="property-name-cell"><PortfolioPhoto photo={(index % 3) + 1} /><span><b>{imovel.enderecoResumo}</b></span></span></td>
        <td>{NOMES_FINALIDADE[imovel.finalidade]}</td>
        <td>{unidadePorId.get(imovel.unidadeProprietariaId) ?? '—'}</td>
        <td><b>{formatarValor(imovel.valorAnunciado)}</b></td>
        <td><em className={`portfolio-status portfolio-status--${STATUS_INFO[status].tone}`}>{STATUS_INFO[status].label}</em></td>
        <td>{imovel.percentualDescontoPreAutorizado != null ? `${imovel.percentualDescontoPreAutorizado}%` : '—'}</td>
        <td>{formatarIdade(imovel.criadoEm)}</td>
        <td><span className="property-row-actions"><button aria-label="Visualizar" onClick={acaoIndisponivel}>⌾</button><button aria-label="Editar" onClick={acaoIndisponivel}>✎</button></span></td>
      </tr>;
    })}</tbody></table></div><footer><span>Mostrando {rowsFiltradas.length} de {imoveis.length} imóveis</span></footer></section>

    {modalAberto && <div className="property-modal-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) fecharModal(); }}><section className="property-modal" role="dialog" aria-modal="true" aria-labelledby="novo-imovel-title"><header><div><h2 id="novo-imovel-title">Novo Imóvel</h2><p>Cadastre o imóvel e adicione-o ao portfólio da imobiliária.</p></div><button onClick={fecharModal} aria-label="Fechar">×</button></header><form onSubmit={criarImovel}><label>Unidade proprietária<select value={unidadeProprietariaId} onChange={(evento) => setUnidadeProprietariaId(evento.target.value)} required><option value="">Selecione</option>{unidades.map((unidade) => <option value={unidade.id} key={unidade.id}>{unidade.nomeFantasia}</option>)}</select></label><label>Finalidade<select value={finalidade} onChange={(evento) => setFinalidade(evento.target.value as ImovelFinalidade)}><option value="VENDA">Venda</option><option value="LOCACAO">Locação</option><option value="AMBOS">Venda e locação</option></select></label><label className="property-modal-address">Endereço do imóvel<input value={enderecoResumo} onChange={(evento) => setEnderecoResumo(evento.target.value)} minLength={5} placeholder="Rua, número, bairro e cidade" required autoFocus /></label><label>Valor anunciado<input type="number" value={valorAnunciado} onChange={(evento) => setValorAnunciado(evento.target.value)} placeholder="R$ 0" /></label><label>Desconto pré-autorizado (%)<input type="number" value={percentualDesconto} onChange={(evento) => setPercentualDesconto(evento.target.value)} placeholder="0%" /></label><footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={carregando || unidades.length === 0}>{carregando ? 'Salvando...' : 'Cadastrar Imóvel'}</button></footer></form></section></div>}
  </main>;
}
