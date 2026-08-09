"use client";

import React, { useState } from "react";
import styles from "./ai-insights-panel.module.css";

export function AIInsightsPanel() {
  const [activeFilter, setActiveFilter] = useState("Hoje");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.logoOrb}></div>
              <div className={styles.headerTitle}>
                <h2>CION.ai</h2>
                <p>Inteligência Comercial</p>
                <div className={styles.status}>
                  <div className={styles.statusDot}></div>
                  Online | Analisando sua operação em tempo real
                </div>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.timeFilters}>
                {['Hoje', 'Semana', 'Mês'].map(f => (
                  <button 
                    key={f} 
                    className={`${styles.timeFilter} ${activeFilter === f ? styles.active : ''}`}
                    onClick={() => setActiveFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          <div className={styles.greeting}>
            <h3>
              <div className={styles.sparkleIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
              </div>
              Boa tarde, Raphael! 👋
            </h3>
            <p>Encontrei 4 oportunidades que merecem sua atenção.</p>
          </div>

          <div className={styles.statsGrid}>
            {/* Leads quentes */}
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <div className={`${styles.statIcon} ${styles.iconOrange}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c-2.28 0-3-4.5-3-4.5s-2 1.5-2 3c0 2 1 3 2.5 4z" /><path d="M12 22c4.97 0 9-4.03 9-9a9 9 0 0 0-9-9c-2 0-3.5 1.5-3.5 1.5s.5 2 2 3c1.5 1 2 2.5 2 4.5 0 2.5-2 4.5-4.5 4.5S5 15.5 5 13c0-2-1.5-3.5-1.5-3.5S2 11 2 13c0 4.97 4.03 9 9 9z" /></svg>
                </div>
                <div className={styles.statArrow}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></div>
              </div>
              <div className={`${styles.statValue} ${styles.valueOrange}`}>7</div>
              <div className={styles.statTitle}>Leads quentes</div>
              <div className={styles.statDesc}>3 sem contato há mais de 24h</div>
              <div className={styles.statBar}><div className={`${styles.statBarFill} ${styles.bgOrange}`}></div></div>
            </div>

            {/* Em negociação */}
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <div className={`${styles.statIcon} ${styles.iconGreen}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div className={styles.statArrow}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></div>
              </div>
              <div className={`${styles.statValue} ${styles.valueGreen}`}>R$ 1,8 mi</div>
              <div className={styles.statTitle}>Em negociação</div>
              <div className={styles.statDesc}>2 propostas próximas do fechamento</div>
              <div className={styles.statBar}><div className={`${styles.statBarFill} ${styles.bgGreen}`}></div></div>
            </div>

            {/* Leads esfriando */}
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <div className={`${styles.statIcon} ${styles.iconYellow}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                </div>
                <div className={styles.statArrow}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></div>
              </div>
              <div className={`${styles.statValue} ${styles.valueYellow}`}>5</div>
              <div className={styles.statTitle}>Leads esfriando</div>
              <div className={styles.statDesc}>Recomendar abordagem</div>
              <div className={styles.statBar}><div className={`${styles.statBarFill} ${styles.bgYellow}`}></div></div>
            </div>

            {/* Conversão */}
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <div className={`${styles.statIcon} ${styles.iconBlue}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>
                </div>
                <div className={styles.statArrow}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></div>
              </div>
              <div className={`${styles.statValue} ${styles.valueBlue}`}>+12%</div>
              <div className={styles.statTitle}>Conversão</div>
              <div className={styles.statDesc}>Comparado ao mês anterior</div>
              <div className={styles.statBar}><div className={`${styles.statBarFill} ${styles.bgBlue}`}></div></div>
            </div>
          </div>

          <div className={styles.actionsSection}>
            <h4>Ações rápidas</h4>
            <div className={styles.actionsList}>
              <button className={styles.actionBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Priorizar meus leads
              </button>
              <button className={styles.actionBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Quem devo ligar agora?
              </button>
              <button className={styles.actionBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                Criar follow-up
              </button>
              <button className={styles.actionBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                Analisar meu funil
              </button>
              <button className={styles.actionBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                Prever fechamento
              </button>
            </div>
          </div>

          <div className={styles.insightCard}>
            <div className={styles.insightLeft}>
              <div className={styles.insightIconWell}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
              </div>
              <div className={styles.insightText}>
                <h4>Insight CION</h4>
                <p>2 negociações têm alta chance de fechar nos próximos 7 dias.</p>
              </div>
            </div>
            <div className={styles.insightIllustration}>
              <div className={styles.targetGraphic}>
                <div className={styles.targetCircles}>
                  <div className={styles.targetInner1}>
                    <div className={styles.targetInner2}></div>
                  </div>
                </div>
                <div className={styles.targetBars}>
                  <div className={styles.targetBar}></div>
                  <div className={styles.targetBar}></div>
                  <div className={styles.targetBar}></div>
                </div>
              </div>
              <button className={styles.insightBtn}>
                Analisar agora
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>

          <div className={styles.chatInputWrapper}>
            <input type="text" className={styles.chatInput} placeholder="Pergunte ao CION.ai..." />
            <div className={styles.chatTools}>
              <button className={styles.chatToolBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              </button>
              <button className={styles.chatToolBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <button className={styles.chatToolBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
                Comandos
              </button>
            </div>
            <button className={styles.sendBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>
          </div>
          
          <div className={styles.footerText}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Suas informações estão seguras com a CION.ai
          </div>
        </div>
      )}

      {!isOpen && (
        <div className={styles.floatingBubble} onClick={() => setIsOpen(true)}>
          <div className={styles.bubbleBadge}>3</div>
          <div className={styles.bubbleText}>CION.ai</div>
        </div>
      )}
    </>
  );
}
