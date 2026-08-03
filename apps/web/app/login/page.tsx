'use client';

import { FormEvent, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth-context';
import './login.css';

/** Implementa US-002/US-003 (ART-014, EPIC-01 - Identidade e fundação). */
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [tenantId, setTenantId] = useState('tenant-demo');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCarregando(true);
    setErro(null);
    setAviso(null);
    try {
      await login({ tenantId, email, senha });
      router.replace('/');
    } catch {
      setErro('E-mail, senha ou empresa (tenant) inválidos.');
    } finally {
      setCarregando(false);
    }
  }

  function moverCenario(evento: ReactPointerEvent<HTMLElement>) {
    const area = evento.currentTarget.getBoundingClientRect();
    evento.currentTarget.style.setProperty('--pointer-x', `${((evento.clientX - area.left) / area.width - .5) * 22}px`);
    evento.currentTarget.style.setProperty('--pointer-y', `${((evento.clientY - area.top) / area.height - .5) * 12}px`);
  }

  return (
    <main className="login-experience" onPointerMove={moverCenario}>
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
          <p>Inteligência que <strong>conecta.</strong><br/>Tecnologia que <strong>transforma.</strong></p>
        </div>

      </section>

      <section className="login-access-card" aria-labelledby="login-title">
        <div className="login-card-glow" aria-hidden="true" />
        <label className="login-language"><span aria-hidden="true">◎</span><select aria-label="Idioma"><option>Português</option><option>English</option><option>Español</option></select></label>

        <header className="login-heading">
          <h1 id="login-title">Bem-vindo <strong>de volta!</strong></h1>
          <p>Faça login para continuar sua jornada</p>
        </header>

        <div className="login-divider"><span/><img src="/cionlaris-logo-transparent.png" alt="" aria-hidden="true"/><span/></div>

        <form className="login-form" onSubmit={entrar}>
          <label>
            <span>Empresa (tenant)</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE821;</i><input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required autoComplete="organization" />{tenantId.length > 2 && <b aria-label="Empresa preenchida">✓</b>}</span>
          </label>

          <label>
            <span>E-mail</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE715;</i><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="seuemail@empresa.com" />{email.includes('@') && <b aria-label="E-mail preenchido">✓</b>}</span>
          </label>

          <label>
            <span>Senha</span>
            <span className="login-field"><i className="fluent" aria-hidden="true">&#xE72E;</i><input type={mostrarSenha ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" placeholder="Digite sua senha"/><button type="button" onClick={() => setMostrarSenha((valor) => !valor)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} className="fluent">{mostrarSenha ? '\uE890' : '\uED1A'}</button></span>
          </label>

          <div className="login-options"><label><input type="checkbox" defaultChecked/><span>✓</span>Lembrar de mim</label><button type="button" onClick={() => { setErro(null); setAviso('Entre em contato com o administrador da sua empresa para redefinir a senha.'); }}>Esqueceu sua senha?</button></div>

          <button className="login-submit" type="submit" disabled={carregando}><span>{carregando ? 'Entrando...' : 'Entrar na Plataforma'}</span><i aria-hidden="true">→</i></button>

          <div className="login-feedback" aria-live="polite">{erro && <p className="login-error">{erro}</p>}{aviso && <p className="login-info">{aviso}</p>}</div>
        </form>

        <footer><span className="fluent" aria-hidden="true">&#xE72E;</span>Seus dados estão protegidos com criptografia de ponta</footer>
      </section>
    </main>
  );
}
