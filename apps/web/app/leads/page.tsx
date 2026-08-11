'use client';

import { CSSProperties, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { CapturarLeadResultado, ImovelFinalidade, Lead, Unidade, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';

const leadMetrics = [
  ['\uE77B', 'Leads Totais', '1.248', '18% vs mês anterior', 'purple'],
  ['\uE8FA', 'Novos Leads', '286', '22% vs mês anterior', 'blue'],
  ['\uE716', 'Leads Ativos', '843', '15% vs mês anterior', 'blue'],
  ['\uE81C', 'Em Negociação', '312', '12% vs mês anterior', 'orange'],
  ['\uE8FB', 'Qualificados', '256', '20% vs mês anterior', 'green'],
  ['\uE73E', 'Convertidos (Mês)', '28', '27% vs mês anterior', 'purple'],
] as const;

type PipelineCard = [name: string, interest: string, value: string, age: string, initials: string];
type PipelineColumn = { title: string; count: number; total: string; tone: string; more: number; cards: PipelineCard[] };

const pipelineColumns: PipelineColumn[] = [
  { title: 'Novo Lead', count: 286, total: 'R$ 1.245.000', tone: 'purple', more: 82, cards: [
    ['Carlos Alberto', 'Apartamento 2 dorm.', 'R$ 450.000', 'Hoje', 'CA'],
    ['Mariana Oliveira', 'Casa em condomínio', 'R$ 780.000', 'Hoje', 'MO'],
    ['Lucas Ferreira', 'Studio', 'R$ 280.000', '1d', 'LF'],
    ['Fernanda Lima', 'Cobertura', 'R$ 980.000', '2d', 'FL'],
  ]},
  { title: 'Qualificado', count: 256, total: 'R$ 2.850.000', tone: 'blue', more: 76, cards: [
    ['Bruno Santos', 'Apartamento 3 dorm.', 'R$ 650.000', '1d', 'BS'],
    ['Juliana Costa', 'Casa térrea', 'R$ 1.200.000', '1d', 'JC'],
    ['Ricardo Almeida', 'Cobertura duplex', 'R$ 1.450.000', '2d', 'RA'],
    ['Patrícia Gomes', 'Apartamento 2 dorm.', 'R$ 550.000', '2d', 'PG'],
  ]},
  { title: 'Em Negociação', count: 312, total: 'R$ 4.580.000', tone: 'orange', more: 92, cards: [
    ['Ana Paula Silva', 'Apartamento 3 dorm.', 'R$ 850.000', '2d', 'AS'],
    ['Thiago Martins', 'Casa em condomínio', 'R$ 1.750.000', '3d', 'TM'],
    ['Gabriela Souza', 'Cobertura vista mar', 'R$ 2.200.000', '3d', 'GS'],
    ['Rafael Pereira', 'Apartamento 2 dorm.', 'R$ 680.000', '4d', 'RP'],
  ]},
  { title: 'Proposta Enviada', count: 128, total: 'R$ 2.350.000', tone: 'cyan', more: 92, cards: [
    ['Daniel Carvalho', 'Apartamento 3 dorm.', 'R$ 720.000', '1d', 'DC'],
    ['Camila Rocha', 'Casa térrea', 'R$ 1.300.000', '2d', 'CR'],
    ['Felipe Andrade', 'Cobertura duplex', 'R$ 2.100.000', '2d', 'FA'],
    ['Beatriz Lima', 'Apartamento 2 dorm.', 'R$ 450.000', '3d', 'BL'],
  ]},
  { title: 'Ganho', count: 28, total: 'R$ 850.000', tone: 'green', more: 12, cards: [
    ['Amanda Dias', 'Apartamento 2 dorm.', 'R$ 450.000', '1d', 'AD'],
    ['João Victor', 'Studio', 'R$ 280.000', '1d', 'JV'],
    ['Simone Ribeiro', 'Casa em condomínio', 'R$ 1.250.000', '1d', 'SR'],
    ['Eduardo Freitas', 'Apartamento 3 dorm.', 'R$ 750.000', '2d', 'EF'],
  ]},
];

const leadSources = [
  ['Site / Portal', 38, 109, 'purple'], ['Indicação', 22, 63, 'blue'], ['Redes Sociais', 18, 52, 'cyan'], ['Campanhas', 12, 34, 'orange'], ['Outros', 10, 28, 'gold'],
] as const;

const activities = [
  ['\uE717', 'Ligação realizada', 'Carlos Alberto', '09:30', 'green'],
  ['\uE787', 'Visita agendada', 'Mariana Oliveira', '10:15', 'blue'],
  ['\uE8A5', 'Proposta enviada', 'Ana Paula Silva', '11:00', 'purple'],
  ['\uE8BD', 'Follow-up', 'Bruno Santos', '11:45', 'orange'],
  ['\uE715', 'E-mail enviado', 'Juliana Costa', '13:30', 'purple'],
] as const;

const tableLeads = [
  { name: 'Carlos Alberto', initials: 'CA', phone: '(11) 9 8765-4321', email: 'carlos@email.com', source: 'Site / Portal', interest: 'Apartamento 2 dorm.', area: 'Vila Madalena', value: 'R$ 450.000', status: 'Novo Lead', tone: 'purple', broker: 'João Corretor', last: 'Hoje 09:30', hot: true },
  { name: 'Mariana Oliveira', initials: 'MO', phone: '(11) 9 6543-2109', email: 'mariana@email.com', source: 'Indicação', interest: 'Casa em condomínio', area: 'Alphaville', value: 'R$ 780.000', status: 'Qualificado', tone: 'blue', broker: 'Ana Corretora', last: 'Hoje 10:15' },
  { name: 'Bruno Santos', initials: 'BS', phone: '(11) 9 1122-3344', email: 'bruno@email.com', source: 'Redes Sociais', interest: 'Apartamento 3 dorm.', area: 'Moema', value: 'R$ 650.000', status: 'Em Negociação', tone: 'orange', broker: 'João Corretor', last: 'Ontem 16:45', hot: true },
  { name: 'Ana Paula Silva', initials: 'AS', phone: '(11) 9 9988-7766', email: 'anapaula@email.com', source: 'Campanha Google', interest: 'Apartamento 3 dorm.', area: 'Itaim Bibi', value: 'R$ 850.000', status: 'Proposta Enviada', tone: 'cyan', broker: 'Ana Corretora', last: 'Ontem 14:20', hot: true },
  { name: 'Amanda Dias', initials: 'AD', phone: '(11) 9 6655-2211', email: 'amanda@email.com', source: 'Indicação', interest: 'Apartamento 2 dorm.', area: 'Pinheiros', value: 'R$ 450.000', status: 'Ganho', tone: 'green', broker: 'João Corretor', last: 'Hoje 11:00' },
] as const;

const hotLeads = [
  ['Ana Paula Silva', 'Apartamento 3 dorm. · R$ 850.000', 95, 'AS'],
  ['Thiago Martins', 'Casa em condomínio · R$ 1.750.000', 90, 'TM'],
  ['Daniel Carvalho', 'Apartamento 3 dorm. · R$ 720.000', 85, 'DC'],
  ['Camila Rocha', 'Casa térrea · R$ 1.300.000', 80, 'CR'],
] as const;

function LeadAvatar({ initials, index = 0 }: { initials: string; index?: number }) {
  const avatarIndex = index % 20;
  const backgroundPosition = `${(avatarIndex % 5) * 25}% ${Math.floor(avatarIndex / 5) * (100 / 3)}%`;
  return <span className="lead-avatar" aria-hidden="true" title={initials} style={{ backgroundPosition } as CSSProperties} />;
}

export default function LeadsPage() {
  const { sessao } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [pipeline, setPipeline] = useState<PipelineColumn[]>(() => pipelineColumns.map((column) => ({ ...column, cards: column.cards.map((card) => [...card]) as PipelineCard[] })));
  const [leadArrastado, setLeadArrastado] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origemCanal, setOrigemCanal] = useState('site');
  const [finalidadeDesejada, setFinalidadeDesejada] = useState<ImovelFinalidade | ''>('');
  const [orcamentoMinimo, setOrcamentoMinimo] = useState('');
  const [orcamentoMaximo, setOrcamentoMaximo] = useState('');

  async function carregarDados() {
    try {
      const [listaUnidades, listaUsuarios, listaLeads] = await Promise.all([
        apiFetch<Unidade[]>('/unidades'), apiFetch<Usuario[]>('/usuarios'), apiFetch<Lead[]>('/leads'),
      ]);
      setUnidades(listaUnidades); setUsuarios(listaUsuarios); setLeads(listaLeads);
      if (listaUnidades[0]) setUnidadeId((atual) => atual || listaUnidades[0].id);
    } catch {
      setErro('Os dados demonstrativos estão visíveis, mas a API não respondeu para operações em tempo real.');
    }
  }

  useEffect(() => { if (sessao) void carregarDados(); }, [sessao?.tenantId]);
  useEffect(() => {
    const abrirPeloEndereco = () => setModalAberto(window.location.hash === '#novo-lead');
    abrirPeloEndereco(); window.addEventListener('hashchange', abrirPeloEndereco);
    return () => window.removeEventListener('hashchange', abrirPeloEndereco);
  }, []);

  const leadsFiltrados = useMemo(() => tableLeads.filter((lead) => `${lead.name} ${lead.source} ${lead.interest}`.toLowerCase().includes(busca.toLowerCase())), [busca]);

  function moverLead(destino: number) {
    if (!leadArrastado) return;
    setPipeline((colunas) => {
      const origem = colunas.findIndex((coluna) => coluna.cards.some((card) => card[0] === leadArrastado));
      if (origem < 0 || origem === destino) return colunas;
      const card = colunas[origem].cards.find((item) => item[0] === leadArrastado);
      if (!card) return colunas;
      return colunas.map((coluna, indice) => ({
        ...coluna,
        cards: indice === origem ? coluna.cards.filter((item) => item[0] !== leadArrastado) : indice === destino ? [...coluna.cards, card] : coluna.cards,
      }));
    });
    setLeadArrastado(null);
  }

  function prepararDestino(evento: DragEvent<HTMLElement>) {
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'move';
  }

  function fecharModal() {
    setModalAberto(false);
    if (typeof window !== 'undefined' && window.location.hash) window.history.replaceState(null, '', '/leads');
  }

  async function capturarLead(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!unidadeId) { setErro('Cadastre uma unidade antes de criar o lead.'); return; }
    setCarregando(true); setErro(null); setAviso(null);
    try {
      const resultado = await apiFetch<CapturarLeadResultado>('/leads', { method: 'POST', body: JSON.stringify({
        unidadeId, nomeContato, telefone: telefone || undefined, origemCanal,
        finalidadeDesejada: finalidadeDesejada || undefined,
        orcamentoMinimo: orcamentoMinimo ? Number(orcamentoMinimo) : undefined,
        orcamentoMaximo: orcamentoMaximo ? Number(orcamentoMaximo) : undefined,
      }) });
      setAviso(resultado.duplicidadeDetectada ? 'Contato atualizado no lead existente.' : 'Novo lead criado e distribuído com sucesso.');
      setNomeContato(''); setTelefone(''); setFinalidadeDesejada(''); setOrcamentoMinimo(''); setOrcamentoMaximo('');
      fecharModal(); await carregarDados();
    } catch { setErro('Não foi possível criar o lead. Verifique os dados e tente novamente.'); }
    finally { setCarregando(false); }
  }

  if (!sessao) return null;

  return <main className="leads-page">
    <h1 className="sr-only">Leads</h1>
    {(aviso || erro) && <div className={`leads-toast ${erro ? 'leads-toast--error' : ''}`}>{erro ?? aviso}<button onClick={() => { setErro(null); setAviso(null); }}>×</button></div>}

    <section className="leads-surface lead-pipeline" aria-labelledby="lead-pipeline-title">
      <header className="leads-section-head"><div><h2 id="lead-pipeline-title">Pipeline de Leads <span>(Funil)</span></h2><small>Arraste os cartões entre as etapas para atualizar o status</small></div><div className="lead-pipeline-actions"><select aria-label="Selecionar funil"><option>Funil Padrão</option></select><button>⚙ Personalizar</button><button aria-label="Visualização em lista">☷</button><button className="active" aria-label="Visualização em colunas">▦</button></div></header>
      <div className="lead-kanban">
        {pipeline.map((column, columnIndex) => <article className={`lead-kanban-column lead-kanban-column--${column.tone}`} key={column.title} onDragOver={prepararDestino} onDrop={() => moverLead(columnIndex)}>
          <header><b>{column.title}</b><div><span>{column.count + column.cards.length - 4} Leads</span><strong>{column.total}</strong></div></header>
          <div className="lead-kanban-cards">{column.cards.map((card, cardIndex) => {
            const originalColumn = pipelineColumns.findIndex((item) => item.cards.some((original) => original[0] === card[0]));
            const originalCard = originalColumn < 0 ? cardIndex : pipelineColumns[originalColumn].cards.findIndex((item) => item[0] === card[0]);
            const avatarIndex = originalColumn < 0 ? columnIndex * 4 + cardIndex : originalColumn * 4 + originalCard;
            return <button className={`lead-kanban-card ${leadArrastado === card[0] ? 'lead-kanban-card--dragging' : ''}`} key={card[0]} draggable onDragStart={(evento) => { setLeadArrastado(card[0]); evento.dataTransfer.effectAllowed = 'move'; evento.dataTransfer.setData('text/plain', card[0]); }} onDragEnd={() => setLeadArrastado(null)} aria-label={`${card[0]}, ${card[1]}, ${card[2]}`}>
              <LeadAvatar initials={card[4]} index={avatarIndex}/><span className="lead-card-copy"><span className="lead-card-name"><i>{card[4]}</i><b>{card[0]}</b></span><small>{card[1]}</small><footer><strong>{card[2]}</strong><time>{card[3]}</time></footer></span><i className="lead-card-status">{column.tone === 'green' ? '✓' : String.fromCharCode(65 + (cardIndex % 2))}</i>
            </button>;
          })}</div>
          <button className="lead-kanban-more">＋ Ver mais {column.more} leads</button>
        </article>)}
      </div>
    </section>

    <section className="lead-kpi-grid" aria-label="Indicadores de leads">
      {leadMetrics.map(([icon, label, value, delta, tone]) => <article className={`lead-kpi lead-kpi--${tone}`} key={label}><div><small>{label}</small><strong>{value}</strong><em>↗ {delta}</em></div><span className="lead-kpi__icon fluent">{icon}</span></article>)}
      <article className="lead-kpi lead-kpi--conversion"><div><small>Taxa de Conversão</small><strong>23%</strong><em>↗ 3 p.p. vs mês anterior</em></div><span className="lead-kpi__ring" /></article>
    </section>

    <div className="leads-primary-grid leads-primary-grid--insights">
      <aside className="leads-side-column">
        <section className="leads-surface lead-source-card"><header className="leads-section-head"><h2>Leads por Fonte</h2><select aria-label="Período"><option>Este mês</option></select></header><div className="lead-source-body"><div className="lead-source-donut"><strong>286</strong><span>Novos Leads</span></div><ul>{leadSources.map(([name,value,count,tone])=><li className={`lead-source--${tone}`} key={name}><i/><span>{name}</span><b>{value}% <em>({count})</em></b></li>)}</ul></div></section>
        <section className="leads-surface lead-activity-card"><header className="leads-section-head"><h2>Atividades Recentes</h2><button>Ver todas</button></header><ul>{activities.map(([icon,title,name,time,tone])=><li key={`${title}-${name}`}><i className={`fluent lead-activity-icon lead-activity-icon--${tone}`}>{icon}</i><span><b>{title}</b><small>{name}</small></span><time>{time}</time></li>)}</ul></section>
      </aside>
    </div>

    <div className="leads-secondary-grid">
      <section className="leads-surface lead-table-card">
        <header className="lead-table-toolbar"><div><h2>Todos os Leads</h2><b>{leads.length || 1248} resultados</b></div><label><span className="fluent">&#xE721;</span><input value={busca} onChange={(evento)=>setBusca(evento.target.value)} placeholder="Buscar lead..." /></label><select aria-label="Status"><option>Todos os status</option></select><select aria-label="Corretor"><option>Todos os corretores</option>{usuarios.map((usuario)=><option key={usuario.id}>{usuario.nome}</option>)}</select><button>▽ Filtros</button><button>⇩ Exportar</button><button className="lead-table-new" onClick={()=>setModalAberto(true)}>＋ Novo Lead</button></header>
        <div className="lead-table-scroll"><table><thead><tr><th>Lead</th><th>Contato</th><th>Fonte</th><th>Interesse</th><th>Valor Estimado</th><th>Status</th><th>Responsável</th><th>Último Contato</th><th>Ações</th></tr></thead><tbody>{leadsFiltrados.map((lead,index)=><tr key={lead.name}><td><div className="lead-name-cell"><LeadAvatar initials={lead.initials} index={index}/><b>{lead.name}</b>{'hot' in lead && lead.hot&&<i>🔥</i>}</div></td><td><span className="lead-contact"><small>⌕ {lead.phone}</small><small>✉ {lead.email}</small></span></td><td><span className="lead-source-label">⌘ {lead.source}</span></td><td><span className="lead-interest"><b>{lead.interest}</b><small>{lead.area}</small></span></td><td><b>{lead.value}</b></td><td><em className={`lead-status lead-status--${lead.tone}`}>{lead.status}</em></td><td><span className="lead-broker"><LeadAvatar initials={lead.broker.split(' ').map((part)=>part[0]).join('').slice(0,2)} index={index+2}/>{lead.broker}</span></td><td><span className="lead-last-contact">{lead.last.split(' ').map((part)=><small key={part}>{part}</small>)}</span></td><td><span className="lead-row-actions"><button aria-label="Ligar">☎</button><button aria-label="Enviar e-mail">✉</button><button aria-label="Mais ações">⋮</button></span></td></tr>)}</tbody></table></div>
        <footer className="lead-table-footer"><span>Mostrando {leadsFiltrados.length} de {leads.length || 1248} leads</span><nav><button>‹</button><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>25</button><button>›</button></nav><select aria-label="Quantidade por página"><option>50 por página</option></select></footer>
      </section>

      <aside className="leads-surface hot-leads-card"><header className="leads-section-head"><h2>Leads Quentes</h2><button>Ver todos</button></header><ul>{hotLeads.map(([name,interest,score,initials],index)=><li key={name}><LeadAvatar initials={initials} index={index}/><span><b>{name}</b><small>{interest}</small></span><em>🔥 {score}%</em><button>Ligar</button></li>)}</ul></aside>
    </div>

    {modalAberto && <div className="lead-modal-backdrop" role="presentation" onMouseDown={(evento)=>{if(evento.target===evento.currentTarget)fecharModal();}}><section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="novo-lead-title"><header><div><h2 id="novo-lead-title">Novo Lead</h2><p>Cadastre o contato e distribua automaticamente para a equipe.</p></div><button onClick={fecharModal} aria-label="Fechar">×</button></header><form onSubmit={capturarLead}>
      <label>Unidade<select value={unidadeId} onChange={(evento)=>setUnidadeId(evento.target.value)} required><option value="">Selecione</option>{unidades.map((unidade)=><option value={unidade.id} key={unidade.id}>{unidade.nomeFantasia}</option>)}</select></label>
      <label>Nome do contato<input value={nomeContato} onChange={(evento)=>setNomeContato(evento.target.value)} placeholder="Ex.: Maria Silva" minLength={2} required autoFocus /></label>
      <label>Telefone<input value={telefone} onChange={(evento)=>setTelefone(evento.target.value)} placeholder="(65) 9 9999-9999" /></label>
      <label>Origem<select value={origemCanal} onChange={(evento)=>setOrigemCanal(evento.target.value)}><option value="site">Site / Portal</option><option value="indicacao">Indicação</option><option value="redes_sociais">Redes Sociais</option><option value="campanha">Campanha</option><option value="whatsapp">WhatsApp</option></select></label>
      <label>Finalidade<select value={finalidadeDesejada} onChange={(evento)=>setFinalidadeDesejada(evento.target.value as ImovelFinalidade | '')}><option value="">Sem preferência</option><option value="VENDA">Venda</option><option value="LOCACAO">Locação</option><option value="AMBOS">Venda ou locação</option></select></label>
      <label>Orçamento mínimo<input type="number" value={orcamentoMinimo} onChange={(evento)=>setOrcamentoMinimo(evento.target.value)} placeholder="R$ 0" /></label>
      <label>Orçamento máximo<input type="number" value={orcamentoMaximo} onChange={(evento)=>setOrcamentoMaximo(evento.target.value)} placeholder="R$ 0" /></label>
      <footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={carregando || unidades.length===0}>{carregando?'Salvando...':'Criar Lead'}</button></footer>
    </form></section></div>}
  </main>;
}
