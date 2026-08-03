'use client';

import { useEffect, useState } from 'react';
import type { IndicadoresFunil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

export default function FinanceiroPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<IndicadoresFunil>('/indicadores')
      .then(setDados)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? setSemPermissao(true) : setErro('Falha ao carregar Financeiro.')));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (semPermissao) return <main><h1>Financeiro</h1><p>Apenas o perfil "Gestor de unidade" acessa esta tela.</p></main>;
  if (erro) return <main><h1>Financeiro</h1><p>{erro}</p></main>;
  if (!dados) return <main><h1>Financeiro</h1><p>Carregando...</p></main>;

  return (
    <main>
      <h1>Financeiro</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        VGV realizado soma <code>Imovel.valorAnunciado</code> das oportunidades <code>FECHADA</code> — nunca infere
        valor de imóvel sem cadastro. Comissão cruzada (RN-309) conta só o gatilho acionado, sem valor
        calculado: a tabela de comissionamento depende de <b>DEC-NEG-002</b>, ainda pendente de aprovação
        — não fingimos uma precisão que o sistema não tem.
      </p>

      <ul className="finance-list" style={{ maxWidth: 420, marginTop: 16 }}>
        <li>VGV realizado (fechamentos) <b>R$ {dados.vgvFechado.toLocaleString('pt-BR')}</b></li>
        <li>Negócios fechados <b>{dados.fechamentos}</b></li>
        <li>Comissões cruzadas acionadas (RN-309) <b>{dados.comissoesCruzadasQuantidade}</b></li>
      </ul>
    </main>
  );
}
