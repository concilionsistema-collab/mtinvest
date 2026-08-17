'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { IndicadoresFunil, Imovel, Lead, Oportunidade, Tarefa, Usuario, Visita } from '@crm/shared';
import { useAuth } from '../components/auth-context';
import { apiFetch, ApiError } from '../lib/api';
import { MapLibreSalesMap } from '../components/maplibre-sales-map';
import { CompactSalesFunnel, PremiumSalesPerformance, type PontoVendasDia } from '../components/dashboard-sales-widgets';

const ESTADOS_OPORTUNIDADE_ENCERRADOS = ['FECHADA', 'PERDIDA'];
const ESTADOS_VISITA_AGENDADA = ['AGENDADA', 'CONFIRMADA'];

const NOMES_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  site: 'Site',
  indicacao: 'Indicação',
  captacao_ativa: 'Captação ativa',
};

const LABEL_ESTADO_OPORTUNIDADE: Record<string, string> = {
  QUALIFICACAO: 'Qualificação',
  VISITA_AGENDADA: 'Visita Agendada',
  VISITA_CONFIRMADA: 'Visita Confirmada',
  VISITA_REALIZADA: 'Visita Realizada',
  PROPOSTA_ENVIADA: 'Proposta Enviada',
  EM_CONTRAPROPOSTA: 'Em Contraproposta',
  RESERVA: 'Reserva',
  DOCUMENTACAO_CONCLUIDA: 'Documentação',
  FECHADA: 'Fechada',
  PERDIDA: 'Perdida',
};

const AVISO_SOMENTE_GESTOR = 'Apenas o perfil "Gestor de unidade" acessa este indicador.';

