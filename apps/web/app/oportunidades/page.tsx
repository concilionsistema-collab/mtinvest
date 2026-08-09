'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Imovel, Lead, Oportunidade, Pessoa, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';
import './negociacoes.css';

const metrics = [
  ['👥', 'Negociações Ativas', '312', '↑ 12% vs mês anterior', 'purple'],
  ['▤', 'Em Proposta', '86', '↑ 15% vs mês anterior', 'blue'],
  ['▣', 'Em Visita', '54', '↑ 8% vs mês anterior', 'green'],
  ['⌕', 'Em Análise', '42', '↑ 10% vs mês anterior', 'orange'],
  ['◷', 'Aguardando Cliente', '38', '↓ -5% vs mês anterior', 'yellow'],
  ['✓', 'Fechadas (Mês)', '28', '↑ 27% vs mês anterior', 'green'],
  ['＄', 'Valor em Negociação', 'R$ 18.750.000', 'Valor total das negociações ativas', 'blue'],
] as const;

const stages = [
  { title: 'Em Prospecção', count: 56, total: 'R$ 2.850.000', tone: 'purple', more: 53, cards: [
    ['Lucas Ferreira','Apto. Vila Madalena','R$ 850.000','Adicionado há 2 dias','LF'],
    ['Mariana Oliveira','Casa em Alphaville','R$ 3.200.000','Adicionado há 3 dias','MO'],
    ['Bruno Santos','Cobertura Itaim','R$ 5.800.000','Adicionado há 5 dias','BS'],
  ]},
  { title: 'Em Visita', count: 54, total: 'R$ 4.250.000', tone: 'blue', more: 51, cards: [
    ['Ana Paula Silva','Apto. Jardins','R$ 2.450.000','Visita agendada: 18/05','AP'],
    ['Pedro Almeida','Casa Campo Belo','R$ 1.850.000','Visita agendada: 20/05','PA'],
    ['João Victor','Studio Moema','R$ 450.000','Visita agendada: 21/05','JV'],
  ]},
  { title: 'Em Proposta', count: 86, total: 'R$ 4.750.000', tone: 'cyan', more: 83, cards: [
    ['Camila Rocha','Cobertura Duplex','R$ 5.800.000','Proposta enviada','CR'],
    ['Ricardo Almeida','Casa em Condomínio','R$ 2.200.000','Proposta enviada','RA'],
    ['Fernanda Lima','Apto. Brooklin','R$ 750.000','Proposta enviada','FL'],
  ]},
  { title: 'Em Análise', count: 42, total: 'R$ 2.300.000', tone: 'orange', more: 39, cards: [
    ['Daniel Carvalho','Apto. Itaim Bibi','R$ 1.250.000','Análise de crédito','DC'],
    ['Juliana Costa','Casa Térrea','R$ 1.500.000','Documentação','JC'],
    ['Roberto Lima','Cobertura Jardins','R$ 3.400.000','Análise interna','RL'],
  ]},
  { title: 'Aguardando Cliente', count: 38, total: 'R$ 1.150.000', tone: 'yellow', more: 35, cards: [
    ['Amanda Dias','Apto. Perdizes','R$ 980.000','Aguardando retorno','AD'],
    ['Gabriel Souza','Casa Moema','R$ 2.800.000','Aguardando retorno','GS'],
    ['Patrícia Gomes','Cobertura Vila Olímpia','R$ 920.000','Aguardando retorno','PG'],
  ]},
  { title: 'Fechadas (Mês)', count: 28, total: 'R$ 7.250.000', tone: 'green', more: 25, cards: [
    ['Carlos Alberto','Casa Alphaville','R$ 6.200.000','Fechada em 10/05','CA'],
    ['Simone Ribeiro','Apto. Vila Nova','R$ 850.000','Fechada em 09/05','SR'],
    ['Thiago Martins','Cobertura Brooklin','R$ 4.500.000','Fechada em 08/05','TM'],
  ]},
] as const;

const brokerRanking = [
  ['João Corretor',58,'R$ 5.450.000','23%','JC'],['Maria Silva',47,'R$ 3.980.000','17%','MS'],
  ['Pedro Almeida',42,'R$ 2.750.000','15%','PA'],['Ana Costa',38,'R$ 2.250.000','13%','AC'],
  ['Lucas Pereira',35,'R$ 1.980.000','11%','LP'],
] as const;

