'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTheme } from './theme-context';

const ETAPAS = [
  { nome: 'Novos Leads', valor: '1.248', percentual: '100%', largura: 100, cor: 'var(--primary)' },
  { nome: 'Qualificados', valor: '876', percentual: '70%', largura: 86, cor: 'color-mix(in srgb,var(--primary) 72%,var(--secondary))' },
  { nome: 'Visitas', valor: '482', percentual: '39%', largura: 72, cor: 'var(--secondary)' },
  { nome: 'Propostas', valor: '187', percentual: '15%', largura: 58, cor: 'var(--text-secondary)' },
  { nome: 'Negociação', valor: '74', percentual: '6%', largura: 44, cor: 'var(--warning)' },
  { nome: 'Fechados', valor: '28', percentual: '2%', largura: 30, cor: 'var(--success)' },
] as const;

const VENDAS = [0.2,0.62,0.88,1.16,1.08,1.42,1.25,1.7,1.95,1.58,1.82,2.18,2.04,2.34,2.25,2.42,2.31,2.68,2.94,2.76,3.18,3.42,3.3,3.72,3.62,4.18,4.62,5.2,5.62,5.36];
const META = [0.55,0.86,1.08,1.24,1.24,1.42,1.66,1.84,2.02,2.02,2.16,2.28,2.28,2.44,2.58,2.68,2.74,2.9,3.04,3.16,3.3,3.42,3.56,3.72,3.86,4.02,4.18,4.38,4.58,4.78];