/** R$ 4,85 mi acima de 1 milhão, valor cheio abaixo disso - nunca inventa precisão que a abreviação "mi" não teria. */
function formatarMoeda(valor: number): string {
  if (valor >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toFixed(2).replace('.', ',')} mi`;
  }
  return `R$ ${valor.toLocaleString('pt-BR')}`;
}

const INICIO_DO_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function criadosNoMes<T extends { criadoEm: string }>(itens: T[]): number {
  return itens.filter((item) => new Date(item.criadoEm) >= INICIO_DO_MES).length;
}

/**
 * "vs. mês anterior" real, calculado sem nenhuma tabela de histórico: como
 * nenhuma entidade deste sistema é apagada, o total no início do mês é
 * (total de hoje - quantos foram criados este mês). Funciona bem para
 * contagens cumulativas (Leads, Imóveis). SIMPLIFICAÇÃO REGISTRADA: para
 * contagens por estado (Negociações Ativas, Visitas Agendadas, Vendas
 * Fechadas), usa a mesma lógica sobre o conjunto filtrado atual - não existe
 * histórico de transição de estado no sistema, então isto mede "quanto do
 * total de hoje é novo este mês", não literalmente "o total no fim do mês
 * passado". Por isso só sobe (nunca detecta itens que saíram do estado
 * filtrado este mês, ex.: uma venda perdida) - registrado, não escondido.
 */
function calcularCrescimentoMensal(totalAgora: number, criadosEsteMes: number): number | null {
  const totalInicioDoMes = totalAgora - criadosEsteMes;
  if (totalInicioDoMes <= 0) {
    return criadosEsteMes > 0 ? 100 : null;
  }
  return (criadosEsteMes / totalInicioDoMes) * 100;
}

/** Mesma simplificação de calcularCrescimentoMensal: usa Oportunidade.criadoEm como proxy da data de fechamento (não existe campo separado "fechadoEm" nesta fatia). */
function construirSerieVendasDoMes(oportunidades: Oportunidade[], imoveis: Imovel[]): PontoVendasDia[] {
  const hoje = new Date();
  const diaAtual = hoje.getDate();
  const valorPorDia = new Map<number, number>();
  for (const o of oportunidades) {
    if (o.estado !== 'FECHADA') continue;
    const dataFechamento = new Date(o.criadoEm);
    if (dataFechamento < INICIO_DO_MES) continue;
    const dia = dataFechamento.getDate();
    const imovel = imoveis.find((i) => i.id === o.imovelId);
    valorPorDia.set(dia, (valorPorDia.get(dia) ?? 0) + (imovel?.valorAnunciado ?? 0));
  }
  let acumulado = 0;
  const serie: PontoVendasDia[] = [];
  for (let dia = 1; dia <= diaAtual; dia += 1) {
    acumulado += valorPorDia.get(dia) ?? 0;
    serie.push({ dia, valor: acumulado });
  }
  return serie;
}

interface MetricaDashboard {
  label: string;
  rawValue: number;
  format: (valor: number) => string;
  trendPercent: number | null;
  color: string;
  icon: string;
  href: string;
}

/** Anima de 0 até o valor real (pedido: "sair do zero e vai até o número que a empresa fez") toda vez que o valor muda. */
function useContadorAnimado(valorFinal: number, duracaoMs = 900): number {
  const [valorAtual, setValorAtual] = useState(0);

  useEffect(() => {
    let frame: number;
    const inicio = performance.now();

    function passo(agora: number): void {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1);
      const suavizado = 1 - Math.pow(1 - progresso, 3);
      setValorAtual(Math.round(valorFinal * suavizado));
      if (progresso < 1) frame = requestAnimationFrame(passo);
    }

    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
  }, [valorFinal, duracaoMs]);

  return valorAtual;
}

function MetricCard({ metric }: { metric: MetricaDashboard }) {
  const valorAnimado = useContadorAnimado(metric.rawValue);
  const tendencia = metric.trendPercent;
  const emAlta = (tendencia ?? 0) >= 0;
  const tendenciaDisponivel = tendencia !== null;

  return (
    <Link href={metric.href} className={`metric metric--${metric.color}`}>
      <span className="metric-icon" aria-hidden="true">
        <img src={metric.icon} alt="" width="256" height="256" />
      </span>
      <div className="metric-copy">
        <small>{metric.label}</small>
        <strong>{metric.format(valorAnimado)}</strong>
      </div>
      <div
        className={`metric-trend ${tendenciaDisponivel ? '' : 'metric-trend--neutral'}`}
        aria-label={tendenciaDisponivel
          ? `${emAlta ? 'Alta' : 'Queda'} de ${Math.abs(tendencia).toFixed(0)}% desde o início do mês`
          : 'Sem base anterior para comparação'}
      >
        <span className="metric-trend__value">
          {tendenciaDisponivel
            ? <><i aria-hidden="true">{emAlta ? '↗' : '↘'}</i>{Math.abs(tendencia).toFixed(0)}%</>
            : '—'}
        </span>
        <span>{tendenciaDisponivel ? 'vs. mês anterior' : 'sem base anterior'}</span>
      </div>
    </Link>
  );
}

function Panel({ title, action, actionHref, className = '', children }: { title: string; action?: string; actionHref?: string; className?: string; children: React.ReactNode }) {
  return <section className={`dash-panel ${className}`}><div className="panel-head"><h2>{title}</h2>{action && (actionHref ? <Link href={actionHref}>{action}</Link> : <button type="button">{action}</button>)}</div>{children}</section>;
}

export default function DashboardPage() {
  const { sessao } = useAuth();
  const [dadosBase, setDadosBase] = useState<{ leads: Lead[]; oportunidades: Oportunidade[]; imoveis: Imovel[]; visitas: Visita[]; usuarios: Usuario[] } | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresFunil | null>(null);
  const [semPermissaoIndicadores, setSemPermissaoIndicadores] = useState(false);
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Lead[]>('/leads'),
      apiFetch<Oportunidade[]>('/oportunidades'),
      apiFetch<Imovel[]>('/imoveis'),
      apiFetch<Visita[]>('/visitas'),
      apiFetch<Usuario[]>('/usuarios'),
    ]).then(([leads, oportunidades, imoveis, visitas, usuarios]) => {
      setDadosBase({ leads, oportunidades, imoveis, visitas, usuarios });
    }).catch(() => setDadosBase({ leads: [], oportunidades: [], imoveis: [], visitas: [], usuarios: [] }));

    apiFetch<IndicadoresFunil>('/indicadores')
      .then(setIndicadores)
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setSemPermissaoIndicadores(true); });

    apiFetch<Tarefa[]>('/tarefas').then(setTarefas).catch(() => setTarefas([]));
  }, [sessao?.tenantId]);

  const metrics = useMemo<MetricaDashboard[] | null>(() => {
    if (!dadosBase) return null;
    const { leads, oportunidades, imoveis, visitas } = dadosBase;
    const oportunidadesAtivas = oportunidades.filter((o) => !ESTADOS_OPORTUNIDADE_ENCERRADOS.includes(o.estado));
    const oportunidadesFechadas = oportunidades.filter((o) => o.estado === 'FECHADA');
    const visitasAgendadas = visitas.filter((v) => ESTADOS_VISITA_AGENDADA.includes(v.estado));
    // Mesma lógica de IndicadoresService: soma Imovel.valorAnunciado das oportunidades FECHADA,
    // nunca infere valor de imóvel sem valorAnunciado cadastrado (fica 0, não estimado).
    const vgvFechado = oportunidadesFechadas.reduce((total, o) => {
      const imovel = imoveis.find((i) => i.id === o.imovelId);
      return total + (imovel?.valorAnunciado ?? 0);
    }, 0);
    const vgvCriadoEsteMes = oportunidadesFechadas
      .filter((o) => new Date(o.criadoEm) >= INICIO_DO_MES)
      .reduce((total, o) => total + (imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0);

    const identidade = (n: number) => n.toLocaleString('pt-BR');

    return [
      { label: 'Leads Totais', rawValue: leads.length, format: identidade, trendPercent: calcularCrescimentoMensal(leads.length, criadosNoMes(leads)), color: 'sky', icon: '/metric-leads-3d-transparent.png', href: '/leads' },
      { label: 'Negociações Ativas', rawValue: oportunidadesAtivas.length, format: identidade, trendPercent: calcularCrescimentoMensal(oportunidadesAtivas.length, criadosNoMes(oportunidadesAtivas)), color: 'cyan', icon: '/metric-negotiations-3d-transparent.png', href: '/oportunidades' },
      { label: 'Imóveis em Carteira', rawValue: imoveis.length, format: identidade, trendPercent: calcularCrescimentoMensal(imoveis.length, criadosNoMes(imoveis)), color: 'blue', icon: '/metric-properties-3d-transparent.png', href: '/imoveis' },
      { label: 'Visitas Agendadas', rawValue: visitasAgendadas.length, format: identidade, trendPercent: calcularCrescimentoMensal(visitasAgendadas.length, criadosNoMes(visitasAgendadas)), color: 'orange', icon: '/metric-visits-3d-transparent.png', href: '/visitas' },
      { label: 'Vendas Fechadas', rawValue: oportunidadesFechadas.length, format: identidade, trendPercent: calcularCrescimentoMensal(oportunidadesFechadas.length, criadosNoMes(oportunidadesFechadas)), color: 'green', icon: '/metric-sales-3d-transparent.png', href: '/oportunidades' },
      { label: 'VGV Fechado', rawValue: vgvFechado, format: formatarMoeda, trendPercent: calcularCrescimentoMensal(vgvFechado, vgvCriadoEsteMes), color: 'purple', icon: '/metric-revenue-3d-transparent.png', href: '/financeiro' },
    ];
  }, [dadosBase]);

  const serieVendas = useMemo(() => {
    if (!dadosBase) return [];
    return construirSerieVendasDoMes(dadosBase.oportunidades, dadosBase.imoveis);
  }, [dadosBase]);

  const canaisOrdenados = useMemo(() => {
    if (!indicadores) return [];
    const total = Object.values(indicadores.leadsPorCanal).reduce((soma, v) => soma + v, 0) || 1;
    return Object.entries(indicadores.leadsPorCanal)
      .sort(([, a], [, b]) => b - a)
      .map(([canal, quantidade]) => ({ canal, nome: NOMES_CANAL[canal] ?? canal, quantidade, percentual: Math.round((quantidade / total) * 100) }));
  }, [indicadores]);

  const totalLeadsPorCanal = useMemo(() => canaisOrdenados.reduce((soma, c) => soma + c.quantidade, 0), [canaisOrdenados]);

  const tarefasAbertas = useMemo(() => {
    if (!tarefas) return null;
    return tarefas
      .filter((t) => !t.concluida)
      .sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0;
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
      })
      .slice(0, 5);
  }, [tarefas]);

  const imoveisEmDestaque = useMemo(() => {
    if (!dadosBase) return [];
    return [...dadosBase.imoveis]
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      .slice(0, 3);
  }, [dadosBase]);

  const negociacoesRecentes = useMemo(() => {
    if (!dadosBase) return [];
    return [...dadosBase.oportunidades]
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      .slice(0, 5)
      .map((o) => ({ oportunidade: o, imovel: dadosBase.imoveis.find((i) => i.id === o.imovelId) }));
  }, [dadosBase]);

  const proximasVisitas = useMemo(() => {
    if (!dadosBase) return [];
    const agora = Date.now();
    return dadosBase.visitas
      .filter((v) => ESTADOS_VISITA_AGENDADA.includes(v.estado) && new Date(v.dataHora).getTime() >= agora)
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
      .slice(0, 3)
      .map((v) => {
        const oportunidade = dadosBase.oportunidades.find((o) => o.id === v.oportunidadeId);
        const imovel = oportunidade ? dadosBase.imoveis.find((i) => i.id === oportunidade.imovelId) : undefined;
        return { visita: v, imovel };
      });
  }, [dadosBase]);

  const conversaoLeads = useMemo(() => {
    if (!dadosBase || dadosBase.leads.length === 0) return null;
    const convertidos = dadosBase.leads.filter((l) => l.estado === 'CONVERTIDO').length;
    return { convertidos, total: dadosBase.leads.length, percentual: Math.round((convertidos / dadosBase.leads.length) * 1000) / 10 };
  }, [dadosBase]);

  /** Oportunidade não tem campo de corretor responsável - usa o responsavelUsuarioId do Lead de origem como proxy real (uma negociação só existe se o lead já tiver responsável). */
  const rankingCorretores = useMemo(() => {
    if (!dadosBase) return [];
    const { oportunidades, leads, imoveis, usuarios } = dadosBase;
    const porCorretor = new Map<string, { nome: string; count: number; valor: number }>();
    for (const o of oportunidades) {
      if (o.estado === 'PERDIDA') continue;
      const lead = leads.find((l) => l.id === o.leadId);
      const corretor = lead?.responsavelUsuarioId ? usuarios.find((u) => u.id === lead.responsavelUsuarioId) : undefined;
      if (!corretor) continue;
      const imovel = imoveis.find((i) => i.id === o.imovelId);
      const atual = porCorretor.get(corretor.id) ?? { nome: corretor.nome, count: 0, valor: 0 };
      atual.count += 1; atual.valor += imovel?.valorAnunciado ?? 0;
      porCorretor.set(corretor.id, atual);
    }
    return [...porCorretor.values()].sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [dadosBase]);

  return (
    <main className="dashboard">
      <div className="metric-grid">
        {(metrics ?? []).map((metric) => <MetricCard metric={metric} key={metric.label} />)}
        {metrics === null && <p style={{ color: 'var(--muted)', fontSize: 12 }}>Carregando indicadores...</p>}
      </div>

      <div className="dashboard-row dashboard-row--top">
        <Panel title="Funil de Vendas" className="funnel-panel">
          {semPermissaoIndicadores
            ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>{AVISO_SOMENTE_GESTOR}</p>
            : <CompactSalesFunnel dados={indicadores ?? undefined} />}
        </Panel>

        <Panel title="Performance de Vendas" className="performance-panel">
          <PremiumSalesPerformance serie={serieVendas} />
        </Panel>

        <Panel title="Origem dos Leads" className="source-panel">
          {semPermissaoIndicadores ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>{AVISO_SOMENTE_GESTOR}</p>
          ) : !indicadores ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Carregando...</p>
          ) : canaisOrdenados.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhum lead capturado ainda.</p>
          ) : (
            <div className="source-wrap">
              <div className="source-donut" role="img" aria-label={`${totalLeadsPorCanal} leads distribuídos por canal`}>
                <div className="source-donut__center"><strong>{totalLeadsPorCanal.toLocaleString('pt-BR')}</strong><span>Leads</span><small>total</small></div>
              </div>
              <ul className="source-list">
                {canaisOrdenados.map((c, index) => (
                  <li className={`source-list__item source-list__item--${index + 1}`} key={c.canal}>
                    <i />
                    <span><b>{c.nome}</b><small>{c.quantidade} leads</small></span>
                    <strong>{c.percentual}%</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Atividades de Hoje" action="Ver todas" actionHref="/tarefas" className="activity-panel">
          {tarefasAbertas === null ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Carregando...</p>
          ) : tarefasAbertas.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhuma tarefa em aberto.</p>
          ) : (
            <ul className="activity-list">
              {tarefasAbertas.map((tarefa, index) => {
                const tons = ['green', 'orange', 'blue', 'emerald', 'purple'];
                const atrasada = tarefa.prazo && new Date(tarefa.prazo).getTime() < Date.now();
                return (
                  <li key={tarefa.id}>
                    <Link href="/tarefas" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                      <span className={`activity-icon activity-icon--${tons[index % tons.length]} fluent`} aria-hidden="true" />
                      <div><b>{tarefa.titulo}</b><small>{atrasada ? 'Atrasada' : 'Pendente'}</small></div>
                      <time>{tarefa.prazo ? new Date(tarefa.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Sem prazo'}</time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="dashboard-row dashboard-row--middle">
        <Panel title="Mapa de Vendas e Locações" className="map-panel">
          <MapLibreSalesMap />
        </Panel>

        <div className="side-stack">
          <Panel title="Imóveis em Destaque" action="Ver todas" actionHref="/imoveis">
            {imoveisEmDestaque.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhum imóvel cadastrado ainda.</p>
            ) : (
              <div className="property-grid">
                {imoveisEmDestaque.map((imovel, i) => (
                  <Link href="/imoveis" className="featured-property-link" aria-label={`Ver imóvel em ${imovel.enderecoResumo}`} key={imovel.id}>
                    <article>
                      <div className={`property-photo photo-${i + 1}`} />
                      <small>{imovel.finalidade === 'VENDA' ? 'Venda' : imovel.finalidade === 'LOCACAO' ? 'Locação' : 'Venda/Locação'}</small>
                      <b>{imovel.enderecoResumo}</b>
                      <strong>{imovel.valorAnunciado != null ? formatarMoeda(imovel.valorAnunciado) : 'Valor a definir'}</strong>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Negociações Recentes" action="Ver todas" actionHref="/oportunidades">
            {negociacoesRecentes.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhuma negociação registrada ainda.</p>
            ) : (
              <ul className="deal-list">
                {negociacoesRecentes.map((item, i) => (
                  <li key={item.oportunidade.id}>
                    <Link href="/oportunidades" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                      <span className={`mini-photo photo-${i % 3 + 1}`} />
                      <b>{item.imovel?.enderecoResumo ?? 'Imóvel'}</b>
                      <small>{item.imovel?.valorAnunciado != null ? formatarMoeda(item.imovel.valorAnunciado) : 'Valor a definir'}</small>
                      <em>{LABEL_ESTADO_OPORTUNIDADE[item.oportunidade.estado] ?? item.oportunidade.estado}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="dashboard-row dashboard-row--bottom">
        <Panel title="Resumo Financeiro" actionHref="/financeiro" action="Ver relatório" className="bottom-card finance-panel">
          {semPermissaoIndicadores ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>{AVISO_SOMENTE_GESTOR}</p>
          ) : !indicadores ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Carregando...</p>
          ) : (
            <ul className="finance-list">
              <li><span>VGV realizado</span><b>{formatarMoeda(indicadores.vgvFechado)}</b></li>
              <li><span>Negócios fechados</span><b>{indicadores.fechamentos}</b></li>
              <li><span>Comissões cruzadas acionadas</span><b>{indicadores.comissoesCruzadasQuantidade}</b></li>
            </ul>
          )}
        </Panel>
        <Panel title="Conversão de Leads" className="bottom-card conversion-panel">
          {!conversaoLeads ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Sem leads cadastrados ainda.</p>
          ) : (
            <div className="conversion-premium">
              <div className="conversion-ring"><strong>{conversaoLeads.percentual}%</strong><small>conversão</small></div>
              <div className="conversion-copy"><b>Taxa de conversão</b><span><strong>{conversaoLeads.convertidos}</strong> convertidos de<br /><strong>{conversaoLeads.total}</strong> leads</span><Link href="/leads">Ver detalhes</Link></div>
            </div>
          )}
        </Panel>
        <Panel title="Leads por Canal" className="bottom-card channels-panel">
          {semPermissaoIndicadores ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>{AVISO_SOMENTE_GESTOR}</p>
          ) : canaisOrdenados.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>{indicadores ? 'Nenhum lead capturado ainda.' : 'Carregando...'}</p>
          ) : (
            <ul className="channel-list">
              {canaisOrdenados.map((c, index) => (
                <li className={`channel-list__item channel-list__item--${index + 1}`} key={c.canal}>
                  <div><span>{c.nome}</span><b>{c.percentual}% <em>({c.quantidade})</em></b></div>
                  <i><u style={{ width: `${c.percentual * 2.25}%` }} /></i>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top Corretores" className="bottom-card brokers-panel">
          {rankingCorretores.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhuma negociação com corretor responsável ainda.</p>
          ) : (
            <ol className="broker-ranking">{rankingCorretores.map((corretor, index) => {
              const iniciais = corretor.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
              return <li key={corretor.nome}><span className="broker-position">{index + 1}</span><i className={`broker-avatar broker-avatar--${index + 1}`}>{iniciais}</i><b>{corretor.nome}</b><strong>{formatarMoeda(corretor.valor)}</strong></li>;
            })}</ol>
          )}
        </Panel>
        <Panel title="Próximas Visitas" action="Ver agenda" actionHref="/visitas" className="bottom-card visits-panel">
          {proximasVisitas.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Nenhuma visita agendada.</p>
          ) : (
            <ul className="visit-schedule">
              {proximasVisitas.map((item, i) => (
                <li key={item.visita.id}>
                  <i className={`visit-thumb photo-${i + 1}`} />
                  <time>{new Date(item.visita.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(item.visita.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
                  <span><b>{item.imovel?.enderecoResumo ?? 'Imóvel'}</b><small>{item.visita.estado === 'CONFIRMADA' ? 'Confirmada' : 'Agendada'}</small></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}
