"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Imovel, Lead, Oportunidade, Pessoa, Usuario } from "@crm/shared";
import { useAuth } from "./auth-context";
import { apiFetch } from "../lib/api";

type Message = {
  id: string;
  sender: "bot" | "user";
  text: string;
};

const ESTADOS_ENCERRADOS = ["FECHADA", "PERDIDA"];
const DIAS_PARADA = 5;
const SEQUENCIA_ESTADOS = ["QUALIFICACAO", "VISITA_AGENDADA", "VISITA_CONFIRMADA", "VISITA_REALIZADA", "PROPOSTA_ENVIADA", "EM_CONTRAPROPOSTA", "RESERVA", "DOCUMENTACAO_CONCLUIDA", "FECHADA"];

const formatadorMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function formatarValor(valor: number | null | undefined): string { return valor != null ? formatadorMoeda.format(valor) : "sem valor definido"; }
function avancoPercentual(estado: string): number {
  const indice = SEQUENCIA_ESTADOS.indexOf(estado);
  return indice === -1 ? 0 : Math.round(((indice + 1) / SEQUENCIA_ESTADOS.length) * 100);
}

interface DadosNegocio {
  oportunidades: Oportunidade[];
  leads: Lead[];
  imoveis: Imovel[];
  pessoas: Pessoa[];
  usuarios: Usuario[];
}

interface NegociacaoResumo { nome: string; valor: number | null; avanco: number; dias: number }

/** Junta Oportunidade -> Lead -> Pessoa/Imovel (nenhum desses dados vem pronto num único endpoint). */
function resumirNegociacoes(dados: DadosNegocio, filtro: (o: Oportunidade) => boolean): NegociacaoResumo[] {
  return dados.oportunidades.filter(filtro).map((o) => {
    const lead = dados.leads.find((l) => l.id === o.leadId);
    const pessoa = lead ? dados.pessoas.find((p) => p.id === lead.pessoaId) : undefined;
    const imovel = dados.imoveis.find((i) => i.id === o.imovelId);
    const dias = Math.floor((Date.now() - new Date(o.criadoEm).getTime()) / 86_400_000);
    return { nome: pessoa?.nome ?? "Cliente", valor: imovel?.valorAnunciado ?? null, avanco: avancoPercentual(o.estado), dias };
  });
}

/** Respostas geradas a partir de dados reais (Lead/Oportunidade/Imovel), não de um modelo de linguagem - por isso ficam restritas ao que dá pra calcular com o que existe hoje no sistema. */
function getAiResponse(query: string, dados: DadosNegocio | null): string {
  if (!dados) return "Ainda estou carregando os dados do seu funil. Tente novamente em instantes.";
  const t = query.toLowerCase();
  const ativas = (o: Oportunidade) => !ESTADOS_ENCERRADOS.includes(o.estado);

  if (t.includes("atender") || t.includes("prior")) {
    const top = resumirNegociacoes(dados, ativas).sort((a, b) => b.avanco - a.avanco).slice(0, 3);
    if (top.length === 0) return "Não há negociações ativas no momento para priorizar.";
    const linhas = top.map((n, i) => `${i + 1}. ${n.nome} — ${n.avanco}% do funil — ${formatarValor(n.valor)}`).join("\n");
    return `Priorize pelo avanço no funil:\n${linhas}\nRecomendação: contato com as mais avançadas primeiro.`;
  }
  if (t.includes("receita") || t.includes("forecast") || t.includes("previs")) {
    const oportunidadesAtivas = dados.oportunidades.filter(ativas);
    const pipeline = oportunidadesAtivas.reduce((soma, o) => soma + (dados.imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0), 0);
    return `Pipeline ativo (${oportunidadesAtivas.length} negociações): ${formatarValor(pipeline)}.\nO sistema ainda não calcula uma previsão ponderada por probabilidade — isso exigiria um modelo de scoring que não existe hoje.`;
  }
  if (t.includes("parad") || t.includes("retorno")) {
    const paradas = resumirNegociacoes(dados, ativas).filter((n) => n.dias >= DIAS_PARADA).sort((a, b) => b.dias - a.dias).slice(0, 3);
    if (paradas.length === 0) return `Nenhuma negociação ativa há ${DIAS_PARADA}+ dias desde a criação.`;
    const linhas = paradas.map((n) => `${n.nome} — criada há ${n.dias} dias`).join("\n");
    return `Sem novidade desde a criação (não sei dizer se avançaram de etapa depois):\n${linhas}`;
  }
  if (t.includes("mensagem") || t.includes("visita")) {
    return "Olá, [Nome]! Aqui é [Corretor]. Separei uma oportunidade que combina com o seu perfil. Podemos agendar uma visita para conhecer os detalhes e as condições disponíveis?";
  }
  if (t.includes("maior chance") || t.includes("fechamento")) {
    const top = resumirNegociacoes(dados, ativas).sort((a, b) => b.avanco - a.avanco).slice(0, 2);
    if (top.length === 0) return "Não há negociações ativas no momento.";
    return top.map((n) => `${n.nome} — ${n.avanco}% do funil — ${formatarValor(n.valor)}`).join("\n");
  }
  const totalAtivas = dados.oportunidades.filter(ativas).length;
  return `Há ${totalAtivas} negociação(ões) ativa(s) no funil agora. Pergunte sobre previsão de receita, prioridades de atendimento, negociações paradas ou criação de mensagens.`;
}

