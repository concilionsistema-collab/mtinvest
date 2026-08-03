'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';

const nav = [
  {href:'/',icon:'\uE80F',label:'Dashboard'},
  {href:'/leads',icon:'\uE77B',label:'Leads',asset:'/metric-leads-3d.png'},
  {href:'/imoveis',icon:'\uE821',label:'Imóveis',asset:'/metric-properties-3d.png'},
  {href:'/oportunidades',icon:'\uE81C',label:'Negociações',asset:'/metric-negotiations-3d.png'},
  {href:'/unidades',icon:'\uE716',label:'Unidades',asset:'/metric-properties-3d.png'},
  {href:'/visitas',icon:'\uECA5',label:'Visitas',asset:'/metric-visits-3d.png'},
  {href:'/propostas',icon:'\uE8A5',label:'Propostas'},
  {href:'/contratos',icon:'\uE73E',label:'Contratos',asset:'/metric-sales-3d.png'},
  {href:'/carteiras',icon:'\uE7EE',label:'Carteiras'},
  {href:'/tarefas',icon:'\uE9D5',label:'Tarefas'},
  {href:'/funil',icon:'\uE9D2',label:'Funil de Vendas'},
  {href:'/marketing',icon:'\uE719',label:'Marketing'},
  {href:'/relatorios',icon:'\uE9D9',label:'Relatórios'},
  {href:'/financeiro',icon:'\uE8C7',label:'Financeiro',asset:'/metric-revenue-3d.png'},
  {href:'/configuracoes',icon:'\uE713',label:'Configurações'},
  {href:'/locacao',icon:'\uE8F1',label:'Locação'},
] as const;

