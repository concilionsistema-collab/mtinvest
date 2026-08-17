'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CriarTenantResultado } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import '../login/login.css';

/** minusculas/numeros/hifen - mesma regra do backend (CriarTenantDto). */
function paraSlug(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 49);
}

export default function SignupPage() {
  const { entrarComSessao } = useAuth();
  const router = useRouter();
  const [razaoSocial, setRazaoSocial] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
  const [nomeAdmin, setNomeAdmin] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function aoMudarRazaoSocial(valor: string) {
    setRazaoSocial(valor);
    if (!slugEditadoManualmente) setTenantId(paraSlug(valor));
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await apiFetch<CriarTenantResultado>('/tenants', {
        method: 'POST',
        body: JSON.stringify({ tenantId, razaoSocial, nomeAdmin, email, senha }),
      });
      entrarComSessao(resultado);
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.backendMessage) setErro(e.backendMessage);
      else setErro('Não foi possível criar sua conta. Verifique os dados e tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="login-experience">
      <div className="login-atmosphere" aria-hidden="true">
        <div className="login-stars" />
        <div className="login-light-rays"><i/><i/><i/><i/><i/></div>
        <div className="login-skyline">{Array.from({ length: 18 }, (_, index) => <span key={index} />)}</div>
        <div className="login-road"><i/><i/><i/><i/><i/></div>
        <div className="login-orbs"><i/><i/><i/><i/></div>
      </div>

      <section className="login-hero" aria-label="Apresentação CIONLARIS">
        <div className="login-hero__brand">
          <span className="login-brand-mark"><img src="/cionlaris-logo-transparent.png" alt="" aria-hidden="true" /></span>
          <span className="login-brand-wordmark"><img src="/cionlaris-logo-transparent.png" alt="CIONLARIS CRM Imobiliário by Concilion" /></span>
          <p>14 dias grátis.<br/>Sem cartão de crédito.</p>
        </div>
      </section>

      <section className="login-access-card" aria-labelledby="signup-title">
        <div className="login-card-glow" aria-hidden="true" />

        <header className="login-heading">
          <h1 id="signup-title">Crie sua <strong>conta</strong></h1>
          <p>Comece a usar o CIONLARIS agora mesmo</p>
        </header>

        <div className="login-divider"><span/><img src="/cionlaris-logo-transparent.png" alt="" aria-hidden="true"/><span/></div>

        <form className="login-form" onSubmit={criar}>
          <label>
            <span>Nome da imobiliária</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE821;</i><input value={razaoSocial} onChange={(e) => aoMudarRazaoSocial(e.target.value)} required minLength={2} placeholder="Ex.: Imobiliária Silva" autoFocus /></span>
          </label>

          <label>
            <span>Identificador da empresa (usado para entrar depois)</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE71B;</i><input value={tenantId} onChange={(e) => { setSlugEditadoManualmente(true); setTenantId(paraSlug(e.target.value)); }} required minLength={3} maxLength={49} pattern="[a-z0-9][a-z0-9-]{2,48}" placeholder="imobiliaria-silva" /></span>
          </label>

          <label>
            <span>Seu nome</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE77B;</i><input value={nomeAdmin} onChange={(e) => setNomeAdmin(e.target.value)} required minLength={2} placeholder="Seu nome completo" /></span>
          </label>

          <label>
            <span>E-mail</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE715;</i><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="seuemail@empresa.com" /></span>
          </label>

          <label>
            <span>Senha</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE72E;</i><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></span>
          </label>

          <button className="login-submit" type="submit" disabled={carregando}><span>{carregando ? 'Criando conta...' : 'Criar minha conta grátis'}</span><i aria-hidden="true">→</i></button>

          <div className="login-feedback" aria-live="polite">{erro && <p className="login-error">{erro}</p>}</div>
        </form>

        <footer><span className="fluent" aria-hidden="true">&#xE72E;</span>Já tem uma conta? <Link href="/login">Entrar</Link></footer>
      </section>
    </main>
  );
}
