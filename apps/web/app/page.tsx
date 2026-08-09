'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Imovel, Lead, Oportunidade, Visita } from '@crm/shared';
import { useAuth } from '../components/auth-context';
import { apiFetch } from '../lib/api';
import { MapLibreSalesMap } from '../components/maplibre-sales-map';
import { PremiumSalesFunnel, PremiumSalesPerformance } from '../components/dashboard-sales-widgets';
import { AIInsightsPanel } from '../components/ai-insights-panel';

const ESTADOS_OPORTUNIDADE_ENCERRADOS = ['FECHADA', 'PERDIDA'];
const ESTADOS_VISITA_AGENDADA = ['AGENDADA', 'CONFIRMADA'];

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

const activities = [
  ['', 'green', 'Ligar para Maria Silva', 'Contato inicial', '09:00'],
  ['', 'orange', 'Enviar proposta Apto. Jardins', 'Proposta aguardando', '10:30'],
  ['', 'blue', 'Visita agendada - Cliente Pedro', 'Apartamento 1201', '14:00'],
  ['', 'emerald', 'Follow-up João Souza', 'Negociação em andamento', '15:30'],
  ['', 'purple', 'Assinar contrato - Apto. 502', 'Documentação', '16:00'],
];

const leadSources = [
  ['Site / Portal', 38, '474'],
  ['Indicação', 28, '349'],
  ['Redes Sociais', 18, '225'],
  ['Campanhas', 10, '125'],
  ['Outros', 6, '75'],
];

const properties = [
  ['Apartamento', 'Jardins', 'R$ 2.450.000', '120m² | 3 dorm.'],
  ['Cobertura', 'Itaim Bibi', 'R$ 5.800.000', '280m² | 4 dorm.'],
  ['Studio', 'Vila Madalena', 'R$ 450.000', '45m² | 1 dorm.'],
];
const propertyTargets = ['AP-101', 'COB-201', 'ST-401'];

function Panel({ title, action, actionHref, className = '', children }: { title: string; action?: string; actionHref?: string; className?: string; children: React.ReactNode }) {
  return <section className={`dash-panel ${className}`}><div className="panel-head"><h2>{title}</h2>{action && (actionHref ? <Link href={actionHref}>{action}</Link> : <button type="button">{action}</button>)}</div>{children}</section>;
}