const hotDeals = [
  ['Camila Rocha','Cobertura Duplex - Itaim Bibi','R$ 5.800.000','95%','CR'],
  ['Daniel Carvalho','Apto. Itaim Bibi','R$ 1.250.000','90%','DC'],
  ['Ricardo Almeida','Casa em Condomínio','R$ 2.200.000','85%','RA'],
  ['João Victor','Studio Moema','R$ 450.000','80%','JV'],
  ['Ana Paula Silva','Apto. Jardins','R$ 2.450.000','78%','AP'],
] as const;

const dealRows = [
  ['Camila Rocha','Cobertura Duplex - Itaim Bibi','Em Proposta','R$ 5.800.000','João Corretor','Proposta enviada','16/05/2025','Aguardar retorno','95%','cyan','JC'],
  ['Daniel Carvalho','Apto. Itaim Bibi','Em Análise','R$ 1.250.000','Maria Silva','Documentação enviada','15/05/2025','Análise de crédito','90%','orange','MS'],
  ['Ana Paula Silva','Apto. Jardins','Em Visita','R$ 2.450.000','Pedro Almeida','Visita realizada','14/05/2025','Enviar proposta','78%','blue','PA'],
  ['Ricardo Almeida','Casa em Condomínio','Em Proposta','R$ 2.200.000','Ana Costa','Proposta enviada','13/05/2025','Negociar condições','85%','cyan','AC'],
  ['Lucas Ferreira','Apto. Vila Madalena','Em Prospecção','R$ 850.000','Lucas Pereira','Lead qualificado','12/05/2025','Agendar visita','40%','purple','LP'],
] as const;

function Avatar({ initials, index=0 }: { initials:string; index?:number }) {
  return <span className={`deals-avatar deals-avatar--${(index%5)+1}`}>{initials}</span>;
}

