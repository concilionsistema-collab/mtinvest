'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { StatusAssinatura, Unidade, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './configuracoes.module.css';

const AVISO_INDISPONIVEL = 'Esse recurso ainda não está disponível nesta versão.';

const ROTULOS_PERFIL: Record<Usuario['perfil'], string> = {
  GESTOR_UNIDADE: 'Gestor de unidade',
  CORRETOR: 'Corretor',
};

type TabId = 'conta' | 'seguranca' | 'preferencias' | 'notificacoes' | 'unidade' | 'avancado';

const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
  { id: 'conta', label: 'Minha Conta', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { id: 'seguranca', label: 'Segurança', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  { id: 'preferencias', label: 'Preferências', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'notificacoes', label: 'Notificações', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> },
  { id: 'unidade', label: 'Unidade e Plano', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: 'avancado', label: 'Avançado', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
];

const RODULOS_TAB_INDISPONIVEL: Record<Exclude<TabId, 'conta' | 'seguranca' | 'unidade'>, string> = {
  preferencias: 'Preferências',
  notificacoes: 'Notificações',
  avancado: 'Avançado',
};

const ROTULO_STATUS_ASSINATURA: Record<StatusAssinatura['status'], string> = {
  TRIAL: 'Período de teste',
  ATIVA: 'Ativa',
  INADIMPLENTE: 'Pagamento pendente',
  CANCELADA: 'Cancelada',
};

export default function ConfiguracoesPage() {
  const { sessao } = useAuth();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState<TabId>('conta');
  const [aviso, setAviso] = useState<string | null>(null);
  const [statusAssinatura, setStatusAssinatura] = useState<StatusAssinatura | null>(null);
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);
  const [abrindoCheckout, setAbrindoCheckout] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [mensagemSenha, setMensagemSenha] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([apiFetch<Usuario>('/usuarios/me'), apiFetch<Unidade[]>('/unidades')])
      .then(([dadosUsuario, listaUnidades]) => { setUsuario(dadosUsuario); setUnidades(listaUnidades); })
      .catch(() => setErroPerfil('Falha ao carregar dados da conta.'));
    apiFetch<StatusAssinatura>('/billing/status').then(setStatusAssinatura).catch(() => setErroAssinatura('Falha ao carregar dados da assinatura.'));
  }, [sessao?.tenantId]);

  const nomeUnidade = usuario ? (unidades.find((u) => u.id === usuario.unidadeId)?.nomeFantasia ?? 'Unidade não encontrada') : '';
  function acaoIndisponivel() { setAviso(AVISO_INDISPONIVEL); }

  async function iniciarCheckout() {
    setAbrindoCheckout(true);
    setErroAssinatura(null);
    try {
      const resultado = await apiFetch<{ url: string }>('/billing/checkout', { method: 'POST' });
      window.location.href = resultado.url;
    } catch (e) {
      setErroAssinatura(e instanceof ApiError && e.backendMessage ? e.backendMessage : 'Não foi possível iniciar a assinatura.');
      setAbrindoCheckout(false);
    }
  }

  async function trocarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoSenha(true);
    setErroSenha(null);
    setMensagemSenha(null);

    if (novaSenha !== confirmarSenha) {
      setErroSenha('As senhas não coincidem.');
      setSalvandoSenha(false);
      return;
    }

    try {
      await apiFetch('/usuarios/me/senha', {
        method: 'PATCH',
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
      setMensagemSenha('Senha alterada com sucesso.');
    } catch (e) {
      setErroSenha(e instanceof ApiError && e.status === 401 ? 'Senha atual incorreta.' : 'Falha ao alterar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (!sessao) return null;

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1>Configurações</h1>
        <p>Gerencie sua conta, preferências e segurança</p>
      </div>

      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button key={tab.id} className={`${styles.tab} ${tab.id === abaSelecionada ? styles.tabActive : ''}`} onClick={() => setAbaSelecionada(tab.id)}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {aviso && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>{aviso} <button onClick={() => setAviso(null)} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>fechar</button></p>}

      <div className={styles.grid}>
        <div className={styles.column}>
          {abaSelecionada !== 'conta' && abaSelecionada !== 'seguranca' && abaSelecionada !== 'unidade' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>{RODULOS_TAB_INDISPONIVEL[abaSelecionada]}</h2>
                <p>Esse recurso ainda não está disponível nesta versão.</p>
              </div>
            </div>
          )}

          {abaSelecionada === 'unidade' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Unidade e Plano</h2>
                <p>Unidade: {nomeUnidade || 'Carregando...'}</p>
              </div>

              {erroAssinatura && <p style={{ color: '#ef4444', fontSize: 13 }}>{erroAssinatura}</p>}
              {!statusAssinatura && !erroAssinatura && <p style={{ color: 'var(--muted)' }}>Carregando...</p>}
              {statusAssinatura && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className={styles.userInfoRow}>
                    <b>Status da assinatura:</b>&nbsp;{ROTULO_STATUS_ASSINATURA[statusAssinatura.status]}
                  </div>
                  {statusAssinatura.status === 'TRIAL' && statusAssinatura.diasRestantesTrial !== null && (
                    <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                      {statusAssinatura.diasRestantesTrial === 0 ? 'Seu período de teste termina hoje.' : `Faltam ${statusAssinatura.diasRestantesTrial} dia(s) do seu período de teste gratuito.`}
                    </p>
                  )}
                  {statusAssinatura.status === 'INADIMPLENTE' && (
                    <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>A última cobrança não foi confirmada. Regularize o pagamento para não perder o acesso.</p>
                  )}
                  {statusAssinatura.status === 'CANCELADA' && (
                    <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>Sua assinatura foi cancelada.</p>
                  )}

                  {statusAssinatura.cobrancaIndisponivel ? (
                    <p style={{ color: 'var(--muted)', fontSize: 12 }}>Cobrança ainda não está configurada neste ambiente.</p>
                  ) : statusAssinatura.status !== 'ATIVA' ? (
                    <button type="button" className={styles.submitBtn} onClick={iniciarCheckout} disabled={abrindoCheckout} style={{ width: 'fit-content' }}>
                      {abrindoCheckout ? 'Abrindo...' : 'Assinar agora'}
                    </button>
                  ) : (
                    <p style={{ color: '#34d399', fontSize: 13, margin: 0 }}>Assinatura ativa. Obrigado por assinar o CIONLARIS!</p>
                  )}
                </div>
              )}
            </div>
          )}

          {abaSelecionada === 'conta' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Meus dados</h2>
              <p>Informações da sua conta e papel no sistema.</p>
            </div>

            {erroPerfil && <p>{erroPerfil}</p>}
            {!erroPerfil && !usuario && <p style={{ color: 'var(--muted)' }}>Carregando...</p>}
            {usuario && (
              <>
                <div className={styles.profileInfo}>
                  <div className={styles.avatarWrapper}>
                    {/* Placeholder for avatar image */}
                    <div className={styles.avatar}>{usuario.nome.charAt(0).toUpperCase()}</div>
                    <div className={styles.editAvatarBtn}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </div>
                  </div>
                  <div className={styles.userDetails}>
                    <div className={styles.userNameRow}>
                      <h3>{usuario.nome}</h3>
                      <span className={styles.roleBadge}>{ROTULOS_PERFIL[usuario.perfil]}</span>
                    </div>
                    <div className={styles.userInfoRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      {usuario.email ?? 'Sem e-mail cadastrado'}
                    </div>
                    <div className={styles.userInfoRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      Unidade: {nomeUnidade}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          )}

          {abaSelecionada === 'seguranca' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Trocar senha</h2>
              <p>Mantenha sua conta sempre segura.</p>
            </div>
            <form onSubmit={trocarSenha} className={styles.formGroup}>
              <div className={styles.inputWrapper}>
                <div className={styles.inputIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                </div>
                <input
                  aria-label="Senha atual"
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                  className={styles.input}
                  placeholder="Senha atual"
                />
              </div>
              <div className={styles.inputWrapper}>
                <div className={styles.inputIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <input
                  aria-label="Nova senha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  minLength={8}
                  className={styles.input}
                  placeholder="Nova senha (mínimo 8 caracteres)"
                />
              </div>
              <div className={styles.inputWrapper}>
                <div className={styles.inputIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <input
                  aria-label="Confirmar nova senha"
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  minLength={8}
                  className={styles.input}
                  placeholder="Confirmar nova senha"
                />
              </div>
              <button type="submit" className={styles.submitBtn} disabled={salvandoSenha}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {salvandoSenha ? 'Salvando...' : 'Salvar nova senha'}
              </button>
              {mensagemSenha && <p style={{ color: '#34d399', fontSize: 13, margin: 0 }}>{mensagemSenha}</p>}
              {erroSenha && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{erroSenha}</p>}
            </form>
          </div>
          )}
        </div>

        <div className={styles.column}>
          {/* Acesso Rápido Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Acesso rápido</h2>
              <p>Links úteis para administrar sua conta.</p>
            </div>
            
            <div className={styles.linksList}>
              <button type="button" className={styles.linkItem} onClick={acaoIndisponivel}>
                <div className={styles.linkContent}>
                  <div className={`${styles.linkIconBox} ${styles.linkIconBoxYellow}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  </div>
                  <div>
                    <h4 className={styles.linkItemTitle}>Gerenciar dispositivos</h4>
                    <p className={styles.linkItemDesc}>Veja e encerre sessões ativas</p>
                  </div>
                </div>
                <div className={styles.linkChevron}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              <Link href="/auditoria" className={styles.linkItem}>
                <div className={styles.linkContent}>
                  <div className={`${styles.linkIconBox} ${styles.linkIconBoxGreen}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <div>
                    <h4 className={styles.linkItemTitle}>Auditoria da unidade</h4>
                    <p className={styles.linkItemDesc}>Veja o histórico de ações realizadas</p>
                  </div>
                </div>
                <div className={styles.linkChevron}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </Link>

              <button type="button" className={styles.linkItem} onClick={acaoIndisponivel}>
                <div className={styles.linkContent}>
                  <div className={`${styles.linkIconBox} ${styles.linkIconBoxBlue}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </div>
                  <div>
                    <h4 className={styles.linkItemTitle}>Exportar meus dados</h4>
                    <p className={styles.linkItemDesc}>Baixe um backup das suas informações</p>
                  </div>
                </div>
                <div className={styles.linkChevron}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>

              <button type="button" className={styles.linkItem} onClick={acaoIndisponivel}>
                <div className={styles.linkContent}>
                  <div className={`${styles.linkIconBox} ${styles.linkIconBoxRed}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </div>
                  <div>
                    <h4 className={`${styles.linkItemTitle} ${styles.linkItemTitleRed}`}>Excluir minha conta</h4>
                    <p className={styles.linkItemDesc}>Ação permanente e irreversível</p>
                  </div>
                </div>
                <div className={styles.linkChevron}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </button>
            </div>
          </div>

          {/* Outros Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Outros</h2>
              <p>Recursos adicionais da sua conta.</p>
            </div>

            <div className={styles.integrationsBox}>
              <div className={styles.integrationsInfo}>
                <h4 className={styles.integrationsTitle}>Integrações</h4>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>Nenhuma integração conectada ainda (WhatsApp, Google, calendário). Em breve.</p>
              </div>
              <div className={styles.helpBox}>
                <h4>Precisa de ajuda?</h4>
                <p>O assistente no canto inferior direito responde com sugestões pré-configuradas — ainda não está conectado aos seus dados reais.</p>
                <div style={{ position: 'absolute', bottom: -8, right: 16, width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '8px solid rgba(255, 255, 255, 0.05)' }}></div>
              </div>
            </div>

            <Link href="/auditoria" className={styles.auditLogBox}>
              <div className={styles.auditLogIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
              </div>
              <div className={styles.auditLogInfo}>
                <p>Ver log de auditoria da unidade →</p>
                <small>Acompanhe todas as alterações e atividades.</small>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
