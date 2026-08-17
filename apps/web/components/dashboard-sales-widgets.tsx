'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { IndicadoresFunil } from '@crm/shared';
import { useTheme } from './theme-context';

import '../app/funnel-v2.css';

const ETAPAS_SVG = [
  { id: '01', nome: 'Novos Leads', valor: '1.248', percentual: '100%', baseColor: '#0044cc', topColor: '#021a40', midColor: '#3388ff', sideColor: '#052c65', y: 20, tw: 380, bw: 330, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
  { id: '02', nome: 'Qualificados', valor: '876', percentual: '70%', baseColor: '#0066dd', topColor: '#022452', midColor: '#3399ff', sideColor: '#063d80', y: 75, tw: 345, bw: 290, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg> },
  { id: '03', nome: 'Visitas', valor: '482', percentual: '39%', baseColor: '#00aaaa', topColor: '#003333', midColor: '#33dddd', sideColor: '#006666', y: 130, tw: 305, bw: 250, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg> },
  { id: '04', nome: 'Propostas', valor: '187', percentual: '15%', baseColor: '#cc7700', topColor: '#402400', midColor: '#ffaa33', sideColor: '#804a00', y: 185, tw: 265, bw: 210, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> },
  { id: '05', nome: 'Negociação', valor: '74', percentual: '6%', baseColor: '#6611aa', topColor: '#200540', midColor: '#9944ff', sideColor: '#400870', y: 240, tw: 225, bw: 170, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12l2.5-2.5a3.5 3.5 0 0 1 5 0L12 12m10 0l-2.5-2.5a3.5 3.5 0 0 0-5 0L12 12m-6 6h12"></path></svg> },
  { id: '06', nome: 'Fechados', valor: '28', percentual: '2%', baseColor: '#11aa11', topColor: '#053305', midColor: '#44ff44', sideColor: '#0a660a', y: 295, tw: 185, bw: 130, icone: <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg> }
];

export function PremiumSalesFunnel() {
  return (
    <div className="premium-funnel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="premium-funnel__summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 15px', borderRadius: '8px' }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Conversão total</span>
        <b style={{ fontSize: '16px', color: '#fff' }}>2,2%</b>
      </div>
      <div style={{ width: '100%', height: 'auto', aspectRatio: '450 / 380' }}>
        <svg viewBox="0 0 450 380" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            {ETAPAS_SVG.map((etapa, i) => (
              <g key={`defs-${i}`}>
                <linearGradient id={`grad_front_${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={etapa.sideColor} />
                  <stop offset="15%" stopColor={etapa.baseColor} />
                  <stop offset="50%" stopColor={etapa.midColor} />
                  <stop offset="85%" stopColor={etapa.baseColor} />
                  <stop offset="100%" stopColor={etapa.sideColor} />
                </linearGradient>
                <linearGradient id={`grad_top_${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={etapa.topColor} />
                  <stop offset="100%" stopColor={etapa.baseColor} />
                </linearGradient>
              </g>
            ))}
          </defs>
          
          {/* Render back-to-front (index 5 to 0) */}
          {[...ETAPAS_SVG].reverse().map((etapa) => {
            const i = parseInt(etapa.id) - 1;
            const cx = 240;
            return (
              <g key={etapa.id}>
                {/* 3D Shapes */}
                <path d={`M ${cx - etapa.tw/2},${etapa.y} L ${cx + etapa.tw/2},${etapa.y} L ${cx + etapa.bw/2},${etapa.y + 65} A ${etapa.bw/2},15 0 0,1 ${cx - etapa.bw/2},${etapa.y + 65} Z`} fill={`url(#grad_front_${i})`} />
                <ellipse cx={cx} cy={etapa.y} rx={etapa.tw/2} ry="15" fill={`url(#grad_top_${i})`} stroke={etapa.midColor} strokeWidth="1" />
                <path d={`M ${cx - etapa.tw/2},${etapa.y} A ${etapa.tw/2},15 0 0,0 ${cx + etapa.tw/2},${etapa.y}`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                
                {/* Timeline Number */}
                <circle cx="25" cy={etapa.y + 32.5} r="14" fill="#0f151f" stroke={etapa.baseColor} strokeWidth="1.5" />
                <text x="25" y={etapa.y + 36.5} fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">{etapa.id}</text>
                {i < 5 && <line x1="25" y1={etapa.y + 46.5} x2="25" y2={ETAPAS_SVG[i+1].y + 18.5} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />}
                
                {/* Content Overlay */}
                <foreignObject x={cx - etapa.tw/2 + 10} y={etapa.y} width={etapa.tw - 20} height="65">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', padding: '0 15px', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}>
                        {etapa.icone}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <b style={{ fontSize: '14px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{etapa.nome}</b>
                        <span style={{ fontSize: '11px', opacity: 0.8, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{etapa.valor} leads</span>
                      </div>
                    </div>
                    <strong style={{ fontSize: '16px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{etapa.percentual}</strong>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const NOMES_ETAPA_COMPACTA = ['Novos Leads', 'Qualificados', 'Visitas', 'Propostas', 'Negociação', 'Fechados'];

interface EtapaFunilCompacto {
  id: string;
  nome: string;
  valor: number;
  percentual: number;
  icone: JSX.Element;
}

/** Mesmo cálculo de SalesFunnelCard (components/sales-funnel-card.tsx) — mantém as duas telas consistentes. */
function construirEtapasReais(dados: IndicadoresFunil): EtapaFunilCompacto[] {
  const negociacoes = dados.oportunidadesPorEstagio.EM_CONTRAPROPOSTA
    + dados.oportunidadesPorEstagio.RESERVA
    + dados.oportunidadesPorEstagio.DOCUMENTACAO_CONCLUIDA;
  const base = dados.leadsDistribuidos;
  const valores = [
    dados.leadsDistribuidos,
    dados.leadsEmAtendimento,
    dados.visitasRealizadas,
    dados.propostasEnviadas,
    negociacoes,
    dados.fechamentos,
  ];
  return NOMES_ETAPA_COMPACTA.map((nome, indice) => ({
    id: String(indice + 1).padStart(2, '0'),
    nome,
    valor: valores[indice],
    percentual: indice === 0 ? (base > 0 ? 100 : 0) : (base > 0 ? Math.round((valores[indice] / base) * 100) : 0),
    icone: ETAPAS_SVG[indice].icone,
  }));
}

/** dados=undefined cobre "carregando" e "sem permissão" - nunca cai de volta pra número inventado. */
export function CompactSalesFunnel({ dados }: { dados?: IndicadoresFunil }) {
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  if (!dados) {
    return <p style={{ color: 'var(--muted)', fontSize: 11, padding: '10px 2px' }}>Sem dados de funil disponíveis.</p>;
  }

  const etapas = construirEtapasReais(dados);
  const etapaAtiva = indiceAtivo === null ? null : etapas[indiceAtivo];
  const conversaoTotal = etapas[0].valor > 0 ? Math.round((etapas[5].valor / etapas[0].valor) * 1000) / 10 : 0;

  return (
    <div className="compact-sales-funnel">
      <div className="compact-sales-funnel__summary" aria-live="polite">
        <span key={`label-${indiceAtivo ?? 'conversion'}`}>
          {etapaAtiva ? etapaAtiva.nome : 'Conversão total'}
        </span>
        <b key={`value-${indiceAtivo ?? 'conversion'}`}>
          {etapaAtiva ? `${etapaAtiva.valor.toLocaleString('pt-BR')} · ${etapaAtiva.percentual}%` : `${conversaoTotal.toLocaleString('pt-BR')}%`}
        </b>
      </div>
      <ol aria-label="Resumo do funil de vendas">
        {etapas.map((etapa, indice) => (
          <li
            className={indiceAtivo === indice ? 'compact-sales-funnel__stage--active' : ''}
            key={etapa.id}
            style={{
              // Piso de 55% (nao 18%): .compact-sales-funnel__layer tem largura=var(--compact-width)
              // e o texto (nome + "X leads") usa overflow:hidden/ellipsis - com poucos leads reais
              // o percentual de etapas avancadas cai bem abaixo de 55% e a barra fica estreita demais
              // pro texto caber, sumindo visualmente (o numero em si continua exato, so a largura da
              // barra e decorativa a partir daqui).
              '--compact-width': `${Math.min(100, Math.max(55, etapa.percentual))}%`,
              '--compact-order': indice,
            } as CSSProperties}
          >
            <span className="compact-sales-funnel__marker" aria-hidden="true">{etapa.id}</span>
            <button
              className="compact-sales-funnel__layer"
              type="button"
              aria-label={`${etapa.nome}: ${etapa.valor.toLocaleString('pt-BR')}, ${etapa.percentual}%. Mostrar detalhes`}
              aria-pressed={indiceAtivo === indice}
              onClick={() => setIndiceAtivo((atual) => atual === indice ? null : indice)}
            >
              <span className="compact-sales-funnel__icon" aria-hidden="true">{etapa.icone}</span>
              <span className="compact-sales-funnel__copy">
                <b>{etapa.nome}</b>
                <small>{etapa.valor.toLocaleString('pt-BR')} leads</small>
              </span>
              <strong>{etapa.percentual}%</strong>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface PontoVendasDia {
  dia: number;
  valor: number;
}

function formatarValorEixo(valor: number): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(valor % 1_000_000 === 0 ? 0 : 1)}M`;
  if (valor >= 1_000) return `${Math.round(valor / 1_000)}K`;
  return String(Math.round(valor));
}

/**
 * Acumulado real de VGV fechado dia a dia no mês corrente (ver
 * construirSerieVendasDoMes em app/page.tsx) - sem "Meta" comparativa, porque
 * não existe meta/target de vendas cadastrado em nenhuma entidade do sistema
 * (o "Meta do mês" do card lateral do menu é decorativo, não um dado real).
 */
export function PremiumSalesPerformance({ serie }: { serie: PontoVendasDia[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [indiceAtivo, setIndiceAtivo] = useState(Math.max(0, serie.length - 1));
  const { tema } = useTheme();

  useEffect(() => {
    setIndiceAtivo(Math.max(0, serie.length - 1));
  }, [serie.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || serie.length === 0) return;
    const valores = serie.map((ponto) => ponto.valor);

    function desenhar() {
      if (!canvas) return;
      const caixa = canvas.getBoundingClientRect();
      const largura = Math.max(300, caixa.width);
      const altura = Math.max(190, caixa.height);
      const densidade = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(largura * densidade);
      canvas.height = Math.round(altura * densidade);

      const contexto = canvas.getContext('2d');
      if (!contexto) return;
      const contextoSeguro = contexto;
      const estilos = getComputedStyle(document.documentElement);
      const primaria = estilos.getPropertyValue('--primary').trim() || '#3B82F6';
      const textoSecundario = estilos.getPropertyValue('--text-secondary').trim() || '#94A3B8';
      const borda = estilos.getPropertyValue('--border').trim() || '#323845';
      const comAlpha = (hex: string, alpha: number) => {
        const valor = hex.replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(valor)) return hex;
        const numero = Number.parseInt(valor, 16);
        return `rgba(${(numero >> 16) & 255},${(numero >> 8) & 255},${numero & 255},${alpha})`;
      };
      contexto.setTransform(densidade, 0, 0, densidade, 0, 0);
      contexto.clearRect(0, 0, largura, altura);

      const margem = { esquerda: 45, direita: 12, topo: 13, inferior: 27 };
      const areaLargura = largura - margem.esquerda - margem.direita;
      const areaAltura = altura - margem.topo - margem.inferior;
      const n = serie.length;
      const x = (indice: number) => margem.esquerda + (n <= 1 ? areaLargura : (indice / (n - 1)) * areaLargura);
      const teto = Math.max(...valores, 1) * 1.15;
      const y = (valor: number) => margem.topo + areaAltura - (valor / teto) * areaAltura;

      contexto.font = '11px Inter, Segoe UI, sans-serif';
      contexto.textAlign = 'right';
      contexto.textBaseline = 'middle';
      const niveis = 5;
      for (let nivel = 0; nivel <= niveis; nivel += 1) {
        const valorNivel = (teto / niveis) * nivel;
        const posicaoY = y(valorNivel);
        contexto.strokeStyle = comAlpha(borda, nivel === 0 ? .72 : .42);
        contexto.lineWidth = 1;
        contexto.setLineDash(nivel === 0 ? [] : [3, 5]);
        contexto.beginPath();
        contexto.moveTo(margem.esquerda, posicaoY);
        contexto.lineTo(largura - margem.direita, posicaoY);
        contexto.stroke();
        contexto.fillStyle = textoSecundario;
        contexto.fillText(nivel === 0 ? '0' : formatarValorEixo(valorNivel), margem.esquerda - 8, posicaoY);
      }

      const indicesRotulo = n <= 6 ? serie.map((_, indice) => indice) : [0, Math.round((n - 1) / 2), n - 1];
      indicesRotulo.forEach((indice) => {
        const posicaoX = x(indice);
        contexto.strokeStyle = comAlpha(borda, .34);
        contexto.setLineDash([3, 6]);
        contexto.beginPath();
        contexto.moveTo(posicaoX, margem.topo);
        contexto.lineTo(posicaoX, altura - margem.inferior);
        contexto.stroke();
        contexto.fillStyle = textoSecundario;
        contexto.textAlign = 'center';
        contexto.fillText(String(serie[indice].dia).padStart(2, '0'), posicaoX, altura - 9);
      });

      function tracar(valoresLinha: number[]) {
        contextoSeguro.beginPath();
        contextoSeguro.moveTo(x(0), y(valoresLinha[0]));
        if (valoresLinha.length === 1) {
          contextoSeguro.lineTo(x(0) + 0.5, y(valoresLinha[0]));
          return;
        }
        for (let indice = 1; indice < valoresLinha.length; indice += 1) {
          const anteriorX = x(indice - 1);
          const anteriorY = y(valoresLinha[indice - 1]);
          const atualX = x(indice);
          const atualY = y(valoresLinha[indice]);
          const meioX = (anteriorX + atualX) / 2;
          contextoSeguro.quadraticCurveTo(anteriorX, anteriorY, meioX, (anteriorY + atualY) / 2);
        }
        contextoSeguro.lineTo(x(valoresLinha.length - 1), y(valoresLinha[valoresLinha.length - 1]));
      }

      const gradiente = contexto.createLinearGradient(0, margem.topo, 0, altura - margem.inferior);
      gradiente.addColorStop(0, comAlpha(primaria, .42));
      gradiente.addColorStop(0.62, comAlpha(primaria, .16));
      gradiente.addColorStop(1, comAlpha(primaria, .01));
      tracar(valores);
      contexto.lineTo(x(valores.length - 1), altura - margem.inferior);
      contexto.lineTo(x(0), altura - margem.inferior);
      contexto.closePath();
      contexto.fillStyle = gradiente;
      contexto.fill();

      tracar(valores);
      contexto.strokeStyle = primaria;
      contexto.lineWidth = 2;
      contexto.setLineDash([]);
      contexto.shadowColor = comAlpha(primaria, .32);
      contexto.shadowBlur = 4;
      contexto.stroke();
      contexto.shadowBlur = 0;

      const idx = Math.min(indiceAtivo, valores.length - 1);
      const ativoX = x(idx);
      contexto.strokeStyle = comAlpha(textoSecundario, .42);
      contexto.lineWidth = 1;
      contexto.setLineDash([]);
      contexto.beginPath();
      contexto.moveTo(ativoX, margem.topo);
      contexto.lineTo(ativoX, altura - margem.inferior);
      contexto.stroke();

      contexto.beginPath();
      contexto.arc(ativoX, y(valores[idx]), 4.5, 0, Math.PI * 2);
      contexto.fillStyle = primaria;
      contexto.shadowColor = primaria;
      contexto.shadowBlur = 5;
      contexto.fill();
      contexto.shadowBlur = 0;
    }

    const observador = new ResizeObserver(desenhar);
    observador.observe(canvas);
    desenhar();
    return () => observador.disconnect();
  }, [indiceAtivo, tema, serie]);

  if (serie.length === 0) {
    return (
      <div className="sales-performance">
        <div className="sales-performance__legend"><span><i />Vendas fechadas este mês</span></div>
        <p style={{ color: 'var(--muted)', fontSize: 11, padding: '30px 12px', textAlign: 'center' }}>Nenhuma venda fechada neste mês ainda.</p>
      </div>
    );
  }

  function moverPonteiro(evento: PointerEvent<HTMLCanvasElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const areaUtil = caixa.width - 57;
    const relativo = Math.min(1, Math.max(0, (evento.clientX - caixa.left - 45) / areaUtil));
    setIndiceAtivo(Math.round(relativo * (serie.length - 1)));
  }

  const idxAtivo = Math.min(indiceAtivo, serie.length - 1);
  const pontoAtivo = serie[idxAtivo];
  const tetoTooltip = Math.max(...serie.map((p) => p.valor), 1) * 1.15;
  const esquerdaTooltip = 12 + (serie.length <= 1 ? 0 : (idxAtivo / (serie.length - 1)) * 82);
  const topoTooltip = 12 + (1 - pontoAtivo.valor / tetoTooltip) * 54;
  const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <div className="sales-performance">
      <div className="sales-performance__legend"><span><i />Vendas fechadas (acumulado do mês)</span></div>
      <div className="sales-performance__canvas-wrap">
        <canvas
          ref={canvasRef}
          onPointerMove={moverPonteiro}
          aria-label="Gráfico de vendas fechadas acumuladas no mês atual"
          role="img"
        />
        <div
          className={`sales-performance__tooltip ${idxAtivo > serie.length * 0.7 ? 'sales-performance__tooltip--left' : ''}`}
          style={{ left: `${esquerdaTooltip}%`, top: `${topoTooltip}%` }}
        >
          <small>{String(pontoAtivo.dia).padStart(2, '0')} de {nomeMes}</small>
          <b><i />Vendas: R$ {pontoAtivo.valor.toLocaleString('pt-BR')}</b>
        </div>
      </div>
    </div>
  );
}