type HeaderMenu = 'notificacoes' | 'agenda' | 'mensagens' | null;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname=usePathname(); const router=useRouter(); const {sessao,carregando,logout}=useAuth(); const login=pathname==='/login';
  const [menuRecolhido,setMenuRecolhido]=useState(false);
  const [menuCabecalho,setMenuCabecalho]=useState<HeaderMenu>(null);
  const [notificacoesNaoLidas,setNotificacoesNaoLidas]=useState(8);
  const headerActionsRef=useRef<HTMLDivElement>(null);
  const tituloPagina=nav.find((item)=>item.href===pathname)?.label ?? 'CIONLARIS';
  const novoHref=pathname==='/imoveis'?'/imoveis#novo-imovel':pathname==='/oportunidades'?'/oportunidades#nova-negociacao':'/leads#novo-lead';
  const novoRotulo=pathname==='/imoveis'?'＋ Novo Imóvel':pathname==='/oportunidades'?'＋ Nova Negociação':'＋ Novo Lead';
  useEffect(()=>{if(!carregando&&!sessao&&!login)router.replace('/login');},[carregando,sessao,login,router]);
  useEffect(()=>{setMenuCabecalho(null);},[pathname]);
  useEffect(()=>{const fecharFora=(evento:PointerEvent)=>{if(!headerActionsRef.current?.contains(evento.target as Node))setMenuCabecalho(null);};const fecharEsc=(evento:KeyboardEvent)=>{if(evento.key==='Escape')setMenuCabecalho(null);};document.addEventListener('pointerdown',fecharFora);document.addEventListener('keydown',fecharEsc);return()=>{document.removeEventListener('pointerdown',fecharFora);document.removeEventListener('keydown',fecharEsc);};},[]);
  if(login)return <div className="app-shell app-shell--login">{children}</div>;
  if(carregando)return <div className="app-loading">Carregando...</div>;
  if(!sessao)return null;
  return <div className={`app-frame premium-app-frame${menuRecolhido?' app-frame--collapsed':''}`}>
    <aside className="app-sidebar premium-sidebar">
      <div className="brand tenant-brand"><div className="tenant-brand__identity"><img src="/mt-invest-shield.png" alt="Escudo MT INVEST"/><img src="/mt-invest-wordmark.png" alt="MT INVEST"/></div><button type="button" onClick={()=>setMenuRecolhido((atual)=>!atual)} aria-label={menuRecolhido?'Expandir menu':'Recolher menu'} aria-expanded={!menuRecolhido}>☰</button></div>
      <nav>{nav.map((item,index)=><Link key={item.href} href={item.href} aria-label={item.label} className={pathname===item.href?'active':''}><span className={`premium-nav-icon premium-nav-icon--${index+1}`}>{'asset' in item?<img src={item.asset} alt=""/>:<span className="fluent">{item.icon}</span>}</span><b>{item.label}</b><i aria-hidden="true">›</i></Link>)}</nav>
      <div className="mobile-card"><div className="phone-mock"><span>⌂</span><span>◫</span><span>♙</span><span>▦</span></div><div><b>CIONLARIS</b><small>Mobile</small><p>Gerencie seu negócio<br/>de onde estiver.</p><em> App Store</em><em>▶ Google Play</em></div></div>
      {pathname==='/imoveis'?<div className="property-sidebar-summary"><b>Resumo de Imóveis</b><ul><li><span>Total de imóveis</span><strong>356</strong></li><li><span>Disponíveis</span><strong>248</strong></li><li><span>Em negociação</span><strong>78</strong></li><li><span>Vendidos (mês)</span><strong>30</strong></li></ul></div>:pathname==='/oportunidades'?<div className="negotiation-sidebar-user"><span className="avatar">JC</span><div><b>João Corretor</b><small>joao@imobicrm.com</small></div><button>⌄</button></div>:<div className="goal-card"><div><b>Meta do mês</b><span>ⓘ</span></div><div className="goal-body"><div className="goal-ring">72%</div><p><strong>R$ 144.000</strong><small>de R$ 200.000</small><small>Meta de vendas</small></p></div></div>}
      <div className="system-creator-brand"><small>CRM desenvolvido por</small><img src="/cionlaris-logo-transparent.png" alt="CIONLARIS CRM Imobiliário by Concilion"/></div>
    </aside>
    <div className="app-main"><header className="app-header"><div className="header-page-title"><b>{tituloPagina}</b><small>{pathname==='/'?'Visão geral do negócio':pathname==='/leads'?'Gerencie seus leads e transforme oportunidades em vendas':pathname==='/imoveis'?'Gerencie seu portfólio de imóveis e acompanhe o desempenho de vendas':pathname==='/oportunidades'?'Acompanhe o andamento de todas as negociações':'Gestão imobiliária'}</small></div><div className="search"><span className="fluent">&#xE721;</span><input aria-label="Buscar" placeholder={pathname==='/imoveis'?'Buscar imóveis, leads, proprietários, bairros...':pathname==='/oportunidades'?'Buscar negociações, leads, imóveis ou clientes...':'Buscar leads, clientes, imóveis, oportunidades...'}/><span className="fluent">&#xE11A;</span></div><Link href={novoHref} className="new-lead">{novoRotulo}</Link>
      <div className="header-actions" ref={headerActionsRef}>
        <button type="button" className={`head-icon fluent${menuCabecalho==='notificacoes'?' head-icon--active':''}`} aria-label="Abrir notificações" aria-haspopup="menu" aria-expanded={menuCabecalho==='notificacoes'} onClick={()=>setMenuCabecalho((atual)=>atual==='notificacoes'?null:'notificacoes')}>&#xEA8F;{notificacoesNaoLidas>0&&<i>{notificacoesNaoLidas}</i>}</button>
        <button type="button" className={`head-icon fluent${menuCabecalho==='agenda'?' head-icon--active':''}`} aria-label="Abrir agenda" aria-haspopup="menu" aria-expanded={menuCabecalho==='agenda'} onClick={()=>setMenuCabecalho((atual)=>atual==='agenda'?null:'agenda')}>&#xE787;</button>
        <button type="button" className={`head-icon fluent${menuCabecalho==='mensagens'?' head-icon--active':''}`} aria-label="Abrir mensagens" aria-haspopup="menu" aria-expanded={menuCabecalho==='mensagens'} onClick={()=>setMenuCabecalho((atual)=>atual==='mensagens'?null:'mensagens')}>&#xE8BD;</button>
        {menuCabecalho&&<section className={`header-popover header-popover--${menuCabecalho}`} role="menu" aria-label={menuCabecalho==='notificacoes'?'Notificações':menuCabecalho==='agenda'?'Agenda':'Mensagens'}>
          {menuCabecalho==='notificacoes'&&<><header><div><b>Notificações</b><small>{notificacoesNaoLidas} não lidas</small></div><button type="button" onClick={()=>setNotificacoesNaoLidas(0)}>Marcar como lidas</button></header><ul><li><span className="popover-icon popover-icon--purple">✓</span><div><b>Proposta recebida</b><small>Camila Rocha enviou uma contraproposta.</small></div><time>Agora</time></li><li><span className="popover-icon popover-icon--green">▣</span><div><b>Visita confirmada</b><small>Ana Paula confirmou a visita aos Jardins.</small></div><time>10 min</time></li><li><span className="popover-icon popover-icon--blue">♙</span><div><b>Novo lead interessado</b><small>Bruno solicitou informações do imóvel.</small></div><time>25 min</time></li></ul><footer><Link href="/tarefas">Ver todas as notificações</Link></footer></>}
          {menuCabecalho==='agenda'&&<><header><div><b>Agenda de hoje</b><small>3 compromissos</small></div><span>02 AGO</span></header><ul><li><span className="popover-time">09:30</span><div><b>Apartamento 1201 — Jardins</b><small>Visita com Maria Silva</small></div></li><li><span className="popover-time">11:00</span><div><b>Cobertura Itaim</b><small>Cliente: Carlos Eduardo</small></div></li><li><span className="popover-time">14:30</span><div><b>Casa Alphaville</b><small>Cliente: Fernanda Lima</small></div></li></ul><footer><Link href="/visitas">Abrir agenda completa</Link></footer></>}
          {menuCabecalho==='mensagens'&&<><header><div><b>Mensagens</b><small>Conversas recentes</small></div><span className="online-dot">Online</span></header><ul><li><span className="message-avatar">MS</span><div><b>Maria Silva</b><small>Enviei os documentos do imóvel.</small></div><time>09:42</time></li><li><span className="message-avatar message-avatar--2">CE</span><div><b>Carlos Eduardo</b><small>Podemos confirmar a visita de amanhã?</small></div><time>09:18</time></li><li><span className="message-avatar message-avatar--3">AP</span><div><b>Ana Paula</b><small>Gostaria de revisar a proposta.</small></div><time>Ontem</time></li></ul><footer><Link href="/leads">Ver todas as conversas</Link></footer></>}
        </section>}
      </div>
      <div className="user"><span className="avatar">JC</span><div><b>João Corretor</b><small>Administrador</small></div><button onClick={()=>{logout();router.replace('/login');}} aria-label="Sair">⌄</button></div></header><div className="app-shell">{children}</div></div>
  </div>;
}
