"use client";
import React, { useState, useEffect } from "react";

interface PresentationModeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PresentationMode({ isOpen, onClose }: PresentationModeProps) {
  const [currentSlide, setCurrentSlide] = useState(1);

  // Reset slide when opening
  useEffect(() => {
    if (isOpen) setCurrentSlide(1);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="presentation show">
      <div className="present-top">
        <img src="/cionlaris-logo-transparent.png" alt="Cionlaris Logo" />
        <div className="present-actions">
          <button className="fluent" onClick={onClose} aria-label="Fechar">&#xE711;</button>
        </div>
      </div>
      
      <div className="present-stage">
        {currentSlide === 1 && (
          <div className="slide active">
            <h2>Visão Geral Executiva</h2>
            <p>Principais indicadores de performance da carteira de vendas.</p>
            <div className="slide-kpis">
              <div className="slide-kpi">
                <span>VGV Potencial</span>
                <strong>R$ 14.5M</strong>
              </div>
              <div className="slide-kpi">
                <span>Vendas no Mês</span>
                <strong>R$ 2.1M</strong>
              </div>
              <div className="slide-kpi">
                <span>Leads Ativos</span>
                <strong>342</strong>
              </div>
              <div className="slide-kpi">
                <span>Taxa de Conversão</span>
                <strong>12.4%</strong>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 2 && (
          <div className="slide active">
            <h2>Análise de Funil & Forecast</h2>
            <p>Previsão de fechamento baseada no avanço das negociações.</p>
            <div className="slide-grid">
              <div>
                <h3>Composição do Pipeline</h3>
                <div className="presentation-bar">
                  <span>Qualificação</span>
                  <div className="progress"><span style={{width:'80%'}}></span></div>
                  <strong>R$ 4M</strong>
                </div>
                <div className="presentation-bar">
                  <span>Visita Realizada</span>
                  <div className="progress"><span style={{width:'60%'}}></span></div>
                  <strong>R$ 3M</strong>
                </div>
                <div className="presentation-bar">
                  <span>Proposta Enviada</span>
                  <div className="progress"><span style={{width:'40%'}}></span></div>
                  <strong>R$ 2M</strong>
                </div>
                <div className="presentation-bar">
                  <span>Em Negociação</span>
                  <div className="progress"><span style={{width:'20%'}}></span></div>
                  <strong>R$ 1M</strong>
                </div>
              </div>
              <div>
                <h3>Previsão (Forecast)</h3>
                <div className="slide-kpi" style={{marginBottom: '14px'}}>
                  <span>Cenário Otimista</span>
                  <strong style={{color: 'var(--green)'}}>R$ 2.8M</strong>
                </div>
                <div className="slide-kpi">
                  <span>Cenário Realista (Ponderado)</span>
                  <strong style={{color: '#f0cf80'}}>R$ 1.8M</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 3 && (
          <div className="slide active">
            <h2>Top Oportunidades</h2>
            <p>Negociações com maior probabilidade de fechamento imediato.</p>
            <div style={{marginTop: '30px'}}>
              <div className="present-profit-row">
                <strong>#1</strong>
                <div>
                  <strong>Carlos Silva</strong>
                  <br/><span style={{color: 'var(--muted)'}}>Cobertura Itaim - 92% Probabilidade</span>
                </div>
                <strong>R$ 450.000</strong>
              </div>
              <div className="present-profit-row">
                <strong>#2</strong>
                <div>
                  <strong>Ana Oliveira</strong>
                  <br/><span style={{color: 'var(--muted)'}}>Casa Alphaville - 88% Probabilidade</span>
                </div>
                <strong>R$ 320.000</strong>
              </div>
              <div className="present-profit-row">
                <strong>#3</strong>
                <div>
                  <strong>Marcos Costa</strong>
                  <br/><span style={{color: 'var(--muted)'}}>Apartamento Jardins - 85% Probabilidade</span>
                </div>
                <strong>R$ 280.000</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="present-nav">
        <button 
          onClick={() => setCurrentSlide(s => Math.max(1, s - 1))}
          style={{opacity: currentSlide === 1 ? 0.5 : 1, cursor: currentSlide === 1 ? 'not-allowed' : 'pointer'}}
        >
          <span className="fluent">&#xE72B;</span> Anterior
        </button>
        <span style={{color: 'var(--muted)', margin: '0 10px'}}>
          Slide {currentSlide} de 3
        </span>
        <button 
          onClick={() => setCurrentSlide(s => Math.min(3, s + 1))}
          style={{opacity: currentSlide === 3 ? 0.5 : 1, cursor: currentSlide === 3 ? 'not-allowed' : 'pointer'}}
        >
          Próximo <span className="fluent">&#xE72A;</span>
        </button>
      </div>
    </div>
  );
}
