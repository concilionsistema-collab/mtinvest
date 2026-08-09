'use client';

import { useEffect, useState } from 'react';
import type { IndicadoresFunil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { SalesFunnelCard } from '../../components/sales-funnel-card';
import { apiFetch, ApiError } from '../../lib/api';

export default function FunilPage() {
  const { sessao } = useAuth();
  const [dados, setDados] = useState<IndicadoresFunil | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<IndicadoresFunil>('/indicadores')
      .then(setDados)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? setSemPermissao(true) : setErro('Falha ao carregar o funil.')));
  }, [sessao?.tenantId]);

  if (!sessao) return null;
  if (semPermissao) return <main><h1>Funil de Vendas</h1><p>Apenas o perfil "Gestor de unidade" acessa o funil de vendas.</p></main>;
  if (erro) return <main><h1>Funil de Vendas</h1><p>{erro}</p></main>;
  if (!dados) return <main><h1>Funil de Vendas</h1><p>Carregando...</p></main>;

  return <main><SalesFunnelCard dados={dados} /></main>;
}
