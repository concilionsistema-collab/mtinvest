'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './configuracoes.module.css';

const ROTULOS_PERFIL: Record<Usuario['perfil'], string> = {
  GESTOR_UNIDADE: 'Gestor de unidade',
  CORRETOR: 'Corretor',
};

const TABS = [
  { id: 'conta', label: 'Minha Conta', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { id: 'seguranca', label: 'Segurança', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  { id: 'preferencias', label: 'Preferências', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'notificacoes', label: 'Notificações', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> },
  { id: 'unidade', label: 'Unidade e Plano', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: 'avancado', label: 'Avançado', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
];

export default function ConfiguracoesPage() {
  const { sessao } = useAuth();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
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
          <button key={tab.id} className={`${styles.tab} ${tab.id === 'conta' ? styles.tabActive : ''}`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          {/* Meus Dados Card */}
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
                      {usuario.email}
                    </div>
                    <div className={styles.userInfoRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      (16) 99123-4567
                    </div>
                    <div className={styles.userInfoRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      Unidade: Matriz - São Paulo
                    </div>
                  </div>
                </div>

                <div className={styles.statsGrid}>
                  <div className={styles.statBox}>
                    <div className={styles.statLabel}>Leads atribuídos</div>
                    <div className={styles.statValue}>128</div>
                    <div className={styles.statDesc}>Este mês</div>
                  </div>
                  <div className={`${styles.statBox} ${styles.statBoxGreen}`}>
                    <div className={`${styles.statLabel} ${styles.statLabelGreen}`}>Negociações</div>
                    <div className={styles.statValue}>R$ 2,48 mi</div>
                    <div className={styles.statDesc}>Em andamento</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={`${styles.statLabel} ${styles.statLabelPurple}`}>Conversão</div>
                    <div className={styles.statValue}>18,7%</div>
                    <div className={styles.statDesc}>Este mês</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Trocar Senha Card */}
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
        </div>

        <div className={styles.column}>
          {/* Acesso Rápido Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Acesso rápido</h2>
              <p>Links úteis para administrar sua conta.</p>
            </div>
            
            <div className={styles.linksList}>
              <Link href="#" className={styles.linkItem}>
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
              </Link>
              
              <Link href="#" className={styles.linkItem}>
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
              
              <Link href="#" className={styles.linkItem}>
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
              </Link>
              
              <Link href="#" className={styles.linkItem}>
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
              </Link>
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
                <h4 className={styles.integrationsTitle}>Integrações conectadas <small>8 serviços ativos</small></h4>
                <div className={styles.integrationsIcons}>
                  {/* WhatsApp */}
                  <div className={styles.integrationIcon} style={{ color: '#25D366' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                  </div>
                  {/* Google */}
                  <div className={styles.integrationIcon}>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  </div>
                  {/* Email */}
                  <div className={styles.integrationIcon} style={{ color: '#8b5cf6' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </div>
                  {/* Calendar */}
                  <div className={styles.integrationIcon} style={{ color: '#3b82f6' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><text x="12" y="17" fontSize="8" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">31</text></svg>
                  </div>
                  {/* Discord/Chat */}
                  <div className={styles.integrationIcon} style={{ color: '#6366f1' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 1 4.28L2 22l5.72-1c1.28.64 2.74 1 4.28 1 5.52 0 10-4.48 10-10S17.52 2 12 2zM8.5 13.5h-1v-3h1v3zm3.5 0h-1v-3h1v3zm3.5 0h-1v-3h1v3z"/></svg>
                  </div>
                  <div className={styles.integrationMore}>+3</div>
                </div>
                <Link href="#" className={styles.integrationsLink}>Gerenciar integrações →</Link>
              </div>
              <div className={styles.helpBox}>
                <h4>Precisa de ajuda?</h4>
                <p>Fale com o assistente CION.ai</p>
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