export function FloatingAI() {
  const { sessao } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [dados, setDados] = useState<DadosNegocio | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Olá! Eu sou o assistente de inteligência comercial do Cionlaris. Posso ajudar priorizando atendimentos, olhando o pipeline ou criando mensagens para os leads — com base nos dados reais do seu funil.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen || dados || !sessao) return;
    Promise.all([
      apiFetch<Oportunidade[]>("/oportunidades"),
      apiFetch<Lead[]>("/leads"),
      apiFetch<Imovel[]>("/imoveis"),
      apiFetch<Pessoa[]>("/pessoas"),
      apiFetch<Usuario[]>("/usuarios"),
    ]).then(([oportunidades, leads, imoveis, pessoas, usuarios]) => {
      setDados({ oportunidades, leads, imoveis, pessoas, usuarios });
    }).catch(() => {});
  }, [isOpen, dados, sessao]);

  const negociacoesParadas = dados
    ? resumirNegociacoes(dados, (o) => !ESTADOS_ENCERRADOS.includes(o.estado)).filter((n) => n.dias >= DIAS_PARADA).length
    : 0;

  const togglePanel = () => setIsOpen(!isOpen);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), sender: "user", text: inputValue };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    setTimeout(() => {
      const botMessage: Message = { id: (Date.now() + 1).toString(), sender: "bot", text: getAiResponse(userMessage.text, dados) };
      setMessages((prev) => [...prev, botMessage]);
    }, 600);
  };

  if (!sessao) return null;

  return (
    <>
      <button
        type="button"
        className={`floating-ai ${isOpen ? "floating-ai--open" : ""}`}
        onClick={togglePanel}
        aria-label={isOpen ? "Fechar assistente CONCI" : "Abrir assistente CONCI"}
        aria-controls="floating-ai-panel"
        aria-expanded={isOpen}
      >
        <span className="floating-ai-avatar" aria-hidden="true">
          <img src="/task-ai-assistant.jpg" alt="" />
          <i />
        </span>
        <span className="floating-ai-copy">
          <strong>CONCI</strong>
          <small>Assistente IA</small>
        </span>
        {negociacoesParadas > 0 && <b aria-label={`${negociacoesParadas} negociações paradas`}>{negociacoesParadas}</b>}
      </button>

      <div id="floating-ai-panel" className={`floating-ai-panel ${isOpen ? "show" : ""}`}>
        <div className="float-ai-head">
          <h3>
            <span className="ai-orb"><img src="/task-ai-assistant.jpg" alt="" /></span>
            <span>CONCI<small>Inteligência Comercial</small></span>
          </h3>
          <button className="fluent close-btn" onClick={togglePanel}>&#xE711;</button>
        </div>

        <div className="float-ai-body">
          {messages.map((msg) => (
            <div key={msg.id} className={`ai-message ${msg.sender}`}>
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="float-ai-footer" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Pergunte sobre leads, receita, forecast..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="fluent">&#xE725;</button>
        </form>
      </div>
    </>
  );
}
