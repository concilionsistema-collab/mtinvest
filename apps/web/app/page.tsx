'use client';

import Link from 'next/link';
import { MapLibreSalesMap } from '../components/maplibre-sales-map';
import { PremiumSalesFunnel, PremiumSalesPerformance } from '../components/dashboard-sales-widgets';

const metrics = [
  ['\uE77B', 'Leads Totais', '1.248', '↗ 18% vs mês anterior', 'purple'],
  ['\uE81C', 'Negociações Ativas', '312', '↗ 12% vs mês anterior', 'blue'],
  ['\uE821', 'Imóveis em Carteira', '356', '↗ 8% vs mês anterior', 'cyan'],
  ['\uE787', 'Visitas Agendadas', '86', '↗ 15% vs mês anterior', 'orange'],
  ['\uE8FB', 'Vendas Fechadas', '28', '↗ 27% vs mês anterior', 'green'],
  ['\uEAFD', 'VGV Este Mês', 'R$ 4.850.000', '↗ 32% vs mês anterior', 'gold'],
];

const activities = [
  ['\uE717', 'green', 'Ligar para Maria Silva', 'Contato inicial', '09:00'],
  ['\uE724', 'orange', 'Enviar proposta Apto. Jardins', 'Proposta aguardando', '10:30'],
  ['\uE787', 'blue', 'Visita agendada - Cliente Pedro', 'Apartamento 1201', '14:00'],
  ['\uE8BD', 'emerald', 'Follow-up João Souza', 'Negociação em andamento', '15:30'],
  ['\uE8A5', 'purple', 'Assinar contrato - Apto. 502', 'Documentação', '16:00'],
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
  return (
    <main className="dashboard">
      <div className="metric-grid">
        {metrics.map(([icon, label, value, delta, color]) => <article className={`metric metric--${color}`} key={label}><span className="metric-icon fluent" aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{delta}</em></div></article>)}
      </div>

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

        <Panel title="Atividades de Hoje" action="Ver todas" className="activity-panel">
          <ul className="activity-list">{activities.map(([icon,tone,title,sub,time])=><li key={title}><span className={`activity-icon activity-icon--${tone} fluent`} aria-hidden="true">{icon}</span><div><b>{title}</b><small>{sub}</small></div><time>{time}</time></li>)}</ul>
        </Panel>
      </div>

      <div className="dashboard-row dashboard-row--middle">
        <Panel title="Mapa de Vendas" className="map-panel">
          <div className="map-toolbar"><small>Visualização dos imóveis e negociações por localização</small><div><button>Todos os imóveis⌄</button><span>○ Disponível</span><span>○ Em negociação</span><span>○ Vendido</span></div></div>
          <div className="map-stage">
            <MapLibreSalesMap />
          </div>
        </Panel>

        <div className="side-stack">
          <Panel title="Imóveis em Destaque" action="Ver todas" actionHref="/imoveis#lista-imoveis"><div className="property-grid">{properties.map((p,i)=><Link href={`/imoveis#imovel-${propertyTargets[i]}`} className="featured-property-link" aria-label={`Ver ${p[0]} em ${p[1]}`} key={p[1]}><article><div className={`property-photo photo-${i+1}`}/><small>{p[0]}</small><b>{p[1]}</b><strong>{p[2]}</strong><span>{p[3]}</span></article></Link>)}</div></Panel>
          <Panel title="Negociações Recentes" action="Ver todas"><ul className="deal-list">{properties.concat([['Apartamento','Apto. Moema','R$ 1.250.000','Proposta'],['Casa','Casa Alphaville','R$ 3.200.000','Negociação']]).map((p,i)=><li key={p[1]}><span className={`mini-photo photo-${i%3+1}`}/><b>{p[1]}</b><small>{p[2]}</small><em>{i%2?'Negociação':'Proposta'}</em></li>)}</ul></Panel>
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