export function PremiumSalesFunnel() {
  return (
    <div className="premium-funnel">
      <div className="premium-funnel__summary"><span>Conversão total</span><b>2,2%</b></div>
      <ol>
        {ETAPAS.map((etapa) => (
          <li
            key={etapa.nome}
            style={{ '--funnel-color': etapa.cor, '--funnel-width': `${etapa.largura}%` } as CSSProperties}
          >
            <span className="premium-funnel__shape"><i className="premium-funnel__shine" /></span>
            <span className="premium-funnel__data">
              <b>{etapa.nome}</b>
              <small>{etapa.valor} <em>({etapa.percentual})</em></small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PremiumSalesPerformance() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [indiceAtivo, setIndiceAtivo] = useState(17);
  const { tema } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
      const secundaria = estilos.getPropertyValue('--secondary').trim() || '#22D3EE';
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
      const x = (indice: number) => margem.esquerda + (indice / (VENDAS.length - 1)) * areaLargura;
      const y = (valor: number) => margem.topo + areaAltura - (valor / 6) * areaAltura;

      contexto.font = '11px Inter, Segoe UI, sans-serif';
      contexto.textAlign = 'right';
      contexto.textBaseline = 'middle';
      for (let nivel = 0; nivel <= 6; nivel += 1) {
        const posicaoY = y(nivel);
        contexto.strokeStyle = comAlpha(borda, nivel === 0 ? .72 : .42);
        contexto.lineWidth = 1;
        contexto.setLineDash(nivel === 0 ? [] : [3, 5]);
        contexto.beginPath();
        contexto.moveTo(margem.esquerda, posicaoY);
        contexto.lineTo(largura - margem.direita, posicaoY);
        contexto.stroke();
        contexto.fillStyle = textoSecundario;
        contexto.fillText(nivel === 0 ? '0' : `${nivel}M`, margem.esquerda - 8, posicaoY);
      }

      [0,4,9,14,19,24,29].forEach((indice) => {
        const posicaoX = x(indice);
        contexto.strokeStyle = comAlpha(borda, .34);
        contexto.setLineDash([3, 6]);
        contexto.beginPath();
        contexto.moveTo(posicaoX, margem.topo);
        contexto.lineTo(posicaoX, altura - margem.inferior);
        contexto.stroke();
        contexto.fillStyle = textoSecundario;
        contexto.textAlign = 'center';
        contexto.fillText(String(indice + 1).padStart(2, '0'), posicaoX, altura - 9);
      });

      function tracar(valores: number[]) {
        contextoSeguro.beginPath();
        contextoSeguro.moveTo(x(0), y(valores[0]));
        for (let indice = 1; indice < valores.length; indice += 1) {
          const anteriorX = x(indice - 1);
          const anteriorY = y(valores[indice - 1]);
          const atualX = x(indice);
          const atualY = y(valores[indice]);
          const meioX = (anteriorX + atualX) / 2;
          contextoSeguro.quadraticCurveTo(anteriorX, anteriorY, meioX, (anteriorY + atualY) / 2);
        }
        contextoSeguro.lineTo(x(valores.length - 1), y(valores[valores.length - 1]));
      }

      const gradiente = contexto.createLinearGradient(0, margem.topo, 0, altura - margem.inferior);
      gradiente.addColorStop(0, comAlpha(primaria, .42));
      gradiente.addColorStop(0.62, comAlpha(primaria, .16));
      gradiente.addColorStop(1, comAlpha(primaria, .01));
      tracar(VENDAS);
      contexto.lineTo(x(VENDAS.length - 1), altura - margem.inferior);
      contexto.lineTo(x(0), altura - margem.inferior);
      contexto.closePath();
      contexto.fillStyle = gradiente;
      contexto.fill();

      tracar(META);
      contexto.strokeStyle = secundaria;
      contexto.lineWidth = 2;
      contexto.setLineDash([7, 6]);
      contexto.shadowColor = comAlpha(secundaria, .28);
      contexto.shadowBlur = 3;
      contexto.stroke();

      tracar(VENDAS);
      contexto.strokeStyle = primaria;
      contexto.lineWidth = 2;
      contexto.setLineDash([]);
      contexto.shadowColor = comAlpha(primaria, .32);
      contexto.shadowBlur = 4;
      contexto.stroke();
      contexto.shadowBlur = 0;

      const ativoX = x(indiceAtivo);
      contexto.strokeStyle = comAlpha(textoSecundario, .42);
      contexto.lineWidth = 1;
      contexto.setLineDash([]);
      contexto.beginPath();
      contexto.moveTo(ativoX, margem.topo);
      contexto.lineTo(ativoX, altura - margem.inferior);
      contexto.stroke();

      [[VENDAS[indiceAtivo], primaria], [META[indiceAtivo], secundaria]].forEach(([valor, cor]) => {
        contexto.beginPath();
        contexto.arc(ativoX, y(Number(valor)), 4.5, 0, Math.PI * 2);
        contexto.fillStyle = String(cor);
        contexto.shadowColor = String(cor);
        contexto.shadowBlur = 5;
        contexto.fill();
        contexto.shadowBlur = 0;
      });
    }

    const observador = new ResizeObserver(desenhar);
    observador.observe(canvas);
    desenhar();
    return () => observador.disconnect();
  }, [indiceAtivo, tema]);

  function moverPonteiro(evento: PointerEvent<HTMLCanvasElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const areaUtil = caixa.width - 57;
    const relativo = Math.min(1, Math.max(0, (evento.clientX - caixa.left - 45) / areaUtil));
    setIndiceAtivo(Math.round(relativo * (VENDAS.length - 1)));
  }

  const esquerdaTooltip = 12 + (indiceAtivo / (VENDAS.length - 1)) * 82;
  const topoTooltip = 12 + (1 - VENDAS[indiceAtivo] / 6) * 54;

  return (
    <div className="sales-performance">
      <div className="sales-performance__legend"><span><i />Vendas</span><span><i />Meta</span></div>
      <div className="sales-performance__canvas-wrap">
        <canvas
          ref={canvasRef}
          onPointerMove={moverPonteiro}
          aria-label="Gráfico de vendas e meta dos últimos 30 dias"
          role="img"
        />
        <div
          className={`sales-performance__tooltip ${indiceAtivo > 22 ? 'sales-performance__tooltip--left' : ''}`}
          style={{ left: `${esquerdaTooltip}%`, top: `${topoTooltip}%` }}
        >
          <small>{indiceAtivo + 1} de Maio</small>
          <b><i />Vendas: R$ {(VENDAS[indiceAtivo] * 1_000_000).toLocaleString('pt-BR')}</b>
          <b><i />Meta: R$ {(META[indiceAtivo] * 1_000_000).toLocaleString('pt-BR')}</b>
        </div>
      </div>
    </div>
  );
}