export default function OportunidadesPage() {
  const { sessao } = useAuth();
  const [leads,setLeads]=useState<Lead[]>([]);
  const [imoveis,setImoveis]=useState<Imovel[]>([]);
  const [pessoas,setPessoas]=useState<Pessoa[]>([]);
  const [usuarios,setUsuarios]=useState<Usuario[]>([]);
  const [oportunidades,setOportunidades]=useState<Oportunidade[]>([]);
  const [leadId,setLeadId]=useState('');
  const [imovelId,setImovelId]=useState('');
  const [modalAberto,setModalAberto]=useState(false);
  const [busca,setBusca]=useState('');
  const [carregando,setCarregando]=useState(false);
  const [mensagem,setMensagem]=useState<string|null>(null);
  const [erro,setErro]=useState<string|null>(null);

  async function carregarDados(){
    try{
      const [l,i,p,u,o]=await Promise.all([apiFetch<Lead[]>('/leads'),apiFetch<Imovel[]>('/imoveis'),apiFetch<Pessoa[]>('/pessoas'),apiFetch<Usuario[]>('/usuarios'),apiFetch<Oportunidade[]>('/oportunidades')]);
      setLeads(l);setImoveis(i);setPessoas(p);setUsuarios(u);setOportunidades(o);
    }catch{setErro('Os dados demonstrativos continuam visíveis, mas não foi possível atualizar as negociações em tempo real.');}
  }
  useEffect(()=>{if(sessao)void carregarDados();},[sessao?.tenantId]);
  useEffect(()=>{const abrir=()=>setModalAberto(window.location.hash==='#nova-negociacao');abrir();window.addEventListener('hashchange',abrir);return()=>window.removeEventListener('hashchange',abrir);},[]);

  const leadsComResponsavel=leads.filter((lead)=>lead.responsavelUsuarioId);
  const linhasFiltradas=useMemo(()=>dealRows.filter((row)=>row.join(' ').toLowerCase().includes(busca.toLowerCase())),[busca]);
  const nomeLead=(lead:Lead)=>pessoas.find((p)=>p.id===lead.pessoaId)?.nome??lead.pessoaId;
  const nomeUsuario=(id:string|null)=>usuarios.find((u)=>u.id===id)?.nome??'Sem responsável';
  function fecharModal(){setModalAberto(false);if(location.hash)history.replaceState(null,'','/oportunidades');}
  async function criarNegociacao(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault();setCarregando(true);setErro(null);setMensagem(null);
    try{await apiFetch<Oportunidade>('/oportunidades',{method:'POST',body:JSON.stringify({leadId,imovelId})});setMensagem('Negociação criada com sucesso.');setLeadId('');setImovelId('');fecharModal();await carregarDados();}
    catch{setErro('Não foi possível criar a negociação. Confirme se o lead possui corretor responsável e se já não existe uma negociação ativa para este imóvel.');}
    finally{setCarregando(false);}
  }
  if(!sessao)return null;

  return <main className="deals-page"><h1 className="sr-only">Negociações</h1>
    {(mensagem||erro)&&<div className={`deals-toast ${erro?'deals-toast--error':''}`}>{erro??mensagem}<button onClick={()=>{setMensagem(null);setErro(null);}}>×</button></div>}

    <section className="deals-kpis" aria-label="Indicadores de negociações">{metrics.map(([icon,label,value,detail,tone],index)=><article className={`deals-kpi deals-tone--${tone} ${index===6?'deals-kpi--wide':''}`} key={label}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>)}</section>

    <div className="deals-primary-grid">
      <section className="deals-surface deals-pipeline"><header className="deals-section-head"><h2>Pipeline de Negociações</h2><div><select aria-label="Tipo do funil"><option>Funil Padrão</option></select><button aria-label="Configurações">⚙</button><button aria-label="Visualização compacta">▦</button><button aria-label="Organizar">⠿</button><button>▽ Filtros⌄</button></div></header><div className="deals-kanban">{stages.map((stage, index)=><article className={`deals-stage deals-stage--${stage.tone}`} key={stage.title}><header><b>{stage.title}</b><small>{stage.count} negociações</small><strong>{stage.total}</strong></header>{index === 1 && <div className="stalled-metrics"><span>⚠ 2 negociações paradas</span><strong>R$ 800k</strong></div>}{index === 3 && <div className="stalled-metrics"><span>⚠ 1 negociação parada</span><strong>R$ 1.25M</strong></div>}<div>{stage.cards.map((card,cardIdx)=><button className={`deals-card ${index === 1 && cardIdx === 2 ? 'stalled-card' : ''} ${index === 3 && cardIdx === 0 ? 'stalled-card' : ''}`} key={card[0]}><Avatar initials={card[4]} index={cardIdx}/><span><b>{card[0]}</b><small>{card[1]}</small><strong>{card[2]}</strong><em>{card[3]}</em></span><i>{stage.tone==='green'?'✓':stage.tone==='orange'||stage.tone==='yellow'?'◷':'⌕'}</i></button>)}</div><footer>＋ {stage.more} negociações</footer></article>)}</div></section>

      <aside className="deals-side">
        <section className="deals-surface deals-summary"><header className="deals-section-head"><h2>Resumo de Negociações</h2><select><option>Este mês</option></select></header><div><div className="deals-donut"><strong>312</strong><span>Ativas</span></div><ul>{[['Em Prospecção','18%','56','purple'],['Em Visita','17%','54','blue'],['Em Proposta','28%','86','cyan'],['Em Análise','13%','42','orange'],['Aguardando Cliente','12%','38','yellow'],['Fechadas','9%','28','green'],['Canceladas','3%','8','red']].map(([name,value,count,tone])=><li className={`deals-legend--${tone}`} key={name}><i/><span>{name}</span><b>{value}</b><em>({count})</em></li>)}</ul></div></section>
        <section className="deals-surface deals-hot"><header className="deals-section-head"><h2>Negociações Quentes</h2><button>Ver todas</button></header><ul>{hotDeals.map(([name,property,value,score,initials],index)=><li key={name}><Avatar initials={initials} index={index}/><span><b>{name}</b><small>{property}</small></span><em>{value}</em><strong>🔥 {score}</strong></li>)}</ul></section>
      </aside>
    </div>

    <div className="deals-analytics-grid">
      <section className="deals-surface deals-brokers"><header className="deals-section-head"><h2>Negociações por Corretor</h2><select><option>Este mês</option></select></header><ul>{brokerRanking.map(([name,count,total,share,initials],index)=><li key={name}><Avatar initials={initials} index={index}/><span><b>{name}</b><i><u style={{width:`${Number(share.replace('%',''))*3.6}%`}}/></i></span><strong>{count}</strong><em>{total}</em><small>{share}</small></li>)}</ul></section>
      <section className="deals-surface deals-stage-value"><header className="deals-section-head"><div><h2>Valor por Etapa do Funil</h2><small>Valor (R$)</small></div><select><option>Este mês</option></select></header><div className="deals-bars-chart"><i className="bar-purple" style={{height:'38%'}}><b>R$ 2,85M</b><span>Prospecção</span></i><i className="bar-blue" style={{height:'58%'}}><b>R$ 4,25M</b><span>Visita</span></i><i className="bar-cyan" style={{height:'88%'}}><b>R$ 6,75M</b><span>Proposta</span></i><i className="bar-orange" style={{height:'31%'}}><b>R$ 2,30M</b><span>Análise</span></i><i className="bar-yellow" style={{height:'17%'}}><b>R$ 1,15M</b><span>Aguardando</span></i><i className="bar-green" style={{height:'96%'}}><b>R$ 7,25M</b><span>Fechadas</span></i></div></section>
      <section className="deals-surface deals-conversion"><header className="deals-section-head"><h2>Taxa de Conversão do Funil</h2><select><option>Este mês</option></select></header><div><div className="deals-funnel"><i/><i/><i/><i/><i/></div><ul><li>Prospecção <b>56</b><em>(100%)</em></li><li>Visita <b>54</b><em>(96%)</em></li><li>Proposta <b>86</b><em>(61%)</em></li><li>Análise <b>42</b><em>(32%)</em></li><li>Fechadas <b>28</b><em>(22%)</em></li></ul></div><footer>Taxa geral: <b>22%</b></footer></section>
      <section className="deals-surface deals-loss"><header className="deals-section-head"><h2>Motivos de Perda</h2><select><option>Este mês</option></select></header><ul>{[['Preço acima do orçamento',32,12],['Comprou outro imóvel',24,9],['Financiamento não aprovado',18,7],['Desistiu da compra',14,5],['Imóvel não atendeu',8,3],['Outros',4,2]].map(([name,value,count])=><li key={name}><span>{name}</span><i><u style={{width:`${value}%`}}/></i><b>{value}%</b><em>({count})</em></li>)}</ul></section>
    </div>

    <section className="deals-surface deals-table"><header><h2>Todas as Negociações <small>{oportunidades.length?`${oportunidades.length} reais`:''}</small></h2><label>⌕<input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar..."/></label><select><option>Todos os status</option></select><select><option>Todos os corretores</option></select><select><option>Período</option></select><button>⇧ Exportar</button></header><div><table><thead><tr><th>Cliente</th><th>Imóvel</th><th>Etapa</th><th>Valor</th><th>Corretor</th><th>Última Atividade</th><th>Próxima Ação</th><th>Probabilidade</th><th>Ações</th></tr></thead><tbody>{linhasFiltradas.map((row,index)=><tr key={row[0]}><td><Avatar initials={row[10]} index={index}/><b>{row[0]}</b></td><td>{row[1]}</td><td><em className={`deals-status deals-status--${row[9]}`}>{row[2]}</em></td><td>{row[3]}</td><td><Avatar initials={index%2?'MS':'JC'} index={index+1}/>{row[4]}</td><td>{row[5]}<small>{row[6]}</small></td><td>{row[7]}</td><td><strong>{row[8]}</strong><i className="probability"><u style={{width:row[8]}}/></i></td><td><span className="deals-actions"><button>⌕</button><button>▣</button><button>✎</button><button>⋮</button></span></td></tr>)}</tbody></table></div></section>

    {modalAberto&&<div className="deals-modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)fecharModal();}}><section className="deals-modal" role="dialog" aria-modal="true" aria-labelledby="nova-negociacao-title"><header><div><h2 id="nova-negociacao-title">Nova Negociação</h2><p>Vincule um lead qualificado a um imóvel disponível.</p></div><button onClick={fecharModal}>×</button></header><form onSubmit={criarNegociacao}><label>Lead<select value={leadId} onChange={(e)=>setLeadId(e.target.value)} required><option value="">Selecione o lead</option>{leadsComResponsavel.map((lead)=><option value={lead.id} key={lead.id}>{nomeLead(lead)} — {nomeUsuario(lead.responsavelUsuarioId)}</option>)}</select></label><label>Imóvel<select value={imovelId} onChange={(e)=>setImovelId(e.target.value)} required><option value="">Selecione o imóvel</option>{imoveis.map((imovel)=><option value={imovel.id} key={imovel.id}>{imovel.enderecoResumo}</option>)}</select></label><footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={carregando||!leadId||!imovelId}>{carregando?'Criando...':'Criar Negociação'}</button></footer></form></section></div>}
  </main>;
}
