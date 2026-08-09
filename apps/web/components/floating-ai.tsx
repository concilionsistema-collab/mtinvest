"use client";
import React, { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  sender: "bot" | "user";
  text: string;
};

export function FloatingAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Olá! Eu sou o assistente de inteligência comercial do Cionlaris. Posso ajudar priorizando atendimentos, analisando receitas ou criando mensagens para os leads.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const togglePanel = () => setIsOpen(!isOpen);

  const getAiResponse = (query: string): string => {
    const t = query.toLowerCase();
    if (t.includes("atender") || t.includes("prior")) {
      return "Priorize agora:\n1. Carlos Silva — score 92, R$ 450.000 em Negociação.\n2. Ana Oliveira — score 88, R$ 320.000.\n3. Marcos Costa — score 85, R$ 280.000.\nRecomendação: contato em até 30 minutos e registro da próxima ação.";
    }
    if (t.includes("receita") || t.includes("forecast") || t.includes("previs")) {
      return "O pipeline total é R$ 2.450.000.\nA previsão ponderada é R$ 1.840.000.\nCenário conservador: R$ 1.320.000.\nCenário otimista: R$ 2.100.000.";
    }
    if (t.includes("parad") || t.includes("retorno")) {
      return "Há 5 oportunidades com 5 dias ou mais sem avanço. As mais críticas são: Juliana, Pedro e Henrique. Sugiro uma sequência de WhatsApp + ligação no mesmo dia.";
    }
    if (t.includes("mensagem") || t.includes("visita")) {
      return "Olá, [Nome]! Aqui é [Corretor] do Cionlaris. Separei uma oportunidade que combina com o seu perfil. Podemos agendar uma visita para conhecer os detalhes e as condições especiais disponíveis?";
    }
    if (t.includes("maior chance") || t.includes("fechamento")) {
      return "1. Carlos Silva — 80% de probabilidade — R$ 450.000\n2. Ana Oliveira — 75% de probabilidade — R$ 320.000";
    }
    return "Analisei sua solicitação. No momento temos várias oportunidades no funil. Pergunte sobre previsão de receita, prioridades de atendimento, oportunidades paradas ou criação de mensagens.";
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), sender: "user", text: inputValue };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    setTimeout(() => {
      const botMessage: Message = { id: (Date.now() + 1).toString(), sender: "bot", text: getAiResponse(userMessage.text) };
      setMessages((prev) => [...prev, botMessage]);
    }, 600);
  };

  return (
    <>
      <div className="floating-ai" onClick={togglePanel} aria-label="Inteligência Comercial">
        <span className="fluent ai-float-icon">&#xE823;</span>
        <small>CION.ai</small>
        <b>3</b>
      </div>

      <div className={`floating-ai-panel ${isOpen ? "show" : ""}`}>
        <div className="float-ai-head">
          <h3>
            <div className="fluent ai-orb">&#xE823;</div>
            Inteligência Comercial
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
