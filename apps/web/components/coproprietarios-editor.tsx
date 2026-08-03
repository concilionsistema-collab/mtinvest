'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { ImovelCoproprietario, Pessoa } from '@crm/shared';
import { apiFetch } from '../lib/api';
import { buttonSecondaryStyle, buttonStyle, inputStyle } from '../lib/styles';

interface LinhaRascunho {
  pessoaId: string;
  percentual: string;
}

interface Props {
  imovelId: string;
  pessoas: Pessoa[];
  onPessoaCriada: (pessoa: Pessoa) => void;
}

const smallInput: CSSProperties = {
  ...inputStyle,
  width: 'auto',
  padding: '0.35rem 0.5rem',
  fontSize: 'var(--text-sm)',
};

const smallButton: CSSProperties = {
  ...buttonSecondaryStyle,
  padding: '0.35rem 0.7rem',
  fontSize: 'var(--text-sm)',
};

/** Implementa US-006 (ART-014): "Registrar coproprietários de um imóvel com percentuais vigentes". */
export function CoproprietariosEditor({ imovelId, pessoas, onPessoaCriada }: Props) {
  const [vigentes, setVigentes] = useState<ImovelCoproprietario[]>([]);
  const [linhas, setLinhas] = useState<LinhaRascunho[]>([{ pessoaId: '', percentual: '' }]);
  const [novaPessoaNome, setNovaPessoaNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imovelId]);

  async function carregar() {
    try {
      const dados = await apiFetch<ImovelCoproprietario[]>(`/imoveis/${imovelId}/coproprietarios`);
      setVigentes(dados);
      setLinhas(
        dados.length > 0
          ? dados.map((d) => ({ pessoaId: d.pessoaId, percentual: String(d.percentual) }))
          : [{ pessoaId: '', percentual: '' }],
      );
      setCarregado(true);
    } catch {
      setErro('Falha ao carregar coproprietários.');
    }
  }

  function atualizarLinha(index: number, campo: keyof LinhaRascunho, valor: string) {
    setLinhas((atual) => atual.map((linha, i) => (i === index ? { ...linha, [campo]: valor } : linha)));
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { pessoaId: '', percentual: '' }]);
  }

  function removerLinha(index: number) {
    setLinhas((atual) => (atual.length > 1 ? atual.filter((_, i) => i !== index) : atual));
  }

  async function criarPessoaRapida() {
    if (!novaPessoaNome.trim()) return;
    try {
      const pessoa = await apiFetch<Pessoa>('/pessoas', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'FISICA', nome: novaPessoaNome.trim() }),
      });
      onPessoaCriada(pessoa);
      setNovaPessoaNome('');
      setLinhas((atual) => {
        const primeiraVazia = atual.findIndex((linha) => !linha.pessoaId);
        if (primeiraVazia >= 0) {
          return atual.map((linha, i) => (i === primeiraVazia ? { ...linha, pessoaId: pessoa.id } : linha));
        }
        return [...atual, { pessoaId: pessoa.id, percentual: '' }];
      });
    } catch {
      setErro('Falha ao criar pessoa.');
    }
  }

  const soma = linhas.reduce((total, linha) => total + (Number(linha.percentual) || 0), 0);
  const somaValida = Math.abs(soma - 100) < 0.01;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const coproprietarios = linhas
        .filter((linha) => linha.pessoaId && linha.percentual)
        .map((linha) => ({ pessoaId: linha.pessoaId, percentual: Number(linha.percentual) }));
      const resultado = await apiFetch<ImovelCoproprietario[]>(`/imoveis/${imovelId}/coproprietarios`, {
        method: 'POST',
        body: JSON.stringify({ coproprietarios }),
      });
      setVigentes(resultado);
    } catch {
      setErro('Falha ao salvar composição (a soma precisa ser exatamente 100%, CA-002 de ART-014).');
    } finally {
      setSalvando(false);
    }
  }

  function nomeDaPessoa(pessoaId: string) {
    return pessoas.find((p) => p.id === pessoaId)?.nome ?? pessoaId;
  }

  if (!carregado) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Carregando coproprietários...
      </p>
    );
  }

  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
      <strong style={{ fontSize: 'var(--text-sm)' }}>Coproprietários (US-006)</strong>

      {vigentes.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0.5rem 0',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
          }}
        >
          {vigentes.map((coproprietario) => (
            <li key={coproprietario.id}>
              {nomeDaPessoa(coproprietario.pessoaId)} — {coproprietario.percentual}% (vigente desde{' '}
              {coproprietario.vigenteDe})
            </li>
          ))}
        </ul>
      )}

      {linhas.map((linha, index) => (
        <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center' }}>
          <select
            aria-label="Pessoa coproprietária"
            value={linha.pessoaId}
            onChange={(evento) => atualizarLinha(index, 'pessoaId', evento.target.value)}
            style={{ ...smallInput, flex: '1 1 10rem' }}
          >
            <option value="">Selecione a pessoa...</option>
            {pessoas.map((pessoa) => (
              <option key={pessoa.id} value={pessoa.id}>
                {pessoa.nome}
              </option>
            ))}
          </select>
          <input
            aria-label="Percentual de participação"
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="%"
            value={linha.percentual}
            onChange={(evento) => atualizarLinha(index, 'percentual', evento.target.value)}
            style={{ ...smallInput, width: '5.5rem' }}
          />
          <button type="button" onClick={() => removerLinha(index)} style={smallButton} aria-label="Remover linha">
            ×
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={adicionarLinha} style={smallButton}>
          + linha
        </button>

        <input
          aria-label="Nome de nova pessoa"
          placeholder="Nome de nova pessoa"
          value={novaPessoaNome}
          onChange={(evento) => setNovaPessoaNome(evento.target.value)}
          style={{ ...smallInput, flex: '1 1 10rem' }}
        />
        <button type="button" onClick={criarPessoaRapida} style={smallButton}>
          + pessoa
        </button>
      </div>

      <div
        style={{
          marginTop: '0.5rem',
          fontSize: 'var(--text-sm)',
          color: somaValida ? 'var(--color-text-muted)' : 'var(--color-danger)',
        }}
      >
        Soma: {soma.toFixed(2)}% {somaValida ? '' : '(precisa ser exatamente 100%)'}
      </div>

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !somaValida}
        style={{ ...buttonStyle, marginTop: '0.5rem', padding: '0.4rem 0.9rem', fontSize: 'var(--text-sm)' }}
      >
        {salvando ? 'Salvando...' : 'Salvar composição'}
      </button>

      {erro && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>{erro}</p>}
    </div>
  );
}
