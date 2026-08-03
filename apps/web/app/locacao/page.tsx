'use client';

import { FormEvent, useEffect, useState } from 'react';
import type {
  ContratoDeAdministracao,
  ContratoDeLocacao,
  Garantia,
  GarantiaTipo,
  Imovel,
  IndiceReajuste,
  Pessoa,
  Unidade,
} from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';
import { buttonStyle, buttonSecondaryStyle, cardStyle, inputStyle } from '../../lib/styles';

const ROTULOS_INDICE: Record<IndiceReajuste, string> = { IGPM: 'IGP-M', IPCA: 'IPCA', OUTRO: 'Outro' };
const INDICES: IndiceReajuste[] = ['IGPM', 'IPCA', 'OUTRO'];
const ROTULOS_TIPO_GARANTIA: Record<GarantiaTipo, string> = { FIADOR: 'Fiador', CAUCAO: 'Caução', SEGURO_FIANCA: 'Seguro-fiança' };
const TIPOS_GARANTIA: GarantiaTipo[] = ['FIADOR', 'CAUCAO', 'SEGURO_FIANCA'];

export default function LocacaoPage() {
  const { sessao } = useAuth();

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [administracoes, setAdministracoes] = useState<ContratoDeAdministracao[]>([]);
  const [locacoes, setLocacoes] = useState<ContratoDeLocacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [unidadeId, setUnidadeId] = useState('');
  const [imovelId, setImovelId] = useState('');
  const [proprietarioPessoaId, setProprietarioPessoaId] = useState('');
  const [salvandoAdministracao, setSalvandoAdministracao] = useState(false);

  const [contratoDeAdministracaoId, setContratoDeAdministracaoId] = useState('');
  const [inquilinoPessoaId, setInquilinoPessoaId] = useState('');
  const [valorAluguel, setValorAluguel] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('10');
  const [indiceReajuste, setIndiceReajuste] = useState<IndiceReajuste>('IGPM');
  const [aceitaReajusteNegativo, setAceitaReajusteNegativo] = useState(false);
  const [dataInicio, setDataInicio] = useState('');
  const [prazoMeses, setPrazoMeses] = useState('30');
  const [salvandoLocacao, setSalvandoLocacao] = useState(false);

  const [garantiasPorContrato, setGarantiasPorContrato] = useState<Record<string, Garantia[]>>({});
  const [formGarantia, setFormGarantia] = useState<Record<string, { tipo: GarantiaTipo; fiadorPessoaId: string }>>({});
  const [salvandoGarantia, setSalvandoGarantia] = useState<string | null>(null);

  async function carregar() {
    try {
      const [listaUnidades, listaImoveis, listaPessoas, listaAdministracoes, listaLocacoes] = await Promise.all([
        apiFetch<Unidade[]>('/unidades'),
        apiFetch<Imovel[]>('/imoveis'),
        apiFetch<Pessoa[]>('/pessoas'),
        apiFetch<ContratoDeAdministracao[]>('/locacao/administracao-contratos'),
        apiFetch<ContratoDeLocacao[]>('/locacao/contratos'),
      ]);
      setUnidades(listaUnidades);
      setImoveis(listaImoveis);
      setPessoas(listaPessoas);
      setAdministracoes(listaAdministracoes);
      setLocacoes(listaLocacoes);

      const listasGarantias = await Promise.all(
        listaLocacoes.map((l) => apiFetch<Garantia[]>(`/locacao/contratos/${l.id}/garantias`)),
      );
      const mapa: Record<string, Garantia[]> = {};
      listaLocacoes.forEach((l, i) => { mapa[l.id] = listasGarantias[i]; });
      setGarantiasPorContrato(mapa);

      setCarregado(true);
    } catch {
      setErro('Falha ao carregar dados de locação.');
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  async function criarAdministracao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoAdministracao(true);
    try {
      await apiFetch('/locacao/administracao-contratos', {
        method: 'POST',
        body: JSON.stringify({ unidadeId, imovelId, proprietarioPessoaId }),
      });
      setUnidadeId('');
      setImovelId('');
      setProprietarioPessoaId('');
      await carregar();
    } catch {
      setErro('Falha ao criar contrato de administração.');
    } finally {
      setSalvandoAdministracao(false);
    }
  }

  async function criarLocacao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoLocacao(true);
    try {
      await apiFetch('/locacao/contratos', {
        method: 'POST',
        body: JSON.stringify({
          contratoDeAdministracaoId,
          inquilinoPessoaId,
          valorAluguel: Number(valorAluguel),
          diaVencimento: Number(diaVencimento),
          indiceReajuste,
          aceitaReajusteNegativo,
          dataInicio,
          prazoMeses: Number(prazoMeses),
        }),
      });
      setContratoDeAdministracaoId('');
      setInquilinoPessoaId('');
      setValorAluguel('');
      setDataInicio('');
      await carregar();
    } catch {
      setErro('Falha ao criar contrato de locação.');
    } finally {
      setSalvandoLocacao(false);
    }
  }

  function garantiaFormDe(locacaoId: string) {
    return formGarantia[locacaoId] ?? { tipo: 'CAUCAO' as GarantiaTipo, fiadorPessoaId: '' };
  }

  function atualizarFormGarantia(locacaoId: string, patch: Partial<{ tipo: GarantiaTipo; fiadorPessoaId: string }>) {
    setFormGarantia((atual) => ({ ...atual, [locacaoId]: { ...garantiaFormDe(locacaoId), ...patch } }));
  }

  async function enviarGarantia(locacaoId: string, temAtiva: boolean) {
    const form = garantiaFormDe(locacaoId);
    setSalvandoGarantia(locacaoId);
    try {
      const path = temAtiva ? `/locacao/contratos/${locacaoId}/garantias/troca` : `/locacao/contratos/${locacaoId}/garantias`;
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({
          tipo: form.tipo,
          ...(form.tipo === 'FIADOR' ? { fiadorPessoaId: form.fiadorPessoaId } : {}),
        }),
      });
      setFormGarantia((atual) => ({ ...atual, [locacaoId]: { tipo: 'CAUCAO', fiadorPessoaId: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao registrar/trocar garantia.');
    } finally {
      setSalvandoGarantia(null);
    }
  }

  async function ativarGarantia(garantiaId: string) {
    setSalvandoGarantia(garantiaId);
    try {
      await apiFetch(`/locacao/garantias/${garantiaId}/ativar`, { method: 'POST' });
      await carregar();
    } catch {
      setErro('Falha ao ativar garantia.');
    } finally {
      setSalvandoGarantia(null);
    }
  }

  if (!sessao) return null;
  if (erro) return <main><h1>Locação</h1><p>{erro}</p></main>;
  if (!carregado) return <main><h1>Locação</h1><p>Carregando...</p></main>;

  function enderecoDoImovel(imovelId: string) {
    return imoveis.find((i) => i.id === imovelId)?.enderecoResumo ?? '—';
  }

  function nomeDaPessoa(pessoaId: string) {
    return pessoas.find((p) => p.id === pessoaId)?.nome ?? '—';
  }

  return (
    <main>
      <h1>Locação</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Fase 2 (ART-010/ART-015) — contrato de administração, contrato de locação (Rascunho) e
        garantias (registrar, ativar, trocar sem janela sem cobertura). Ativação do contrato,
        vistoria, reajuste e renovação ainda não têm tela (ver README).
      </p>

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Contratos de administração</h2>
      <form onSubmit={criarAdministracao} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <select aria-label="Unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} required style={inputStyle}>
          <option value="">Unidade...</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nomeFantasia}</option>)}
        </select>
        <select aria-label="Imóvel" value={imovelId} onChange={(e) => setImovelId(e.target.value)} required style={inputStyle}>
          <option value="">Imóvel...</option>
          {imoveis.map((i) => <option key={i.id} value={i.id}>{i.enderecoResumo}</option>)}
        </select>
        <select aria-label="Proprietário" value={proprietarioPessoaId} onChange={(e) => setProprietarioPessoaId(e.target.value)} required style={inputStyle}>
          <option value="">Proprietário...</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <button style={buttonStyle} disabled={salvandoAdministracao}>{salvandoAdministracao ? 'Salvando...' : 'Cadastrar administração'}</button>
      </form>
      {administracoes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum contrato de administração ainda.</p>}
      {administracoes.map((a) => (
        <div style={cardStyle} key={a.id}>
          <b>{enderecoDoImovel(a.imovelId)}</b>
          <small style={{ display: 'block', color: 'var(--muted)' }}>
            Proprietário: {nomeDaPessoa(a.proprietarioPessoaId)} · {a.status}
          </small>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Contratos de locação</h2>
      <form onSubmit={criarLocacao} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0', maxWidth: 760 }}>
        <select aria-label="Contrato de administração" value={contratoDeAdministracaoId} onChange={(e) => setContratoDeAdministracaoId(e.target.value)} required style={inputStyle}>
          <option value="">Contrato de administração...</option>
          {administracoes.map((a) => <option key={a.id} value={a.id}>{enderecoDoImovel(a.imovelId)}</option>)}
        </select>
        <select aria-label="Inquilino" value={inquilinoPessoaId} onChange={(e) => setInquilinoPessoaId(e.target.value)} required style={inputStyle}>
          <option value="">Inquilino...</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input aria-label="Valor do aluguel" type="number" min="0" step="0.01" value={valorAluguel} onChange={(e) => setValorAluguel(e.target.value)} required style={{ ...inputStyle, width: 140 }} placeholder="Valor do aluguel" />
        <input aria-label="Dia de vencimento" type="number" min="1" max="31" value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} required style={{ ...inputStyle, width: 100 }} placeholder="Dia vencimento" />
        <select aria-label="Índice de reajuste" value={indiceReajuste} onChange={(e) => setIndiceReajuste(e.target.value as IndiceReajuste)} style={inputStyle}>
          {INDICES.map((i) => <option key={i} value={i}>{ROTULOS_INDICE[i]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={aceitaReajusteNegativo} onChange={(e) => setAceitaReajusteNegativo(e.target.checked)} />
          Aceita reajuste negativo
        </label>
        <input aria-label="Data de início" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required style={inputStyle} />
        <input aria-label="Prazo em meses" type="number" min="1" value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)} required style={{ ...inputStyle, width: 100 }} placeholder="Prazo (meses)" />
        <button style={buttonStyle} disabled={salvandoLocacao}>{salvandoLocacao ? 'Salvando...' : 'Cadastrar locação'}</button>
      </form>
      {locacoes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum contrato de locação ainda.</p>}
      {locacoes.map((l) => {
        const administracao = administracoes.find((a) => a.id === l.contratoDeAdministracaoId);
        const garantias = garantiasPorContrato[l.id] ?? [];
        const garantiaAtiva = garantias.find((g) => g.estado === 'ATIVA');
        const form = garantiaFormDe(l.id);

        return (
          <div style={cardStyle} key={l.id}>
            <b>{administracao ? enderecoDoImovel(administracao.imovelId) : '—'}</b>
            <small style={{ display: 'block', color: 'var(--muted)' }}>
              Inquilino: {nomeDaPessoa(l.inquilinoPessoaId)} · R$ {l.valorAluguel.toLocaleString('pt-BR')}/mês ·{' '}
              {l.estado} · índice {ROTULOS_INDICE[l.indiceReajuste]}
            </small>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Garantias:</small>
              {garantias.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhuma registrada.</small>}
              {garantias.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0' }}>
                  <span>{ROTULOS_TIPO_GARANTIA[g.tipo]} · {g.estado}{g.fiadorPessoaId ? ` · ${nomeDaPessoa(g.fiadorPessoaId)}` : ''}</span>
                  {g.estado === 'EM_ANALISE' && (
                    <button style={buttonSecondaryStyle} disabled={salvandoGarantia === g.id} onClick={() => ativarGarantia(g.id)}>
                      {salvandoGarantia === g.id ? 'Ativando...' : 'Ativar'}
                    </button>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <select aria-label="Tipo de garantia" value={form.tipo} onChange={(e) => atualizarFormGarantia(l.id, { tipo: e.target.value as GarantiaTipo })} style={{ ...inputStyle, width: 140 }}>
                  {TIPOS_GARANTIA.map((t) => <option key={t} value={t}>{ROTULOS_TIPO_GARANTIA[t]}</option>)}
                </select>
                {form.tipo === 'FIADOR' && (
                  <select aria-label="Fiador" value={form.fiadorPessoaId} onChange={(e) => atualizarFormGarantia(l.id, { fiadorPessoaId: e.target.value })} style={{ ...inputStyle, width: 160 }}>
                    <option value="">Fiador...</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                )}
                <button
                  style={buttonSecondaryStyle}
                  disabled={salvandoGarantia === l.id || (form.tipo === 'FIADOR' && !form.fiadorPessoaId)}
                  onClick={() => enviarGarantia(l.id, Boolean(garantiaAtiva))}
                >
                  {salvandoGarantia === l.id ? 'Salvando...' : garantiaAtiva ? 'Trocar garantia' : 'Registrar garantia'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </main>
  );
}