export default function DashboardPage() {
  const { sessao } = useAuth();
  const [metrics, setMetrics] = useState<MetricaDashboard[] | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Lead[]>('/leads'),
      apiFetch<Oportunidade[]>('/oportunidades'),
      apiFetch<Imovel[]>('/imoveis'),
      apiFetch<Visita[]>('/visitas'),
    ]).then(([leads, oportunidades, imoveis, visitas]) => {
      const oportunidadesAtivas = oportunidades.filter((o) => !ESTADOS_OPORTUNIDADE_ENCERRADOS.includes(o.estado));
      const oportunidadesFechadas = oportunidades.filter((o) => o.estado === 'FECHADA');
      const visitasAgendadas = visitas.filter((v) => ESTADOS_VISITA_AGENDADA.includes(v.estado));
      // Mesma lógica de IndicadoresService: soma Imovel.valorAnunciado das oportunidades FECHADA,
      // nunca infere valor de imóvel sem valorAnunciado cadastrado (fica 0, não estimado).
      const vgvFechado = oportunidadesFechadas.reduce((total, o) => {
        const imovel = imoveis.find((i) => i.id === o.imovelId);
        return total + (imovel?.valorAnunciado ?? 0);
      }, 0);
      // VGV não tem "criadoEm" próprio - usa a data das oportunidades FECHADA que compõem a soma.
      const vgvCriadoEsteMes = oportunidadesFechadas
        .filter((o) => new Date(o.criadoEm) >= INICIO_DO_MES)
        .reduce((total, o) => total + (imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0);

      const identidade = (n: number) => n.toLocaleString('pt-BR');

      setMetrics([
        { label: 'Leads Totais', rawValue: leads.length, format: identidade, trendPercent: calcularCrescimentoMensal(leads.length, criadosNoMes(leads)), color: 'sky', icon: '/metric-leads-3d-transparent.png', href: '/leads' },
        { label: 'Negociações Ativas', rawValue: oportunidadesAtivas.length, format: identidade, trendPercent: calcularCrescimentoMensal(oportunidadesAtivas.length, criadosNoMes(oportunidadesAtivas)), color: 'cyan', icon: '/metric-negotiations-3d-transparent.png', href: '/oportunidades' },
        { label: 'Imóveis em Carteira', rawValue: imoveis.length, format: identidade, trendPercent: calcularCrescimentoMensal(imoveis.length, criadosNoMes(imoveis)), color: 'blue', icon: '/metric-properties-3d-transparent.png', href: '/imoveis' },
        { label: 'Visitas Agendadas', rawValue: visitasAgendadas.length, format: identidade, trendPercent: calcularCrescimentoMensal(visitasAgendadas.length, criadosNoMes(visitasAgendadas)), color: 'orange', icon: '/metric-visits-3d-transparent.png', href: '/visitas' },
        { label: 'Vendas Fechadas', rawValue: oportunidadesFechadas.length, format: identidade, trendPercent: calcularCrescimentoMensal(oportunidadesFechadas.length, criadosNoMes(oportunidadesFechadas)), color: 'green', icon: '/metric-sales-3d-transparent.png', href: '/oportunidades' },
        { label: 'VGV Fechado', rawValue: vgvFechado, format: formatarMoeda, trendPercent: calcularCrescimentoMensal(vgvFechado, vgvCriadoEsteMes), color: 'purple', icon: '/metric-revenue-3d-transparent.png', href: '/financeiro' },
      ]);
    }).catch(() => setMetrics([]));
  }, [sessao?.tenantId]);

  return (
    <main className="dashboard">
      <div className="metric-grid">
        {(metrics ?? []).map((metric) => <MetricCard metric={metric} key={metric.label} />)}
        {metrics === null && <p style={{ color: 'var(--muted)', fontSize: 12 }}>Carregando indicadores...</p>}
      </div>

      <AIInsightsPanel />

      <div className="dashboard-row dashboard-row--top">
        <Panel title="Funil de Vendas" className="funnel-panel">
          <PremiumSalesFunnel />
        </Panel>

        <Panel title="Performance de Vendas" action="Este mês⌄" className="performance-panel">
          <PremiumSalesPerformance />
        </Panel>

        <Panel title="Origem dos Leads" className="source-panel">
          <div className="source-wrap">
            <div className="source-donut" role="img" aria-label="1.248 leads distribuídos por cinco canais">
              <div className="source-donut__center"><strong>1.248</strong><span>Leads</span><small>este mês</small></div>
            </div>
            <ul className="source-list">
              {leadSources.map(([label, percentage, count], index) => (
                <li className={`source-list__item source-list__item--${index + 1}`} key={String(label)}>
                  <i />
                  <span><b>{label}</b><small>{count} leads</small></span>
                  <strong>{percentage}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="Atividades de Hoje" action="Ver todas" actionHref="/tarefas" className="activity-panel">
          <ul className="activity-list">
            {activities.map(([icon,tone,title,sub,time]) => (
              <li key={title}>
                <Link href="/tarefas" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                  <span className={`activity-icon activity-icon--${tone} fluent`} aria-hidden="true">{icon}</span>
                  <div><b>{title}</b><small>{sub}</small></div>
                  <time>{time}</time>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="dashboard-row dashboard-row--middle">
        <Panel title="Mapa de Vendas e Locações" className="map-panel">
          <MapLibreSalesMap />
        </Panel>

        <div className="side-stack">
          <Panel title="Imóveis em Destaque" action="Ver todas" actionHref="/imoveis#lista-imoveis"><div className="property-grid">{properties.map((p,i)=><Link href={`/imoveis#imovel-${propertyTargets[i]}`} className="featured-property-link" aria-label={`Ver ${p[0]} em ${p[1]}`} key={p[1]}><article style={{position:'relative'}}>{i === 0 && <span className="hot-badge">Em Alta</span>}<div className={`property-photo photo-${i+1}`}/><small>{p[0]}</small><b>{p[1]}</b><strong>{p[2]}</strong><span>{p[3]}</span></article></Link>)}</div></Panel>
          <Panel title="Negociações Recentes" action="Ver todas" actionHref="/oportunidades">
            <ul className="deal-list">
              {properties.concat([['Apartamento','Apto. Moema','R$ 1.250.000','Proposta'],['Casa','Casa Alphaville','R$ 3.200.000','Negociação']]).map((p,i)=>(
                <li key={p[1]}>
                  <Link href="/oportunidades" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                    <span className={`mini-photo photo-${i%3+1}`}/>
                    <b>{p[1]}</b>
                    <small>{p[2]}</small>
                    <em>{i%2?'Negociação':'Proposta'}</em>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="dashboard-row dashboard-row--bottom">
        <Panel title="Resumo Financeiro" action="Este mês⌄" className="bottom-card finance-panel">
          <ul className="finance-list"><li><span>VGV Previsto</span><b>R$ 6.200.000</b></li><li><span>VGV Realizado</span><b>R$ 4.850.000</b></li><li><span>Comissões</span><b>R$ 242.500</b></li><li><span>A receber</span><b>R$ 1.125.000</b></li></ul>
          <div className="finance-progress"><div><i /></div><small>78% do VGV previsto</small></div><a>Ver relatório financeiro</a>
        </Panel>
        <Panel title="Conversão de Leads" action="Este mês⌄" className="bottom-card conversion-panel">
          <div className="conversion-premium"><div className="conversion-ring"><strong>23%</strong><small>conversão</small></div><div className="conversion-copy"><b>Taxa de conversão</b><span><strong>298</strong> fechados de<br/><strong>1.248</strong> leads</span><a>Ver detalhes</a></div></div>
        </Panel>
        <Panel title="Leads por Canal" action="Este mês⌄" className="bottom-card channels-panel">
          <ul className="channel-list">{leadSources.map(([name, value, count], index)=><li className={`channel-list__item channel-list__item--${index + 1}`} key={String(name)}><div><span>{name}</span><b>{value}% <em>({count})</em></b></div><i><u style={{width:`${Number(value) * 2.25}%`}} /></i></li>)}</ul>
        </Panel>
        <Panel title="Top Corretores" action="Este mês⌄" className="bottom-card brokers-panel">
          <ol className="broker-ranking">{[['JC','João Corretor','R$ 285.000'],['AP','Ana Paula','R$ 195.000'],['CM','Carlos Mendes','R$ 142.000'],['JA','Juliana Alves','R$ 98.500'],['PA','Pedro Augusto','R$ 76.000']].map(([initials,name,total],index)=><li key={name}><span className="broker-position">{index + 1}</span><i className={`broker-avatar broker-avatar--${index + 1}`}>{initials}</i><b>{name}</b><strong>{total}</strong></li>)}</ol>
        </Panel>
        <Panel title="Próximas Visitas" action="Ver agenda" className="bottom-card visits-panel">
          <ul className="visit-schedule"><li><i className="visit-thumb photo-1"/><time>09:30</time><span><b>Apartamento 1201 - Jardins</b><small>Cliente: Maria Silva</small></span></li><li><i className="visit-thumb photo-2"/><time>11:00</time><span><b>Cobertura Itaim</b><small>Cliente: Carlos Eduardo</small></span></li><li><i className="visit-thumb photo-3"/><time>14:30</time><span><b>Casa Alphaville</b><small>Cliente: Fernanda Lima</small></span></li></ul>
        </Panel>
      </div>
    </main>
  );
}
