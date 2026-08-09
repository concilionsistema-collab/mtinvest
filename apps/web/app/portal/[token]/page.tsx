'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ContratoDeLocacao, IndiceReajuste, PortalContratoResumo } from '@crm/shared';
import { apiFetch } from '../../../lib/api';
import { cardStyle } from '../../../lib/styles';

const ROTULOS_INDICE: Record<IndiceReajuste, string> = { IGPM: 'IGP-M', IPCA: 'IPCA', OUTRO: 'Outro' };
const ROTULOS_ESTADO_CONTRATO: Record<ContratoDeLocacao['estado'], string> = {
  RASCUNHO: 'Rascunho',
  EM_ASSINATURA: 'Em assinatura',
  AGUARDANDO_VISTORIA_ENTRADA: 'Aguardando vistoria de entrada',
  VIGENTE: 'Vigente',
  EM_ENCERRAMENTO: 'Em encerramento',
  EM_ENCERRAMENTO_ANTECIPADO: 'Em encerramento antecipado',
  ENCERRADO: 'Encerrado',
};

// US-113/RN-413 - página pública (sem sessão de Usuario, ver AppShell): o
// token na URL é o único identificador, resolvido pelo backend
// (PortalService.consultar). Somente leitura - nenhuma ação de escrita aqui.
export default function PortalContratoPage() {
  const params = useParams<{ token: string }>();
  const [resumo, setResumo] = useState<PortalContratoResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.token) return;
    apiFetch<PortalContratoResumo>(`/portal/contratos/${params.token}`)
      .then(setResumo)
      .catch(() => setErro('Link inválido ou expirado. Peça um novo link à imobiliária.'));
  }, [params?.token]);

  if (erro) {
    return (
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
        <h1>Portal do contrato</h1>
        <p>{erro}</p>
      </main>
    );
  }

  if (!resumo) {
    return (
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
        <h1>Portal do contrato</h1>
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <h1>Portal do contrato</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Consulta somente leitura (RN-413). Para qualquer alteração, entre em contato com a
        imobiliária.
      </p>

      <div style={cardStyle}>
        <b>{resumo.enderecoImovel}</b>
        <small style={{ display: 'block', color: 'var(--muted)' }}>
          {ROTULOS_ESTADO_CONTRATO[resumo.estado]} · R$ {resumo.valorAluguel.toLocaleString('pt-BR')}/mês · vencimento
          dia {resumo.diaVencimento} · índice {ROTULOS_INDICE[resumo.indiceReajuste]}
        </small>
        {resumo.estado === 'VIGENTE' && (
          <small style={{ display: 'block', color: 'var(--muted)' }}>
            Vencimento do período atual: {new Date(resumo.vencimentoAtual).toLocaleDateString('pt-BR')}
          </small>
        )}
      </div>

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Documentos</h2>
      {resumo.documentos.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum documento disponível.</p>}
      {resumo.documentos.map((d) => (
        <div key={d.id} style={cardStyle}>
          <span>{d.descricao} ({d.referencia})</span>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Vistorias</h2>
      {resumo.vistorias.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma vistoria registrada.</p>}
      {resumo.vistorias.map((v) => (
        <div key={v.id} style={cardStyle}>
          <span>
            {v.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} · {new Date(v.dataHora).toLocaleDateString('pt-BR')} · {v.estado}
            {v.laudo ? ` — "${v.laudo}"` : ''}
          </span>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Reajustes</h2>
      {resumo.reajustes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum reajuste aplicado.</p>}
      {resumo.reajustes.map((r) => (
        <div key={r.id} style={cardStyle}>
          <span>
            {r.competencia}: R$ {r.valorAluguelAnterior.toLocaleString('pt-BR')} → R${' '}
            {r.valorAluguelNovo.toLocaleString('pt-BR')}
          </span>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Renovações</h2>
      {resumo.renovacoes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma renovação confirmada.</p>}
      {resumo.renovacoes.map((r) => (
        <div key={r.id} style={cardStyle}>
          <span>
            +{r.prazoAdicionalMeses} meses: {new Date(r.vencimentoAnterior).toLocaleDateString('pt-BR')} →{' '}
            {new Date(r.novoVencimento).toLocaleDateString('pt-BR')}
          </span>
        </div>
      ))}
    </main>
  );
}
