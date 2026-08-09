'use client';

import Link from 'next/link';
import type { IndicadoresFunil } from '@crm/shared';
import type { CSSProperties } from 'react';
import '../app/funnel-v2.css';

const FUNNEL_STAGES = [
  { id: '01', name: 'Novos Leads', value: 1248, percent: 100, color: '#2f67ff', dark: '#062a87', width: 100, icon: 'leads' },
  { id: '02', name: 'Qualificados', value: 876, percent: 70, color: '#168cff', dark: '#024f9d', width: 91, icon: 'qualified' },
  { id: '03', name: 'Visitas', value: 482, percent: 39, color: '#15c6d6', dark: '#006d82', width: 82, icon: 'visits' },
  { id: '04', name: 'Propostas', value: 187, percent: 15, color: '#ff9d0b', dark: '#a95100', width: 72, icon: 'proposal' },
  { id: '05', name: 'Negociação', value: 74, percent: 6, color: '#8d4ce8', dark: '#3b146f', width: 62, icon: 'deal' },
  { id: '06', name: 'Fechados', value: 28, percent: 2, color: '#59bb2c', dark: '#0c5e18', width: 53, icon: 'closed' },
] as const;

type FunnelStage = (typeof FUNNEL_STAGES)[number];

function FunnelIcon({ name }: { name: FunnelStage['icon'] }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'leads') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M17 11h6"/></svg>;
  if (name === 'qualified') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="m17 12 2 2 4-5"/></svg>;
  if (name === 'visits') return <svg {...common}><path d="M4 21V5l8-3v19M12 8h7v13M2 21h20"/><path d="M8 7h.01M8 11h.01M8 15h.01M16 12h.01M16 16h.01"/></svg>;
  if (name === 'proposal') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8l6-6V8z"/><path d="M14 2v6h6M8 13h7M8 17h4M15 19l4-4"/></svg>;
  if (name === 'deal') return <svg {...common}><path d="m8 12 3 3a2 2 0 0 0 3 0l5-5"/><path d="m2 12 5-5 4 1 2-1 4 1 5 4-7 7a3 3 0 0 1-4 0z"/></svg>;
  return <svg {...common}><path d="M21 2 9 14"/><circle cx="7" cy="16" r="5"/><path d="m14 7 3 3M16 5l3 3M4.5 18.5l5-5"/></svg>;
}

function percentual(valor: number, base: number): number {
  return base > 0 ? Math.min(100, Math.round((valor / base) * 100)) : 0;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

export function SalesFunnelCard({ dados }: { dados?: IndicadoresFunil }) {
  const negociacoes = dados
    ? dados.oportunidadesPorEstagio.EM_CONTRAPROPOSTA
      + dados.oportunidadesPorEstagio.RESERVA
      + dados.oportunidadesPorEstagio.DOCUMENTACAO_CONCLUIDA
    : FUNNEL_STAGES[4].value;
  const base = dados?.leadsDistribuidos ?? FUNNEL_STAGES[0].value;
  const valores = dados
    ? [dados.leadsDistribuidos, dados.leadsEmAtendimento, dados.visitasRealizadas, dados.propostasEnviadas, negociacoes, dados.fechamentos]
    : FUNNEL_STAGES.map((stage) => stage.value);
  const stages = FUNNEL_STAGES.map((stage, index) => ({
    ...stage,
    value: valores[index],
    percent: index === 0 ? (base > 0 ? 100 : 0) : percentual(valores[index], base),
  }));
  const conversao = base > 0 ? (valores[5] / base) * 100 : 0;
  const conversaoRotulo = conversao.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <section className="sales-funnel-card" aria-labelledby="sales-funnel-title">
      <header className="sales-funnel-card__header">
        <div>
          <h2 id="sales-funnel-title">Funil de Vendas <span title="Percentuais calculados sobre os novos leads">i</span></h2>
          <p>Acompanhe o progresso dos seus leads em cada etapa do funil.</p>
        </div>
        <div className="sales-funnel-card__actions">
          <button type="button" aria-label="Selecionar período"><span aria-hidden="true">▣</span>Este mês<i aria-hidden="true">⌄</i></button>
          <button type="button"><span aria-hidden="true">▽</span>Filtros</button>
        </div>
      </header>

      <div className="sales-funnel-card__body">
        <ol className="sales-funnel-card__stages" aria-label="Etapas do funil de vendas">
          {stages.map((stage) => {
            const style = { '--stage-color': stage.color, '--stage-dark': stage.dark, '--stage-width': `${stage.width}%` } as CSSProperties;
            return (
              <li key={stage.id} style={style}>
                <div className="sales-funnel-card__timeline" aria-hidden="true"><span>{stage.id}</span><i /></div>
                <div className="sales-funnel-card__stage">
                  <div className="sales-funnel-card__stage-copy">
                    <span className="sales-funnel-card__stage-icon"><FunnelIcon name={stage.icon} /></span>
                    <span><b>{stage.name}</b><small>{formatarNumero(stage.value)} leads</small></span>
                  </div>
                  <strong>{stage.percent}%</strong>
                </div>
              </li>
            );
          })}
        </ol>

        <aside className="sales-funnel-card__side">
          <section className="sales-funnel-card__conversion">
            <div className="sales-funnel-card__ring" aria-hidden="true"><span>⌁</span></div>
            <div><h3>Conversão total</h3><strong>{conversaoRotulo}%</strong><p>de todos os leads</p></div>
          </section>
          <section className="sales-funnel-card__summary">
            <h3>Resumo do Funil</h3>
            <ul>
              {stages.map((stage) => (
                <li key={stage.id} style={{ '--stage-color': stage.color } as CSSProperties}>
                  <div><i /><span>{stage.name}</span><strong>{formatarNumero(stage.value)}</strong><em>({stage.percent}%)</em></div>
                  <span><i style={{ width: `${stage.percent}%` }} /></span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <footer className="sales-funnel-card__footer">
        <section className="sales-funnel-card__tip">
          <span aria-hidden="true">⌂</span>
          <div><b>Dica para aumentar conversão</b><p>Invista no acompanhamento rápido dos leads qualificados e no agendamento de visitas.</p><Link href="/leads">Ver dicas</Link></div>
        </section>
        <section className="sales-funnel-card__metrics" aria-label="Indicadores do funil">
          <div><span aria-hidden="true">◎</span><small>Leads em atendimento</small><strong>{formatarNumero(valores[1])}</strong><em>Em acompanhamento</em></div>
          <div><span aria-hidden="true">▦</span><small>Visitas realizadas</small><strong>{formatarNumero(valores[2])}</strong><em>No funil atual</em></div>
          <div><span aria-hidden="true">▤</span><small>Propostas enviadas</small><strong>{formatarNumero(valores[3])}</strong><em>Em oportunidades</em></div>
          <div><span aria-hidden="true">♕</span><small>Negócios fechados</small><strong>{formatarNumero(valores[5])}</strong><em>Conversão de {conversaoRotulo}%</em></div>
        </section>
      </footer>
    </section>
  );
}
