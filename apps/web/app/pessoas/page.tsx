'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Pessoa, PessoaTipo } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { buttonStyle, buttonSecondaryStyle, cardStyle, inputStyle } from '../../lib/styles';

const ROTULOS_TIPO: Record<PessoaTipo, string> = { FISICA: 'Pessoa física', JURIDICA: 'Pessoa jurídica' };
const TIPOS: PessoaTipo[] = ['FISICA', 'JURIDICA'];

export default function PessoasPage() {
  const { sessao } = useAuth();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState<PessoaTipo>('FISICA');
  const [nome, setNome] = useState('');
  const [documentoNormalizado, setDocumentoNormalizado] = useState('');
  const [telefoneNormalizado, setTelefoneNormalizado] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<{ nome: string; documentoNormalizado: string; telefoneNormalizado: string }>({
    nome: '',
    documentoNormalizado: '',
    telefoneNormalizado: '',
  });

  const [motivoEliminacao, setMotivoEliminacao] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState<string | null>(null);

  async function carregar() {
    try {
      setPessoas(await apiFetch<Pessoa[]>('/pessoas'));
    } catch {
      setErro('Falha ao carregar pessoas.');
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch('/pessoas', {
        method: 'POST',
        body: JSON.stringify({
          tipo,
          nome,
          documentoNormalizado: documentoNormalizado || undefined,
          telefoneNormalizado: telefoneNormalizado || undefined,
        }),
      });
      setNome('');
      setDocumentoNormalizado('');
      setTelefoneNormalizado('');
      await carregar();
    } catch {
      setErro('Falha ao cadastrar pessoa (documento ou telefone já pode estar em uso).');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(p: Pessoa) {
    setEmEdicao(p.id);
    setFormEdicao({ nome: p.nome, documentoNormalizado: p.documentoNormalizado ?? '', telefoneNormalizado: p.telefoneNormalizado ?? '' });
  }

  async function salvarEdicao(id: string) {
    setProcessando(id);
    setErro(null);
    try {
      await apiFetch(`/pessoas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nome: formEdicao.nome,
          documentoNormalizado: formEdicao.documentoNormalizado || undefined,
          telefoneNormalizado: formEdicao.telefoneNormalizado || undefined,
        }),
      });
      setEmEdicao(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? 'Falha ao corrigir dados (documento ou telefone já pode estar em uso).' : 'Erro inesperado.');
    } finally {
      setProcessando(null);
    }
  }

  async function eliminar(id: string) {
    const motivo = motivoEliminacao[id];
    if (!motivo) return;
    setProcessando(id);
    setErro(null);
    try {
      await apiFetch(`/pessoas/${id}/eliminacao`, { method: 'POST', body: JSON.stringify({ motivo }) });
      await carregar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setErro('Só o Gestor de unidade pode processar um pedido de eliminação de titular (ART-012).');
      } else if (e instanceof ApiError && e.status === 400) {
        setErro('Não foi possível eliminar: esta pessoa tem um vínculo contratual ativo (ver detalhes na resposta da API).');
      } else {
        setErro('Falha ao processar pedido de eliminação.');
      }
    } finally {
      setProcessando(null);
    }
  }

  if (!sessao) return null;
  if (!pessoas) return <main><h1>Pessoas</h1><p>Carregando...</p></main>;

  return (
    <main>
      <h1>Pessoas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Cadastro base de proprietários, inquilinos, fiadores e coproprietários (ART-005) — reaproveitado
        por Locação e Imóveis. Inclui os direitos do titular previstos em ART-012 (LGPD): correção e
        eliminação (anonimização, quando não há contrato ativo bloqueando).
      </p>
      {erro && <p>{erro}</p>}

      <form onSubmit={criar} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
        <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as PessoaTipo)} style={inputStyle}>
          {TIPOS.map((t) => <option key={t} value={t}>{ROTULOS_TIPO[t]}</option>)}
        </select>
        <input aria-label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required style={{ ...inputStyle, flex: 1, minWidth: 180 }} placeholder="Nome" />
        <input aria-label="Documento (CPF/CNPJ)" value={documentoNormalizado} onChange={(e) => setDocumentoNormalizado(e.target.value)} style={inputStyle} placeholder="Documento (opcional)" />
        <input aria-label="Telefone" value={telefoneNormalizado} onChange={(e) => setTelefoneNormalizado(e.target.value)} style={inputStyle} placeholder="Telefone (opcional)" />
        <button style={buttonStyle} disabled={salvando}>{salvando ? 'Salvando...' : 'Cadastrar pessoa'}</button>
      </form>

      {pessoas.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma pessoa cadastrada ainda.</p>}
      {pessoas.map((p) => (
        <div style={cardStyle} key={p.id}>
          {p.anonimizadoEm ? (
            <div>
              <b style={{ color: 'var(--muted)' }}>Titular anonimizado (LGPD)</b>
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                Eliminado em {new Date(p.anonimizadoEm).toLocaleString('pt-BR')} · {ROTULOS_TIPO[p.tipo]}
              </small>
            </div>
          ) : emEdicao === p.id ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input aria-label="Nome" value={formEdicao.nome} onChange={(e) => setFormEdicao((f) => ({ ...f, nome: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
              <input aria-label="Documento" value={formEdicao.documentoNormalizado} onChange={(e) => setFormEdicao((f) => ({ ...f, documentoNormalizado: e.target.value }))} style={inputStyle} placeholder="Documento" />
              <input aria-label="Telefone" value={formEdicao.telefoneNormalizado} onChange={(e) => setFormEdicao((f) => ({ ...f, telefoneNormalizado: e.target.value }))} style={inputStyle} placeholder="Telefone" />
              <button style={buttonStyle} disabled={processando === p.id} onClick={() => salvarEdicao(p.id)}>{processando === p.id ? 'Salvando...' : 'Salvar'}</button>
              <button style={buttonSecondaryStyle} onClick={() => setEmEdicao(null)}>Cancelar</button>
            </div>
          ) : (
            <div>
              <b>{p.nome}</b>
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                {ROTULOS_TIPO[p.tipo]}{p.documentoNormalizado ? ` · ${p.documentoNormalizado}` : ''}{p.telefoneNormalizado ? ` · ${p.telefoneNormalizado}` : ''}
              </small>
            </div>
          )}

          {!p.anonimizadoEm && emEdicao !== p.id && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={buttonSecondaryStyle} onClick={() => iniciarEdicao(p)}>Corrigir dados</button>
              <input
                aria-label="Motivo do pedido de eliminação"
                value={motivoEliminacao[p.id] ?? ''}
                onChange={(e) => setMotivoEliminacao((m) => ({ ...m, [p.id]: e.target.value }))}
                style={{ ...inputStyle, width: 220 }}
                placeholder="Motivo do pedido de eliminação"
              />
              <button
                style={buttonSecondaryStyle}
                disabled={processando === p.id || !motivoEliminacao[p.id]}
                onClick={() => eliminar(p.id)}
              >
                {processando === p.id ? 'Processando...' : 'Solicitar eliminação (LGPD)'}
              </button>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
