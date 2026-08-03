'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { THEMES, useTheme } from '../../components/theme-context';
import { apiFetch, ApiError } from '../../lib/api';
import { buttonStyle, cardStyle, inputStyle } from '../../lib/styles';

const ROTULOS_PERFIL: Record<Usuario['perfil'], string> = {
  GESTOR_UNIDADE: 'Gestor de unidade',
  CORRETOR: 'Corretor',
};

export default function ConfiguracoesPage() {
  const { sessao } = useAuth();
  const { tema, definirTema } = useTheme();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [mensagemSenha, setMensagemSenha] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    apiFetch<Usuario>('/usuarios/me')
      .then(setUsuario)
      .catch(() => setErroPerfil('Falha ao carregar dados da conta.'));
  }, [sessao?.tenantId]);

  async function trocarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoSenha(true);
    setErroSenha(null);
    setMensagemSenha(null);
    try {
      await apiFetch('/usuarios/me/senha', {
        method: 'PATCH',
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      setSenhaAtual('');
      setNovaSenha('');
      setMensagemSenha('Senha alterada com sucesso.');
    } catch (e) {
      setErroSenha(e instanceof ApiError && e.status === 401 ? 'Senha atual incorreta.' : 'Falha ao alterar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (!sessao) return null;

  return (
    <main>
      <h1>Configurações</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Dados da sua própria conta. Configurações da unidade/rede ficam em Unidades.
      </p>

      <section className="appearance-settings" aria-labelledby="appearance-title">
        <header className="appearance-settings__head">
          <div><h2 id="appearance-title">Aparência</h2><p>Escolha o tema visual do Concilion CRM. Sua preferência fica salva neste dispositivo.</p></div>
          <span className="appearance-settings__current">Tema atual: {THEMES.find((item) => item.id === tema)?.nome}</span>
        </header>
        <div className="theme-selector" role="group" aria-label="Temas do sistema">
          {THEMES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`theme-option theme-option--${item.id}${tema === item.id ? ' active' : ''}`}
              aria-pressed={tema === item.id}
              onClick={() => definirTema(item.id)}
            >
              {item.recomendado && <em className="theme-option__recommended">Padrão recomendado</em>}
              <span className="theme-option__preview" aria-hidden="true"><i className="theme-option__sidebar"/><span className="theme-option__content"><i/><i/><i/></span></span>
              <span className="theme-option__copy"><span><b>{item.nome}</b><small>{item.descricao}</small></span><i className="theme-option__check" aria-hidden="true">✓</i></span>
            </button>
          ))}
        </div>
      </section>

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Meus dados</h2>
      {erroPerfil && <p>{erroPerfil}</p>}
      {!erroPerfil && !usuario && <p style={{ color: 'var(--muted)' }}>Carregando...</p>}
      {usuario && (
        <div style={{ ...cardStyle, maxWidth: 420 }}>
          <p><b>{usuario.nome}</b></p>
          <p style={{ color: 'var(--muted)' }}>{usuario.email}</p>
          <p style={{ color: 'var(--muted)' }}>{ROTULOS_PERFIL[usuario.perfil]}</p>
        </div>
      )}

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Trocar senha</h2>
      <form onSubmit={trocarSenha} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, marginTop: 12 }}>
        <input
          aria-label="Senha atual"
          type="password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          required
          style={inputStyle}
          placeholder="Senha atual"
        />
        <input
          aria-label="Nova senha"
          type="password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
          placeholder="Nova senha (mínimo 8 caracteres)"
        />
        <button style={buttonStyle} disabled={salvandoSenha}>{salvandoSenha ? 'Salvando...' : 'Salvar nova senha'}</button>
        {mensagemSenha && <p style={{ color: 'var(--green)' }}>{mensagemSenha}</p>}
        {erroSenha && <p>{erroSenha}</p>}
      </form>

      <h2 style={{ fontSize: 14, marginTop: 20 }}>Outros</h2>
      <p><Link href="/auditoria">Ver log de auditoria da unidade →</Link></p>
    </main>
  );
}
