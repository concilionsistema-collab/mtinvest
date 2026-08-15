'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Imovel, ImovelFinalidade, Unidade } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';

// Carregado sob demanda (ssr:false): o MapLibre GL sozinho responde por
// ~270kB do bundle desta pagina (WebGL + parser de vetor/tiles) - sem isso,
// esse peso todo bloqueava o primeiro carregamento da tela inteira de
// Imoveis (KPIs, lista, filtros) so pra renderizar um mapa que nem esta
// acima da dobra. Tambem precisa ser client-only porque maplibre-gl usa
// WebGL/DOM, que nao existe durante o server-side render do Next.
const MapLibreSalesMap = dynamic(
  () => import('../../components/maplibre-sales-map').then((modulo) => modulo.MapLibreSalesMap),
  { ssr: false, loading: () => <div className="property-map-loading">Carregando mapa…</div> },
);

const propertyMetrics = [
  ['\uE821', 'Total de Imóveis', '356', 'Ver todos', 'purple'],
  ['\uE8FB', 'Disponíveis', '248', 'R$ 189.750.000', 'green'],
  ['\uE81C', 'Em Negociação', '78', 'R$ 63.580.000', 'orange'],
  ['\uE7EE', 'Reservados', '18', 'R$ 12.450.000', 'blue'],
  ['\uE73E', 'Vendidos (Mês)', '30', 'R$ 25.680.000', 'green'],
  ['\uE8C7', 'Valor Geral do Portfólio', 'R$ 291.460.000', 'Atualizado hoje, 09:30', 'purple'],
] as const;

const featuredProperties = [
  { type:'Apartamento', neighborhood:'Vila Nova Conceição', value:'R$ 2.450.000', details:'120m² | 3 dorm. | 2 vagas', status:'Disponível', tone:'green', photo:1 },
  { type:'Cobertura Duplex', neighborhood:'Itaim Bibi', value:'R$ 5.800.000', details:'280m² | 4 dorm. | 4 vagas', status:'Em Negociação', tone:'orange', photo:2 },
  { type:'Casa em Condomínio', neighborhood:'Brooklin', value:'R$ 3.250.000', details:'250m² | 4 dorm. | 3 vagas', status:'Disponível', tone:'green', photo:3 },
  { type:'Studio', neighborhood:'Moema', value:'R$ 450.000', details:'45m² | 1 dorm. | 1 vaga', status:'Disponível', tone:'green', photo:2 },
] as const;

const portfolioRows = [
  {code:'AP-101',name:'Apartamento - 101',type:'Apartamento',location:'Vila Nova Conceição',area:'120 m²',bedrooms:3,parking:2,value:'R$ 2.450.000',status:'Disponível',tone:'green',broker:'João Corretor',initials:'JC',photo:1},
  {code:'COB-201',name:'Cobertura Duplex - 201',type:'Cobertura',location:'Itaim Bibi',area:'280 m²',bedrooms:4,parking:4,value:'R$ 5.800.000',status:'Em Negociação',tone:'orange',broker:'Maria Silva',initials:'MS',photo:2},
  {code:'CS-301',name:'Casa Térrea - 301',type:'Casa',location:'Campo Belo',area:'200 m²',bedrooms:3,parking:4,value:'R$ 1.850.000',status:'Disponível',tone:'green',broker:'Pedro Almeida',initials:'PA',photo:3},
  {code:'ST-401',name:'Studio - 401',type:'Studio',location:'Moema',area:'45 m²',bedrooms:1,parking:1,value:'R$ 450.000',status:'Disponível',tone:'green',broker:'Ana Costa',initials:'AC',photo:2},
  {code:'AP-501',name:'Apartamento - 501',type:'Apartamento',location:'Brooklin',area:'90 m²',bedrooms:2,parking:1,value:'R$ 850.000',status:'Reservado',tone:'purple',broker:'Lucas Pereira',initials:'LP',photo:1},
] as const;

