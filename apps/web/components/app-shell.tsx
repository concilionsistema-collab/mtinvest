'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StatusAssinatura, Tarefa, Usuario, Visita } from '@crm/shared';
import { useAuth } from './auth-context';
import { TopThemeSelector } from './top-theme-selector';
import { FloatingAI } from './floating-ai';
import { PresentationMode } from './presentation-mode';
import { apiFetch } from '../lib/api';

function assinaturaBloqueada(status: StatusAssinatura): boolean {
  if (status.status === 'INADIMPLENTE' || status.status === 'CANCELADA') return true;
  if (status.status === 'TRIAL' && status.trialFimEm) return new Date(status.trialFimEm).getTime() <= Date.now();
  return false;
}

const ROTULOS_PERFIL: Record<Usuario['perfil'], string> = {
  GESTOR_UNIDADE: 'Gestor de unidade',
  CORRETOR: 'Corretor',
};

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase();
}

function formatarPrazo(prazoIso: string | null): string {
  if (!prazoIso) return 'Sem prazo';
  const dias = Math.floor((new Date(prazoIso).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return 'Atrasada';
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `Em ${dias} dias`;
}

const ESTADOS_VISITA_AGENDADA = ['AGENDADA', 'CONFIRMADA'];

const nav = [
  {href:'/',icon:'\uE80F',label:'Dashboard'},
  {href:'/leads',icon:'\uE77B',label:'Leads'},
  {href:'/imoveis',icon:'\uE821',label:'Imóveis'},
  {href:'/oportunidades',icon:'\uE81C',label:'Negociações'},
  {href:'/unidades',icon:'\uE716',label:'Unidades'},
  {href:'/visitas',icon:'\uECA5',label:'Visitas'},
  {href:'/propostas',icon:'\uE8A5',label:'Propostas'},
  {href:'/contratos',icon:'\uE73E',label:'Contratos'},
  {href:'/carteiras',icon:'\uE7EE',label:'Carteiras'},
  {href:'/tarefas',icon:'\uE9D5',label:'Tarefas'},
  {href:'/funil',icon:'\uE9D2',label:'Funil de Vendas'},
  {href:'/equipe',icon:'\uE125',label:'Equipe'},
  {href:'/marketing',icon:'\uE719',label:'Marketing'},
  {href:'/relatorios',icon:'\uE9D9',label:'Relatórios'},
  {href:'/financeiro',icon:'\uE8C7',label:'Financeiro'},
  {href:'/configuracoes',icon:'\uE713',label:'Configurações'},
  {href:'/locacao',icon:'\uE8F1',label:'Locação'},
  {href:'/pessoas',icon:'\uE125',label:'Pessoas'},
] as const;

type HeaderMenu = 'notificacoes' | 'agenda' | 'mensagens' | null;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname=usePathname(); const router=useRouter(); const {sessao,carregando,logout}=useAuth();
  // US-113: portal do proprietario/inquilino e publico (token opaco, RN-413) -
  // quem acessa nunca tem sessao de Usuario, entao nao pode ser redirecionado pro login.
  // /signup: onboarding self-service (POST /tenants) - visitante ainda nao tem sessao nenhuma.
  const login=pathname==='/login'||pathname==='/signup'||pathname.startsWith('/portal/');
  const [menuRecolhido,setMenuRecolhido]=useState(false);
  const [menuCabecalho,setMenuCabecalho]=useState<HeaderMenu>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [statusAssinatura, setStatusAssinatura] = useState<StatusAssinatura | null>(null);
  const [abrindoCheckout, setAbrindoCheckout] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<Usuario | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const headerActionsRef=useRef<HTMLDivElement>(null);
  const tituloPagina=nav.find((item)=>item.href===pathname)?.label ?? 'CIONLARIS';
  const novoHref=pathname==='/imoveis'?'/imoveis#novo-imovel':pathname==='/oportunidades'?'/oportunidades#nova-negociacao':pathname==='/unidades'?'/unidades#nova-unidade':'/leads#novo-lead';
  const novoRotulo=pathname==='/imoveis'?'＋ Novo Imóvel':pathname==='/oportunidades'?'＋ Nova Negociação':pathname==='/unidades'?'＋ Nova Unidade':'＋ Novo Lead';
  useEffect(()=>{if(!carregando&&!sessao&&!login)router.replace('/login');},[carregando,sessao,login,router]);
  useEffect(()=>{setMenuCabecalho(null);},[pathname]);
  // @SkipBillingCheck no backend (billing.controller.ts) - funciona mesmo
  // com a assinatura ja vencida, senao o bloqueio abaixo nunca conseguiria
  // se autoconsultar.
  useEffect(()=>{if(!sessao)return;apiFetch<StatusAssinatura>('/billing/status').then(setStatusAssinatura).catch(()=>{});},[sessao?.tenantId]);
  useEffect(()=>{if(!sessao)return;apiFetch<Usuario>('/usuarios/me').then(setUsuarioAtual).catch(()=>{});},[sessao?.tenantId]);
  useEffect(()=>{if(!sessao)return;apiFetch<Tarefa[]>('/tarefas').then(setTarefas).catch(()=>{});},[sessao?.tenantId]);
  useEffect(()=>{if(!sessao)return;apiFetch<Visita[]>('/visitas').then(setVisitas).catch(()=>{});},[sessao?.tenantId]);

  const tarefasPendentesLista = tarefas ? tarefas.filter((t)=>!t.concluida).sort((a,b)=>{
    if(!a.prazo&&!b.prazo)return 0; if(!a.prazo)return 1; if(!b.prazo)return -1;
    return new Date(a.prazo).getTime()-new Date(b.prazo).getTime();
  }) : null;
  const tarefasPendentes = tarefasPendentesLista ? tarefasPendentesLista.length : null;
  const percentualTarefasConcluidas = tarefas && tarefas.length>0 ? Math.round((tarefas.filter((t)=>t.concluida).length/tarefas.length)*100) : 0;
  const proximasVisitas = visitas ? visitas
    .filter((v)=>ESTADOS_VISITA_AGENDADA.includes(v.estado) && new Date(v.dataHora).getTime()>=Date.now())
    .sort((a,b)=>new Date(a.dataHora).getTime()-new Date(b.dataHora).getTime())
    .slice(0,3) : null;
  const dataHoje = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','').toUpperCase();

  async function iniciarCheckout(){
    setAbrindoCheckout(true);
    try{
      const resultado=await apiFetch<{url:string}>('/billing/checkout',{method:'POST'});
      window.location.href=resultado.url;
    }catch{
      setAbrindoCheckout(false);
    }
  }
  useEffect(()=>{const fecharFora=(evento:PointerEvent)=>{if(!headerActionsRef.current?.contains(evento.target as Node))setMenuCabecalho(null);};const fecharEsc=(evento:KeyboardEvent)=>{if(evento.key==='Escape')setMenuCabecalho(null);};document.addEventListener('pointerdown',fecharFora);document.addEventListener('keydown',fecharEsc);return()=>{document.removeEventListener('pointerdown',fecharFora);document.removeEventListener('keydown',fecharEsc);};},[]);
  if(login)return <div className="app-shell app-shell--login">{children}</div>;
  if(carregando)return <div className="app-loading">Carregando...</div>;
  if(!sessao)return null;
  if(statusAssinatura&&assinaturaBloqueada(statusAssinatura))return <div className="app-loading" style={{flexDirection:'column',gap:16,textAlign:'center',padding:24}}>
    <h1 style={{fontSize:22,margin:0}}>{statusAssinatura.status==='TRIAL'?'Seu período de teste terminou':statusAssinatura.status==='INADIMPLENTE'?'Pagamento pendente':'Assinatura cancelada'}</h1>
    <p style={{color:'var(--muted)',maxWidth:420,margin:0}}>{statusAssinatura.status==='TRIAL'?'Assine para continuar usando o sistema — seus dados continuam salvos.':statusAssinatura.status==='INADIMPLENTE'?'A última cobrança não foi confirmada. Regularize para voltar a acessar o sistema.':'Sua assinatura foi cancelada. Assine novamente para voltar a acessar o sistema.'}</p>
    {statusAssinatura.cobrancaIndisponivel
      ? <p style={{color:'var(--muted)',fontSize:13}}>Cobrança ainda não está configurada neste ambiente. Entre em contato com o suporte.</p>
      : <button type="button" onClick={iniciarCheckout} disabled={abrindoCheckout} className="new-lead" style={{border:'none'}}>{abrindoCheckout?'Abrindo...':'Assinar agora'}</button>}
    <button type="button" onClick={()=>{logout();router.replace('/login');}} style={{background:'none',border:0,color:'var(--muted)',textDecoration:'underline',cursor:'pointer'}}>Sair</button>
  </div>;
  if(pathname==='/unidades')return <div className="units-route-frame">
    <header className="units-route-header">
      <div className="units-route-heading"><span className="units-route-heading__icon fluent" aria-hidden="true">&#xE716;</span><div><h1>Unidades da Rede</h1><p>Gerencie filiais, equipes, carteiras e desempenho da operação.</p></div></div>
      <div className="units-route-actions" ref={headerActionsRef}>
        <button type="button" className="units-route-icon fluent" aria-label="Buscar unidades" onClick={()=>document.getElementById('unit-search')?.focus()}>&#xE721;</button>
        <button type="button" className="units-route-icon units-route-bell fluent" aria-label="Abrir notificações" aria-expanded={menuCabecalho==='notificacoes'} onClick={()=>setMenuCabecalho((atual)=>atual==='notificacoes'?null:'notificacoes')}>&#xEA8F;<i>3</i></button>
        {menuCabecalho==='notificacoes'&&<section className="units-route-popover" role="menu"><b>Notificações</b><small>3 atualizações da rede</small><Link href="/tarefas">Ver todas</Link></section>}
        <div className="units-route-user"><span className="units-route-avatar" role="img" aria-label={usuarioAtual?`Foto de ${usuarioAtual.nome}`:'Perfil do usuário'}>{usuarioAtual?iniciaisDe(usuarioAtual.nome):'RC'}<i/></span><div><b>{usuarioAtual?.nome??'Rafael Costa'}</b><small>Administrador</small></div><button type="button" onClick={()=>{logout();router.replace('/login');}} aria-label="Sair">⌄</button></div>
      </div>
    </header>
    <div className="units-route-shell">{children}</div>
  </div>;
  return <div className={`app-frame premium-app-frame${menuRecolhido?' app-frame--collapsed':''}`}>
    <aside className="app-sidebar premium-sidebar">
      <div className="brand tenant-brand"><div className="tenant-brand__identity"><img src="/mt-invest-shield.png" alt="Escudo MT INVEST"/><img src="/mt-invest-wordmark.png" alt="MT INVEST"/></div><button type="button" onClick={()=>setMenuRecolhido((atual)=>!atual)} aria-label={menuRecolhido?'Expandir menu':'Recolher menu'} aria-expanded={!menuRecolhido}>☰</button></div>
      <nav>{nav.map((item,index)=><Link key={item.href} href={item.href} aria-label={item.label} title={item.label} className={pathname===item.href?'active':''}><span className={`premium-nav-icon premium-nav-icon--${index+1}`}><span className="fluent" aria-hidden="true">{item.icon}</span></span><b>{item.label}</b><i aria-hidden="true">›</i></Link>)}</nav>
      <div className="mobile-card"><div className="phone-mock"><span>⌂</span><span>◫</span><span>♙</span><span>▦</span></div><div><b>CIONLARIS</b><small>Mobile</small><p>Gerencie seu negócio<br/>de onde estiver.</p><em> App Store</em><em>▶ Google Play</em></div></div>
      <Link href="/tarefas" className="goal-card" style={{display:'block',textDecoration:'none',color:'inherit'}}><div><b>Minhas Tarefas</b><span>ⓘ</span></div><div className="goal-body"><div className="goal-ring">{tarefas?`${percentualTarefasConcluidas}%`:'…'}</div><p><strong>{tarefasPendentes??'…'}</strong><small>pendente(s)</small><small>{tarefas?`${percentualTarefasConcluidas}% concluídas`:'Carregando...'}</small></p></div></Link>
      <div className="system-creator-brand"><small>CRM desenvolvido por</small><img src="/cionlaris-logo-transparent.png" alt="CIONLARIS CRM Imobiliário by Concilion"/></div>
    </aside>
    <div className="app-main"><header className="app-header"><div className="header-page-title"><b>{pathname==='/unidades'?'Unidades da Rede':tituloPagina}</b><small>{pathname==='/'?'Visão geral do negócio':pathname==='/leads'?'Gerencie seus leads e transforme oportunidades em vendas':pathname==='/imoveis'?'Gerencie seu portfólio de imóveis e acompanhe o desempenho de vendas':pathname==='/oportunidades'?'Acompanhe o andamento de todas as negociações':pathname==='/unidades'?'Gerencie filiais, equipes, carteiras e desempenho da operação.':'Gestão imobiliária'}</small></div><div className="search"><span className="fluent">&#xE721;</span><input aria-label="Buscar" placeholder={pathname==='/imoveis'?'Buscar imóveis, leads, proprietários, bairros...':pathname==='/oportunidades'?'Buscar negociações, leads, imóveis ou clientes...':pathname==='/unidades'?'Buscar unidade, cidade ou responsável...':'Buscar leads, clientes, imóveis, oportunidades...'}/><span className="fluent">&#xE11A;</span></div>
      {statusAssinatura?.status==='TRIAL'&&statusAssinatura.diasRestantesTrial!==null&&<Link href="/configuracoes" style={{padding:'6px 12px',borderRadius:20,fontSize:11,color:'var(--muted)',border:'1px solid var(--line)',whiteSpace:'nowrap'}}>Teste grátis: {statusAssinatura.diasRestantesTrial===0?'último dia':`${statusAssinatura.diasRestantesTrial} dia(s)`}</Link>}
      <button type="button" onClick={() => setPresentationOpen(true)} className="new-lead" style={{background: 'linear-gradient(135deg, var(--purple), #5d35be)', border: 'none'}}><span className="fluent">&#xE71C;</span> Apresentação Executiva</button>
      <Link href={novoHref} className="new-lead">{novoRotulo}</Link>
      <TopThemeSelector />
      <div className="header-actions" ref={headerActionsRef}>
        <button type="button" className={`head-icon fluent${menuCabecalho==='notificacoes'?' head-icon--active':''}`} aria-label="Abrir notificações" aria-haspopup="menu" aria-expanded={menuCabecalho==='notificacoes'} onClick={()=>setMenuCabecalho((atual)=>atual==='notificacoes'?null:'notificacoes')}>&#xEA8F;{!!tarefasPendentes&&tarefasPendentes>0&&<i>{tarefasPendentes}</i>}</button>
        <button type="button" className={`head-icon fluent${menuCabecalho==='agenda'?' head-icon--active':''}`} aria-label="Abrir agenda" aria-haspopup="menu" aria-expanded={menuCabecalho==='agenda'} onClick={()=>setMenuCabecalho((atual)=>atual==='agenda'?null:'agenda')}>&#xE787;</button>
        <button type="button" className={`head-icon fluent${menuCabecalho==='mensagens'?' head-icon--active':''}`} aria-label="Abrir mensagens" aria-haspopup="menu" aria-expanded={menuCabecalho==='mensagens'} onClick={()=>setMenuCabecalho((atual)=>atual==='mensagens'?null:'mensagens')}>&#xE8BD;</button>
        {menuCabecalho&&<section className={`header-popover header-popover--${menuCabecalho}`} role="menu" aria-label={menuCabecalho==='notificacoes'?'Notificações':menuCabecalho==='agenda'?'Agenda':'Mensagens'}>
          {menuCabecalho==='notificacoes'&&<><header><div><b>Tarefas pendentes</b><small>{tarefasPendentes??'…'} no total</small></div></header><ul>{!tarefasPendentesLista?<li style={{color:'var(--muted)',fontSize:11}}>Carregando...</li>:tarefasPendentesLista.length===0?<li style={{color:'var(--muted)',fontSize:11}}>Nenhuma tarefa pendente.</li>:tarefasPendentesLista.slice(0,3).map((t)=><li key={t.id}><span className="popover-icon popover-icon--purple">✓</span><div><b>{t.titulo}</b><small>{formatarPrazo(t.prazo)}</small></div></li>)}</ul><footer><Link href="/tarefas">Ver todas as tarefas</Link></footer></>}
          {menuCabecalho==='agenda'&&<><header><div><b>Próximas visitas</b><small>{proximasVisitas?`${proximasVisitas.length} agendada(s)`:'Carregando...'}</small></div><span>{dataHoje}</span></header><ul>{!proximasVisitas?<li style={{color:'var(--muted)',fontSize:11}}>Carregando...</li>:proximasVisitas.length===0?<li style={{color:'var(--muted)',fontSize:11}}>Nenhuma visita agendada.</li>:proximasVisitas.map((v)=><li key={v.id}><span className="popover-time">{new Date(v.dataHora).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} {new Date(v.dataHora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span><div><b>{v.estado==='CONFIRMADA'?'Visita confirmada':'Visita agendada'}</b></div></li>)}</ul><footer><Link href="/visitas">Abrir agenda completa</Link></footer></>}
          {menuCabecalho==='mensagens'&&<><header><div><b>Mensagens</b><small>Ainda não disponível</small></div></header><p style={{color:'var(--muted)',fontSize:11,padding:'8px 4px'}}>Esse recurso ainda não está disponível nesta versão.</p></>}
        </section>}
      </div>
      <div className="user"><span className="avatar" role="img" aria-label={usuarioAtual?`Foto de ${usuarioAtual.nome}`:'Carregando avatar'}>{usuarioAtual?iniciaisDe(usuarioAtual.nome):'…'}</span><div><b>{usuarioAtual?.nome??'Carregando...'}</b><small>{usuarioAtual?ROTULOS_PERFIL[usuarioAtual.perfil]:''}</small></div><button onClick={()=>{logout();router.replace('/login');}} aria-label="Sair">⌄</button></div></header><div className="app-shell">{children}</div>
      <FloatingAI />
      <PresentationMode isOpen={presentationOpen} onClose={() => setPresentationOpen(false)} />
    </div>
  </div>;
}
