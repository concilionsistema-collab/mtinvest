"use client";
import React, { useState, useEffect } from "react";
import type { Imovel, Lead, Oportunidade, OportunidadeEstado, Pessoa } from "@crm/shared";
import { apiFetch } from "../lib/api";

interface PresentationModeProps {
  isOpen: boolean;
  onClose: () => void;
}

const INICIO_DO_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const ESTADOS_ENCERRADOS = ["FECHADA", "PERDIDA"];
const SEQUENCIA_ESTADOS: OportunidadeEstado[] = ["QUALIFICACAO", "VISITA_AGENDADA", "VISITA_CONFIRMADA", "VISITA_REALIZADA", "PROPOSTA_ENVIADA", "EM_CONTRAPROPOSTA", "RESERVA", "DOCUMENTACAO_CONCLUIDA", "FECHADA"];

function avancoPercentual(estado: OportunidadeEstado): number {
  const indice = SEQUENCIA_ESTADOS.indexOf(estado);
  return indice === -1 ? 0 : Math.round(((indice + 1) / SEQUENCIA_ESTADOS.length) * 100);
}

const formatadorMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function formatarMoeda(valor: number): string { return formatadorMoeda.format(valor); }

interface DadosPresentation { leads: Lead[]; oportunidades: Oportunidade[]; imoveis: Imovel[]; pessoas: Pessoa[] }

/** Dados buscados só quando o painel abre (não no carregamento normal da app-shell) - evita custo em toda navegação por uma tela usada ocasionalmente. */
export function PresentationMode({ isOpen, onClose }: PresentationModeProps) {
  const [currentSlide, setCurrentSlide] = useState(1);
  const [dados, setDados] = useState<DadosPresentation | null>(null);

  useEffect(() => { if (isOpen) setCurrentSlide(1); }, [isOpen]);
  useEffect(() => {
    if (!isOpen || dados) return;
    Promise.all([
      apiFetch<Lead[]>("/leads"),
      apiFetch<Oportunidade[]>("/oportunidades"),
      apiFetch<Imovel[]>("/imoveis"),
      apiFetch<Pessoa[]>("/pessoas"),
    ]).then(([leads, oportunidades, imoveis, pessoas]) => setDados({ leads, oportunidades, imoveis, pessoas })).catch(() => {});
  }, [isOpen, dados]);

  if (!isOpen) return null;

  if (!dados) {
    return (
      <div className="presentation show">
        <div className="present-top">
          <img src="/cionlaris-logo-transparent.png" alt="Cionlaris Logo" />
          <div className="present-actions"><button className="fluent" onClick={onClose} aria-label="Fechar">&#xE711;</button></div>
        </div>
        <div className="present-stage"><div className="slide active"><p>Carregando dados reais...</p></div></div>
      </div>
    );
  }

  const { leads, oportunidades, imoveis, pessoas } = dados;
  const valorDe = (o: Oportunidade) => imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0;

  const leadsAtivos = leads.filter((l) => l.estado !== "INATIVO" && l.estado !== "CONVERTIDO").length;
  const convertidos = leads.filter((l) => l.estado === "CONVERTIDO").length;
  const taxaConversao = leads.length > 0 ? Math.round((convertidos / leads.length) * 1000) / 10 : 0;

  const oportunidadesAtivas = oportunidades.filter((o) => !ESTADOS_ENCERRADOS.includes(o.estado));
  const vgvPotencial = oportunidadesAtivas.reduce((soma, o) => soma + valorDe(o), 0);
  const vendasNoMes = oportunidades.filter((o) => o.estado === "FECHADA" && new Date(o.criadoEm) >= INICIO_DO_MES).reduce((soma, o) => soma + valorDe(o), 0);

  const grupos = [
    { nome: "Qualificação", estados: ["QUALIFICACAO"] },
    { nome: "Visita Realizada", estados: ["VISITA_AGENDADA", "VISITA_CONFIRMADA", "VISITA_REALIZADA"] },
    { nome: "Proposta Enviada", estados: ["PROPOSTA_ENVIADA", "EM_CONTRAPROPOSTA"] },
    { nome: "Em Negociação", estados: ["RESERVA", "DOCUMENTACAO_CONCLUIDA"] },
  ].map((g) => {
    const lista = oportunidades.filter((o) => g.estados.includes(o.estado));
    return { nome: g.nome, valor: lista.reduce((soma, o) => soma + valorDe(o), 0), count: lista.length };
  });
  const maiorGrupo = Math.max(...grupos.map((g) => g.valor), 1);

  const topOportunidades = [...oportunidadesAtivas]
    .sort((a, b) => avancoPercentual(b.estado) - avancoPercentual(a.estado))
    .slice(0, 3)
    .map((o) => {
      const lead = leads.find((l) => l.id === o.leadId);
      const pessoa = lead ? pessoas.find((p) => p.id === lead.pessoaId) : undefined;
      const imovel = imoveis.find((i) => i.id === o.imovelId);
      return { nome: pessoa?.nome ?? "Cliente", imovel: imovel?.enderecoResumo ?? "Imóvel", avanco: avancoPercentual(o.estado), valor: valorDe(o) };
    });

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
                <span>VGV em Negociação</span>
                <strong>{formatarMoeda(vgvPotencial)}</strong>
              </div>
              <div className="slide-kpi">
                <span>Vendas no Mês</span>
                <strong>{formatarMoeda(vendasNoMes)}</strong>
              </div>
              <div className="slide-kpi">
                <span>Leads Ativos</span>
                <strong>{leadsAtivos}</strong>
              </div>
              <div className="slide-kpi">
                <span>Taxa de Conversão</span>
                <strong>{taxaConversao}%</strong>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 2 && (
          <div className="slide active">
            <h2>Composição do Pipeline</h2>
            <p>Valor em negociação por etapa do funil.</p>
            <div className="slide-grid">
              <div>
                <h3>Valor por Etapa</h3>
                {grupos.map((g) => (
                  <div className="presentation-bar" key={g.nome}>
                    <span>{g.nome}</span>
                    <div className="progress"><span style={{ width: `${Math.round((g.valor / maiorGrupo) * 100)}%` }}></span></div>
                    <strong>{formatarMoeda(g.valor)}</strong>
                  </div>
                ))}
              </div>
              <div>
                <h3>Resumo</h3>
                <div className="slide-kpi" style={{ marginBottom: '14px' }}>
                  <span>Negociações ativas</span>
                  <strong style={{ color: 'var(--green)' }}>{oportunidadesAtivas.length}</strong>
                </div>
                <div className="slide-kpi">
                  <span>Valor total em negociação</span>
                  <strong style={{ color: '#f0cf80' }}>{formatarMoeda(vgvPotencial)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSlide === 3 && (
          <div className="slide active">
            <h2>Negociações Mais Avançadas</h2>
            <p>Ordenadas pela posição real no funil de vendas (não é uma previsão de fechamento).</p>
            <div style={{marginTop: '30px'}}>
              {topOportunidades.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma negociação ativa no momento.</p>}
              {topOportunidades.map((o, indice) => (
                <div className="present-profit-row" key={`${o.nome}-${indice}`}>
                  <strong>#{indice + 1}</strong>
                  <div>
                    <strong>{o.nome}</strong>
                    <br/><span style={{color: 'var(--muted)'}}>{o.imovel} - {o.avanco}% do funil</span>
                  </div>
                  <strong>{formatarMoeda(o.valor)}</strong>
                </div>
              ))}
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
