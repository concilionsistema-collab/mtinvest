'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Unidade } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';
import styles from './unidades.module.css';

type Aba = 'todas' | 'ativas' | 'matriz' | 'filiais' | 'inativas';
type Visualizacao = 'cards' | 'lista';
type UnidadeMeta = { cidade:string; estado:string; corretores:number; imoveis:number; leads:number; negociacoes:number; pipeline:number; variacao:number; desempenho:number; responsavel:string; iniciais:string; atividade:string };

const METADADOS: UnidadeMeta[] = [
  {cidade:'São Paulo',estado:'SP',corretores:12,imoveis:86,leads:54,negociacoes:18,pipeline:3820000,variacao:14.8,desempenho:92,responsavel:'Mariana Costa',iniciais:'MC',atividade:'8 min atrás'},
  {cidade:'Campinas',estado:'SP',corretores:8,imoveis:52,leads:37,negociacoes:11,pipeline:2450000,variacao:9.3,desempenho:88,responsavel:'Lucas Andrade',iniciais:'LA',atividade:'25 min atrás'},
  {cidade:'Curitiba',estado:'PR',corretores:6,imoveis:46,leads:36,negociacoes:7,pipeline:1930000,variacao:-4.2,desempenho:68,responsavel:'Juliana Alves',iniciais:'JA',atividade:'1 h atrás'},
];
const ABAS: Array<{id:Aba;rotulo:string}> = [{id:'todas',rotulo:'Todas'},{id:'ativas',rotulo:'Ativas'},{id:'matriz',rotulo:'Matriz'},{id:'filiais',rotulo:'Filiais'},{id:'inativas',rotulo:'Inativas'}];
const metadata = (index:number) => METADADOS[index % METADADOS.length];
const moeda = (valor:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(valor);

export default function UnidadesPage() {
  const {sessao}=useAuth();
  const [nomeFantasia,setNomeFantasia]=useState(''); const [eMatriz,setEMatriz]=useState(false); const [unidades,setUnidades]=useState<Unidade[]>([]); const [erro,setErro]=useState<string|null>(null); const [carregando,setCarregando]=useState(true); const [salvando,setSalvando]=useState(false);
  const [modalAberto,setModalAberto]=useState(false); const [busca,setBusca]=useState(''); const [aba,setAba]=useState<Aba>('todas'); const [visualizacao,setVisualizacao]=useState<Visualizacao>('cards'); const [filtroAberto,setFiltroAberto]=useState(false); const [mensagem,setMensagem]=useState<string|null>(null);

  async function carregar(){setCarregando(true);try{setUnidades(await apiFetch<Unidade[]>('/unidades'));setErro(null);}catch{setErro('Não foi possível atualizar as unidades agora.');}finally{setCarregando(false);}}
  useEffect(()=>{void carregar();},[sessao?.tenantId]);
  useEffect(()=>{if(!mensagem)return;const timer=window.setTimeout(()=>setMensagem(null),2600);return()=>window.clearTimeout(timer);},[mensagem]);
  useEffect(()=>{const abrirPeloHash=()=>{if(window.location.hash==='#nova-unidade')setModalAberto(true);};abrirPeloHash();window.addEventListener('hashchange',abrirPeloHash);return()=>window.removeEventListener('hashchange',abrirPeloHash);},[]);
  async function criar(evento:FormEvent<HTMLFormElement>){evento.preventDefault();setSalvando(true);try{await apiFetch('/unidades',{method:'POST',body:JSON.stringify({nomeFantasia,eMatriz})});setNomeFantasia('');setEMatriz(false);setModalAberto(false);setMensagem('Unidade cadastrada com sucesso.');await carregar();}catch{setErro('Falha ao criar unidade. Tente novamente.');}finally{setSalvando(false);}}

  const unidadesFiltradas=useMemo(()=>unidades.filter((unidade,index)=>{const meta=metadata(index);const termo=`${unidade.nomeFantasia} ${meta.cidade} ${meta.estado} ${meta.responsavel}`.toLocaleLowerCase('pt-BR');const correspondeBusca=termo.includes(busca.trim().toLocaleLowerCase('pt-BR'));const correspondeAba=aba==='todas'||(aba==='ativas'&&unidade.status==='ATIVA')||(aba==='inativas'&&unidade.status==='INATIVA')||(aba==='matriz'&&unidade.eMatriz)||(aba==='filiais'&&!unidade.eMatriz);return correspondeBusca&&correspondeAba;}),[aba,busca,unidades]);
  const totalAtivas=unidades.filter((unidade)=>unidade.status==='ATIVA').length;
  const totalImoveis=unidades.reduce((total,_unidade,index)=>total+metadata(index).imoveis,0); const totalLeads=unidades.reduce((total,_unidade,index)=>total+metadata(index).leads,0); const pipelineTotal=unidades.reduce((total,_unidade,index)=>total+metadata(index).pipeline,0);
  if(!sessao)return null;

  return <main className={styles.page}>
    <div className={styles.contentGrid}>
      <section className={styles.workspace}>
    <section className={styles.metrics} aria-label="Resumo da rede">
      <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.blue}`}><span className="fluent">&#xE716;</span></span><div><strong>{String(unidades.length).padStart(2,'0')}</strong><b>Unidades</b><small>{String(totalAtivas).padStart(2,'0')} ativas</small></div></article>
      <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.green}`}><span className="fluent">&#xE821;</span></span><div><strong>{totalImoveis}</strong><b>Imóveis</b><small>+12 este mês</small></div></article>
      <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.purple}`}><span className="fluent">&#xE716;</span></span><div><strong>{totalLeads}</strong><b>Leads ativos</b><small>34 novos hoje</small></div></article>
      <article className={styles.metric}><span className={`${styles.metricIcon} ${styles.gold}`}><span className="fluent">&#xE9D2;</span></span><div><strong>{pipelineTotal>=1000000?`R$ ${(pipelineTotal/1000000).toFixed(1).replace('.',',')} mi`:moeda(pipelineTotal)}</strong><b>Em negociações</b><small>Pipeline total</small></div></article>
    </section>
        <div className={styles.toolbar}>
          <label className={styles.searchBox}><span className="fluent">&#xE721;</span><input id="unit-search" value={busca} onChange={(evento)=>setBusca(evento.target.value)} placeholder="Buscar unidade, cidade ou responsável..."/>{busca&&<button type="button" onClick={()=>setBusca('')} aria-label="Limpar busca">×</button>}</label>
          <div className={styles.filterWrap}><button type="button" className={styles.filterButton} onClick={()=>setFiltroAberto((aberto)=>!aberto)} aria-expanded={filtroAberto}><span className="fluent">&#xE71C;</span> Filtros <span>⌄</span></button>{filtroAberto&&<div className={styles.filterMenu}><b>Filtrar unidades</b><button type="button" onClick={()=>{setAba('ativas');setFiltroAberto(false);}}>Somente ativas</button><button type="button" onClick={()=>{setAba('filiais');setFiltroAberto(false);}}>Somente filiais</button><button type="button" onClick={()=>{setAba('todas');setBusca('');setFiltroAberto(false);}}>Limpar filtros</button></div>}</div>
          <button type="button" className={styles.primaryButton} onClick={()=>setModalAberto(true)}><span>＋</span> Nova unidade</button>
        </div>

        <div className={styles.viewBar}><div className={styles.tabs} role="tablist" aria-label="Filtrar unidades por tipo">{ABAS.map((item)=><button key={item.id} type="button" role="tab" aria-selected={aba===item.id} className={aba===item.id?styles.activeTab:''} onClick={()=>setAba(item.id)}>{item.rotulo}</button>)}</div><div className={styles.viewToggle} aria-label="Modo de visualização"><button type="button" className={visualizacao==='cards'?styles.activeView:''} onClick={()=>setVisualizacao('cards')} aria-pressed={visualizacao==='cards'}><span className="fluent">&#xF0E2;</span> Cards</button><button type="button" className={visualizacao==='lista'?styles.activeView:''} onClick={()=>setVisualizacao('lista')} aria-pressed={visualizacao==='lista'}><span className="fluent">&#xEA37;</span> Lista</button></div></div>
        {erro&&<div className={styles.notice} role="alert">{erro}<button type="button" onClick={()=>void carregar()}>Tentar novamente</button></div>}
        {carregando?<div className={styles.loadingGrid} aria-label="Carregando unidades">{[0,1,2].map((item)=><div key={item}/>)}</div>:unidadesFiltradas.length===0?<div className={styles.emptyState}><span className="fluent">&#xE716;</span><b>Nenhuma unidade encontrada</b><small>Ajuste os filtros ou cadastre uma nova unidade.</small><button type="button" onClick={()=>setModalAberto(true)}>Cadastrar unidade</button></div>:<div className={visualizacao==='cards'?styles.cardsGrid:styles.listGrid}>
          {unidadesFiltradas.map((unidade)=>{const indexOriginal=unidades.findIndex((item)=>item.id===unidade.id);const meta=metadata(indexOriginal);const saudavel=meta.desempenho>=80;return <article key={unidade.id} className={`${styles.unitCard} ${indexOriginal===0?styles.featuredCard:''}`}>
            <header className={styles.cardHeader}><span className={`${styles.typeTag} ${unidade.eMatriz?styles.typeMatriz:''}`}>{unidade.eMatriz?'Matriz':'Filial'}</span><span className={`${styles.status} ${unidade.status==='INATIVA'||!saudavel?styles.attention:''}`}><i/>{unidade.status==='INATIVA'?'Inativa':saudavel?'Ativa':'Atenção'}</span><button type="button" aria-label={`Mais opções para ${unidade.nomeFantasia}`} onClick={()=>setMensagem(`Opções de ${unidade.nomeFantasia}`)}>•••</button></header>
            <div className={styles.cardIdentity}><div className={`${styles.unitPhoto} ${styles[`photo${(indexOriginal%3)+1}`]}`} role="img" aria-label={`Fachada de ${unidade.nomeFantasia}`}/><div><h2>{unidade.nomeFantasia}</h2><p>{meta.cidade} • {meta.estado}</p><small><span className="fluent">&#xE707;</span> {unidade.eMatriz?'Matriz':'Filial'}</small></div></div>
            <div className={styles.cardStats}><div><span className="fluent">&#xE716;</span><b>{String(meta.corretores).padStart(2,'0')}</b><small>Corretores</small></div><div><span className="fluent">&#xE821;</span><b>{meta.imoveis}</b><small>Imóveis</small></div><div><span className="fluent">&#xE77B;</span><b>{meta.leads}</b><small>Leads</small></div><div><span className="fluent">&#xE81C;</span><b>{String(meta.negociacoes).padStart(2,'0')}</b><small>Negociações</small></div></div>
            <div className={styles.pipeline}><div><small>Pipeline atual</small><strong>{moeda(meta.pipeline)}</strong></div><span className={meta.variacao>=0?styles.positive:styles.negative}>{meta.variacao>=0?'+':''}{String(meta.variacao).replace('.',',')}% {meta.variacao>=0?'↗':'↘'}</span><i><b style={{width:`${Math.min(100,meta.desempenho)}%`}}/></i></div>
            <div className={styles.owner}><span className={styles.ownerAvatar}>{meta.iniciais}</span><small>Responsável: <b>{meta.responsavel}</b></small><time>Última atividade: {meta.atividade} <i/></time></div>
            <footer className={styles.cardActions}><button type="button" onClick={()=>setMensagem(`${unidade.nomeFantasia} selecionada`)}><span className="fluent">&#xE8A7;</span> Abrir unidade</button><Link href={`/?unidade=${encodeURIComponent(unidade.id)}`}><span className="fluent">&#xE80F;</span> Dashboard <b>›</b></Link></footer>
          </article>;})}
        </div>}
        <footer className={styles.pagination}><span>Mostrando {unidadesFiltradas.length?1:0} a {unidadesFiltradas.length} de {unidadesFiltradas.length} unidades</span><div><button type="button" disabled>‹</button><button type="button" className={styles.currentPage}>1</button><button type="button" disabled>›</button></div><label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option><option>50</option></select></label></footer>
      </section>

      <aside className={styles.insights}>
        <section className={styles.pulseCard}><h2>Pulso da Rede</h2><div className={styles.pulseVisual}><div className={styles.healthRing}><strong>94%</strong><small>Rede saudável</small></div><div className={styles.sparkline}><i/><i/><i/><i/><i/></div></div><p><strong>↑ 12,4%</strong> desempenho<br/><span>no mês</span></p><button type="button" onClick={()=>setMensagem('Análise completa em preparação')}>Ver análise completa</button></section>
        <section className={styles.rankingCard}><h2>Desempenho das unidades</h2><ol>{unidades.slice(0,3).map((unidade,index)=>{const meta=metadata(index);return <li key={unidade.id}><span className={styles.rank}>{index+1}</span><div className={`${styles.rankPhoto} ${styles[`photo${index+1}`]}`}/><div className={styles.rankCopy}><b>{unidade.nomeFantasia}</b><small>{meta.cidade} • {meta.estado}</small><i><b style={{width:`${meta.desempenho}%`}}/></i></div><strong className={meta.desempenho<80?styles.rankWarning:''}>{meta.desempenho}%</strong></li>;})}</ol><button type="button" onClick={()=>setMensagem('Comparação atualizada')}><span className="fluent">&#xE9D2;</span> Comparar unidades</button></section>
      </aside>
    </div>
    {mensagem&&<div className={styles.toast} role="status">{mensagem}</div>}
    {modalAberto&&<div className={styles.modalBackdrop} role="presentation" onMouseDown={()=>setModalAberto(false)}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="nova-unidade-titulo" onMouseDown={(evento)=>evento.stopPropagation()}><header><div><span className="fluent">&#xE716;</span><div><h2 id="nova-unidade-titulo">Nova unidade</h2><p>Adicione uma filial à sua rede imobiliária.</p></div></div><button type="button" onClick={()=>setModalAberto(false)} aria-label="Fechar">×</button></header><form onSubmit={criar}><label>Nome fantasia<input autoFocus aria-label="Nome fantasia" value={nomeFantasia} onChange={(evento)=>setNomeFantasia(evento.target.value)} required placeholder="Ex.: Unidade Centro"/></label><label className={styles.checkLabel}><input type="checkbox" checked={eMatriz} onChange={(evento)=>setEMatriz(evento.target.checked)}/><span>Esta unidade é a matriz da rede</span></label><footer><button type="button" onClick={()=>setModalAberto(false)}>Cancelar</button><button type="submit" disabled={salvando}>{salvando?'Salvando...':'Cadastrar unidade'}</button></footer></form></section></div>}
  </main>;
}