const propertyTypes = [['Apartamentos',62,221,'purple'],['Casas',21,75,'cyan'],['Coberturas',9,32,'orange'],['Comerciais',5,18,'gold'],['Terrenos',3,10,'blue']] as const;
const salesByType = [['Apartamento','R$ 15.850.000',62,'purple'],['Casa','R$ 5.200.000',20,'purple'],['Cobertura','R$ 2.850.000',11,'purple'],['Comercial','R$ 1.280.000',5,'orange'],['Terreno','R$ 500.000',2,'orange']] as const;
const brokerSales = [['João Corretor','R$ 8.450.000',88,'JC'],['Maria Silva','R$ 6.250.000',72,'MS'],['Pedro Almeida','R$ 5.180.000',54,'PA'],['Ana Costa','R$ 3.800.000',38,'AC'],['Lucas Pereira','R$ 2.000.000',25,'LP']] as const;

function PortfolioPhoto({ photo, className='' }: { photo:number; className?:string }) { return <span className={`portfolio-photo portfolio-photo--${photo} ${className}`} />; }
function BrokerBadge({ initials, index=0 }: { initials:string; index?:number }) { return <i className={`portfolio-broker portfolio-broker--${(index%5)+1}`}>{initials}</i>; }

export default function ImoveisPage() {
  const { sessao } = useAuth();
  const [unidades,setUnidades]=useState<Unidade[]>([]);
  const [imoveis,setImoveis]=useState<Imovel[]>([]);
  const [modalAberto,setModalAberto]=useState(false);
  const [carregando,setCarregando]=useState(false);
  const [erro,setErro]=useState<string|null>(null);
  const [aviso,setAviso]=useState<string|null>(null);
  const [busca,setBusca]=useState('');
  const [unidadeProprietariaId,setUnidadeProprietariaId]=useState('');
  const [finalidade,setFinalidade]=useState<ImovelFinalidade>('VENDA');
  const [enderecoResumo,setEnderecoResumo]=useState('');
  const [valorAnunciado,setValorAnunciado]=useState('');
  const [percentualDesconto,setPercentualDesconto]=useState('');

  async function carregarDados(){try{const [listaUnidades,listaImoveis]=await Promise.all([apiFetch<Unidade[]>('/unidades'),apiFetch<Imovel[]>('/imoveis')]);setUnidades(listaUnidades);setImoveis(listaImoveis);if(listaUnidades[0])setUnidadeProprietariaId((atual)=>atual||listaUnidades[0].id);}catch{setErro('Os dados demonstrativos estão visíveis, mas a API não respondeu para operações em tempo real.');}}
  useEffect(()=>{if(sessao)void carregarDados();},[sessao?.tenantId]);
  useEffect(()=>{const abrir=()=>setModalAberto(window.location.hash==='#novo-imovel');abrir();window.addEventListener('hashchange',abrir);return()=>window.removeEventListener('hashchange',abrir);},[]);
  useEffect(()=>{const abrirImovel=()=>{const hash=window.location.hash;const codigo=hash.startsWith('#imovel-')?hash.replace('#imovel-',''):'';setBusca(codigo);if(hash==='#lista-imoveis'||codigo)window.setTimeout(()=>document.querySelector('.property-table-card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);};abrirImovel();window.addEventListener('hashchange',abrirImovel);return()=>window.removeEventListener('hashchange',abrirImovel);},[]);

  const rowsFiltradas=useMemo(()=>portfolioRows.filter((row)=>`${row.name} ${row.type} ${row.location} ${row.broker}`.toLowerCase().includes(busca.toLowerCase())),[busca]);
  function fecharModal(){setModalAberto(false);if(typeof window!=='undefined'&&window.location.hash)window.history.replaceState(null,'','/imoveis');}
  async function criarImovel(evento:FormEvent<HTMLFormElement>){evento.preventDefault();if(!unidadeProprietariaId){setErro('Cadastre uma unidade antes de captar um imóvel.');return;}setCarregando(true);setErro(null);setAviso(null);try{await apiFetch<Imovel>('/imoveis',{method:'POST',body:JSON.stringify({unidadeProprietariaId,finalidade,enderecoResumo,valorAnunciado:valorAnunciado?Number(valorAnunciado):undefined,percentualDescontoPreAutorizado:percentualDesconto?Number(percentualDesconto):undefined})});setEnderecoResumo('');setValorAnunciado('');setPercentualDesconto('');setAviso('Imóvel cadastrado com sucesso.');fecharModal();await carregarDados();}catch{setErro('Não foi possível cadastrar o imóvel. Verifique os dados e tente novamente.');}finally{setCarregando(false);}}
  if(!sessao)return null;

  return <main className="properties-page"><h1 className="sr-only">Imóveis</h1>
    {(aviso||erro)&&<div className={`properties-toast ${erro?'properties-toast--error':''}`}>{erro??aviso}<button onClick={()=>{setErro(null);setAviso(null);}}>×</button></div>}

    <section className="property-kpi-grid" aria-label="Indicadores do portfólio">{propertyMetrics.map(([icon,label,value,detail,tone],index)=><article className={`property-kpi property-kpi--${tone} ${index===5?'property-kpi--wide':''}`} key={label}><span className="property-kpi__icon fluent">{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>)}</section>

    <div className="property-primary-grid">
      <div className="property-main-column">
        <section className="portfolio-surface property-map-card"><header className="portfolio-head"><div><h2>Mapa de Imóveis</h2><small>Visualização dos imóveis por localização</small></div><nav><button className="active">Todos</button><button>○ Disponíveis</button><button>○ Em Negociação</button><button>○ Vendidos</button><button>▽ Filtros</button></nav></header><div className="property-map-stage"><MapLibreSalesMap /></div></section>
        <section className="portfolio-surface sales-performance-card"><header className="portfolio-head"><h2>Desempenho de Vendas</h2><select aria-label="Período"><option>Este mês</option></select></header><div className="property-performance-grid"><article className="property-sales-value"><small>Valor de Vendas</small><strong>R$ 25.680.000</strong><em>↗ 28% vs mês anterior</em><div className="property-mini-chart"><i/><b>R$ 2.450.000<small>18 de Maio</small></b><span className="chart-label chart-label--a">1 Mai</span><span className="chart-label chart-label--b">15 Mai</span><span className="chart-label chart-label--c">29 Mai</span></div></article><article className="property-sales-bars"><h3>Vendas por Tipo de Imóvel</h3><ul>{salesByType.map(([name,total,value,tone])=><li className={`property-bar--${tone}`} key={name}><div><span>{name}</span><b>{total} <em>({value}%)</em></b></div><i><u style={{width:`${value}%`}}/></i></li>)}</ul></article><article className="property-broker-sales"><h3>Vendas por Corretor</h3><ul>{brokerSales.map(([name,total,value,initials],index)=><li key={name}><BrokerBadge initials={initials} index={index}/><span><b>{name}</b><i><u style={{width:`${value}%`}}/></i></span><strong>{total}</strong></li>)}</ul></article></div></section>
      </div>

      <aside className="property-side-column">
        <section className="portfolio-surface featured-properties"><header className="portfolio-head"><h2>Imóveis em Destaque</h2><button>Ver todos⌄</button></header><div>{featuredProperties.map((property,index)=><article key={`${property.type}-${property.neighborhood}`} style={{position:'relative'}}>{index===0&&<span className="hot-badge">Em Alta</span>}<div className="featured-photo-wrap"><PortfolioPhoto photo={property.photo}/><button aria-label="Favoritar">{index===0||index===3?'♥':'♡'}</button></div><small>{property.type}</small><b>{property.neighborhood}</b><strong>{property.value}</strong><span>{property.details}</span><em className={`portfolio-status portfolio-status--${property.tone}`}>{property.status}</em></article>)}</div></section>
        <section className="portfolio-surface property-types-card"><header className="portfolio-head"><h2>Imóveis por Tipo</h2><button>Ver relatório</button></header><div className="property-types-body"><div className="property-types-donut"><strong>356</strong><span>Imóveis</span></div><ul>{propertyTypes.map(([name,value,count,tone])=><li className={`property-type--${tone}`} key={name}><i/><span>{name}</span><b>{value}% <em>({count})</em></b></li>)}</ul></div></section>
        <section className="portfolio-surface latest-properties"><header className="portfolio-head"><h2>Últimos Imóveis Cadastrados</h2><button>Ver todos⌄</button></header><ul>{portfolioRows.slice(0,4).map((property,index)=><li key={property.code}><PortfolioPhoto photo={property.photo}/><span><b>{property.type} - {property.location}</b><small>{property.area} | {property.bedrooms} dorm. | {property.parking} vagas</small></span><strong>{property.value}</strong><time>{index===0?'Hoje':index===1?'Ontem':'2 dias atrás'}</time></li>)}</ul></section>
      </aside>
    </div>

    <section className="portfolio-surface property-table-card"><header className="property-table-toolbar"><h2>Lista de Imóveis</h2><select><option>Todos os tipos</option></select><select><option>Todas as cidades</option></select><select><option>Todos os bairros</option></select><select><option>Status</option></select><label><span className="fluent">&#xE721;</span><input value={busca} onChange={(evento)=>setBusca(evento.target.value)} placeholder="Buscar imóvel..."/></label><button className="property-table-new" onClick={()=>setModalAberto(true)}>＋ Novo Imóvel</button></header><div className="property-table-scroll"><table><thead><tr><th>Imóvel</th><th>Tipo</th><th>Localização</th><th>Área</th><th>Dorm.</th><th>Vagas</th><th>Valor</th><th>Status</th><th>Corretor</th><th>Ações</th></tr></thead><tbody>{rowsFiltradas.map((property,index)=><tr key={property.code}><td><span className="property-name-cell"><PortfolioPhoto photo={property.photo}/><span><b>{property.name}</b><small>{property.code}</small></span></span></td><td>{property.type}</td><td>{property.location}</td><td>{property.area}</td><td>{property.bedrooms}</td><td>{property.parking}</td><td><b>{property.value}</b></td><td><em className={`portfolio-status portfolio-status--${property.tone}`}>{property.status}</em></td><td><span className="property-broker-cell"><BrokerBadge initials={property.initials} index={index}/>{property.broker}</span></td><td><span className="property-row-actions"><button aria-label="Visualizar">⌾</button><button aria-label="Editar">✎</button><button aria-label="Mais ações">⋮</button></span></td></tr>)}</tbody></table></div><footer><span>Mostrando {rowsFiltradas.length} de {imoveis.length||356} imóveis</span><nav><button>‹</button><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>›</button></nav></footer></section>

    {modalAberto&&<div className="property-modal-backdrop" role="presentation" onMouseDown={(evento)=>{if(evento.target===evento.currentTarget)fecharModal();}}><section className="property-modal" role="dialog" aria-modal="true" aria-labelledby="novo-imovel-title"><header><div><h2 id="novo-imovel-title">Novo Imóvel</h2><p>Cadastre o imóvel e adicione-o ao portfólio da imobiliária.</p></div><button onClick={fecharModal} aria-label="Fechar">×</button></header><form onSubmit={criarImovel}><label>Unidade proprietária<select value={unidadeProprietariaId} onChange={(evento)=>setUnidadeProprietariaId(evento.target.value)} required><option value="">Selecione</option>{unidades.map((unidade)=><option value={unidade.id} key={unidade.id}>{unidade.nomeFantasia}</option>)}</select></label><label>Finalidade<select value={finalidade} onChange={(evento)=>setFinalidade(evento.target.value as ImovelFinalidade)}><option value="VENDA">Venda</option><option value="LOCACAO">Locação</option><option value="AMBOS">Venda e locação</option></select></label><label className="property-modal-address">Endereço do imóvel<input value={enderecoResumo} onChange={(evento)=>setEnderecoResumo(evento.target.value)} minLength={5} placeholder="Rua, número, bairro e cidade" required autoFocus/></label><label>Valor anunciado<input type="number" value={valorAnunciado} onChange={(evento)=>setValorAnunciado(evento.target.value)} placeholder="R$ 0"/></label><label>Desconto pré-autorizado (%)<input type="number" value={percentualDesconto} onChange={(evento)=>setPercentualDesconto(evento.target.value)} placeholder="0%"/></label><footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={carregando||unidades.length===0}>{carregando?'Salvando...':'Cadastrar Imóvel'}</button></footer></form></section></div>}
  </main>;
}
