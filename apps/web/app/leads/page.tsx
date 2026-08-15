'use client';

import { CSSProperties, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { CapturarLeadResultado, Imovel, ImovelFinalidade, Lead, Oportunidade, OportunidadeEstado, Pessoa, Unidade, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const leadMetrics = [
  ['\uE77B', 'Leads Totais', '1.248', '18% vs mês anterior', 'purple'],
  ['\uE8FA', 'Novos Leads', '286', '22% vs mês anterior', 'blue'],
  ['\uE716', 'Leads Ativos', '843', '15% vs mês anterior', 'blue'],
  ['\uE81C', 'Em Negociação', '312', '12% vs mês anterior', 'orange'],
  ['\uE8FB', 'Qualificados', '256', '20% vs mês anterior', 'green'],
  ['\uE73E', 'Convertidos (Mês)', '28', '27% vs mês anterior', 'purple'],
] as const;

// Pipeline conectado a dados reais (GET /oportunidades) - ver
// apps/api/src/modules/oportunidades. ESTADOS_OPORTUNIDADE espelha a ordem
// de ART-009, secao 8.1; TRANSICOES_VALIDAS espelha
// OportunidadesService.TRANSICOES_VALIDAS (backend nao expoe isso via API,
// entao fica duplicado aqui de proposito - so pra a UI nao deixar arrastar/
// selecionar um destino que o servidor certamente vai rejeitar; o servidor
// continua sendo a fonte de verdade, revalida tudo de novo).
const ESTADOS_OPORTUNIDADE: { estado: OportunidadeEstado; label: string; tone: string }[] = [
  { estado: 'QUALIFICACAO', label: 'Qualificação', tone: 'purple' },
  { estado: 'VISITA_AGENDADA', label: 'Visita Agendada', tone: 'blue' },
  { estado: 'VISITA_CONFIRMADA', label: 'Visita Confirmada', tone: 'blue' },
  { estado: 'VISITA_REALIZADA', label: 'Visita Realizada', tone: 'cyan' },
  { estado: 'PROPOSTA_ENVIADA', label: 'Proposta Enviada', tone: 'orange' },
  { estado: 'EM_CONTRAPROPOSTA', label: 'Em Contraproposta', tone: 'orange' },
  { estado: 'RESERVA', label: 'Reserva', tone: 'gold' },
  { estado: 'DOCUMENTACAO_CONCLUIDA', label: 'Documentação', tone: 'cyan' },
  { estado: 'FECHADA', label: 'Fechada', tone: 'green' },
  { estado: 'PERDIDA', label: 'Perdida', tone: 'red' },
];

const TRANSICOES_VALIDAS: Record<OportunidadeEstado, OportunidadeEstado[]> = {
  QUALIFICACAO: ['VISITA_AGENDADA', 'PROPOSTA_ENVIADA', 'PERDIDA'],
  VISITA_AGENDADA: ['VISITA_CONFIRMADA', 'PERDIDA'],
  VISITA_CONFIRMADA: ['VISITA_REALIZADA', 'PERDIDA'],
  VISITA_REALIZADA: ['PROPOSTA_ENVIADA', 'PERDIDA'],
  PROPOSTA_ENVIADA: ['EM_CONTRAPROPOSTA', 'RESERVA', 'PERDIDA'],
  EM_CONTRAPROPOSTA: ['EM_CONTRAPROPOSTA', 'RESERVA', 'PERDIDA'],
  RESERVA: ['DOCUMENTACAO_CONCLUIDA', 'PERDIDA'],
  DOCUMENTACAO_CONCLUIDA: ['FECHADA'],
  FECHADA: [],
  PERDIDA: [],
};

function infoEstado(estado: OportunidadeEstado) {
  return ESTADOS_OPORTUNIDADE.find((item) => item.estado === estado) ?? ESTADOS_OPORTUNIDADE[0];
}

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
function formatarValor(valor: number | null): string {
  return valor != null ? formatadorMoeda.format(valor) : 'Sem valor definido';
}

function formatarIdade(criadoEmIso: string): string {
  const dias = Math.floor((Date.now() - new Date(criadoEmIso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return '1d';
  return `${dias}d`;
}

// Card do funil = uma Oportunidade (lead + imovel), com nome/interesse/valor
// ja resolvidos a partir de Pessoa/Imovel (a Oportunidade em si so guarda os
// ids, ver packages/shared/src/oportunidade.ts).
interface CartaoOportunidade {
  id: string;
  nome: string;
  interesse: string;
  valor: number | null;
  criadoEm: string;
  estado: OportunidadeEstado;
  iniciais: string;
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase();
}

type PreferenciasFunil = { ordem: string[]; ocultas: string[] };
const CHAVE_PREFERENCIAS_FUNIL = 'concilion-crm-funil-preferencias';

// Le a personalizacao do funil (ordem/visibilidade das etapas) do localStorage -
// so client-side de proposito, nao existe conceito de "preferencia de funil por
// usuario" no backend ainda. Reconcilia com titulosPadrao pra nao quebrar se as
// etapas do pipeline mudarem entre versoes (etapa removida some da preferencia
// salva, etapa nova entra no fim).
function carregarPreferenciasFunil(titulosPadrao: string[]): PreferenciasFunil {
  if (typeof window === 'undefined') return { ordem: titulosPadrao, ocultas: [] };
  try {
    const bruto = window.localStorage.getItem(CHAVE_PREFERENCIAS_FUNIL);
    if (!bruto) return { ordem: titulosPadrao, ocultas: [] };
    const salvo = JSON.parse(bruto) as PreferenciasFunil;
    const ordemValida = salvo.ordem.filter((titulo) => titulosPadrao.includes(titulo));
    const faltantes = titulosPadrao.filter((titulo) => !ordemValida.includes(titulo));
    return { ordem: [...ordemValida, ...faltantes], ocultas: salvo.ocultas.filter((titulo) => titulosPadrao.includes(titulo)) };
  } catch {
    return { ordem: titulosPadrao, ocultas: [] };
  }
}

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
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [oportunidadeArrastada, setOportunidadeArrastada] = useState<string | null>(null);
  const [movendoId, setMovendoId] = useState<string | null>(null);
  const [detalheOportunidadeId, setDetalheOportunidadeId] = useState<string | null>(null);
  const titulosPadraoPipeline = useMemo(() => ESTADOS_OPORTUNIDADE.map((item) => item.label), []);
  const [preferenciasFunil, setPreferenciasFunil] = useState<PreferenciasFunil>(() => carregarPreferenciasFunil(titulosPadraoPipeline));
  const [visualizacaoPipeline, setVisualizacaoPipeline] = useState<'colunas' | 'lista'>('colunas');
  const [personalizarAberto, setPersonalizarAberto] = useState(false);
  const [unidadeId, setUnidadeId] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origemCanal, setOrigemCanal] = useState('site');
  const [finalidadeDesejada, setFinalidadeDesejada] = useState<ImovelFinalidade | ''>('');
  const [orcamentoMinimo, setOrcamentoMinimo] = useState('');
  const [orcamentoMaximo, setOrcamentoMaximo] = useState('');

  async function carregarDados() {
    try {
      const [listaUnidades, listaUsuarios, listaLeads, listaPessoas, listaImoveis, listaOportunidades] = await Promise.all([
        apiFetch<Unidade[]>('/unidades'), apiFetch<Usuario[]>('/usuarios'), apiFetch<Lead[]>('/leads'),
        apiFetch<Pessoa[]>('/pessoas'), apiFetch<Imovel[]>('/imoveis'), apiFetch<Oportunidade[]>('/oportunidades'),
      ]);
      setUnidades(listaUnidades); setUsuarios(listaUsuarios); setLeads(listaLeads);
      setPessoas(listaPessoas); setImoveis(listaImoveis); setOportunidades(listaOportunidades);
      if (listaUnidades[0]) setUnidadeId((atual) => atual || listaUnidades[0].id);
    } catch {
      setErro('Os dados demonstrativos estão visíveis, mas a API não respondeu para operações em tempo real.');
    }
  }

  // Card real de cada Oportunidade: resolve nome (via Lead -> Pessoa) e
  // interesse/valor (via Imovel). Oportunidade orfa (lead ou imovel removido)
  // e descartada do funil - nao ha o que mostrar sem esses dados.
  const cartoesPorEstado = useMemo(() => {
    const porEstado = new Map<OportunidadeEstado, CartaoOportunidade[]>();
    for (const oportunidade of oportunidades) {
      const lead = leads.find((item) => item.id === oportunidade.leadId);
      const pessoa = lead ? pessoas.find((item) => item.id === lead.pessoaId) : undefined;
      const imovel = imoveis.find((item) => item.id === oportunidade.imovelId);
      if (!pessoa || !imovel) continue;
      const cartao: CartaoOportunidade = {
        id: oportunidade.id,
        nome: pessoa.nome,
        interesse: imovel.enderecoResumo,
        valor: imovel.valorAnunciado,
        criadoEm: oportunidade.criadoEm,
        estado: oportunidade.estado,
        iniciais: iniciaisDe(pessoa.nome),
      };
      const lista = porEstado.get(oportunidade.estado) ?? [];
      lista.push(cartao);
      porEstado.set(oportunidade.estado, lista);
    }
    return porEstado;
  }, [oportunidades, leads, pessoas, imoveis]);

  const colunasPipeline = useMemo(
    () => ESTADOS_OPORTUNIDADE.map(({ estado, label, tone }) => {
      const cartoes = cartoesPorEstado.get(estado) ?? [];
      return { estado, title: label, tone, cartoes, total: cartoes.reduce((soma, item) => soma + (item.valor ?? 0), 0) };
    }),
    [cartoesPorEstado],
  );

  const detalheOportunidade = useMemo(() => {
    if (!detalheOportunidadeId) return null;
    for (const coluna of colunasPipeline) {
      const achado = coluna.cartoes.find((item) => item.id === detalheOportunidadeId);
      if (achado) return achado;
    }
    return null;
  }, [detalheOportunidadeId, colunasPipeline]);

  useEffect(() => { if (sessao) void carregarDados(); }, [sessao?.tenantId]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHAVE_PREFERENCIAS_FUNIL, JSON.stringify(preferenciasFunil));
  }, [preferenciasFunil]);

  const pipelineVisivel = useMemo(() => {
    const porTitulo = new Map(pipeline.map((coluna) => [coluna.title, coluna]));
    return preferenciasFunil.ordem
      .filter((titulo) => !preferenciasFunil.ocultas.includes(titulo))
      .map((titulo) => porTitulo.get(titulo))
      .filter((coluna): coluna is PipelineColumn => Boolean(coluna));
  }, [pipeline, preferenciasFunil]);

  const linhasListaPipeline = useMemo(
    () => pipelineVisivel.flatMap((coluna) => coluna.cards.map((card) => ({ coluna, card }))),
    [pipelineVisivel],
  );
  useEffect(() => {
    const abrirPeloEndereco = () => setModalAberto(window.location.hash === '#novo-lead');
    abrirPeloEndereco(); window.addEventListener('hashchange', abrirPeloEndereco);
    return () => window.removeEventListener('hashchange', abrirPeloEndereco);
  }, []);

  const leadsFiltrados = useMemo(() => tableLeads.filter((lead) => `${lead.name} ${lead.source} ${lead.interest}`.toLowerCase().includes(busca.toLowerCase())), [busca]);

  // idLead opcional: drag-and-drop (Kanban) usa o leadArrastado ja setado via
  // onDragStart; o seletor "Mover para" (Lista) passa o id direto, porque o
  // onChange dispara e le o novo estado antes de qualquer setState anterior
  // ter efeito (setLeadArrastado + moverLead na mesma funcao nao veriam o
  // valor atualizado por causa do closure do React).
  function moverLead(destinoTitulo: string, idLead?: string) {
    const alvo = idLead ?? leadArrastado;
    if (!alvo) return;
    setPipeline((colunas) => {
      const origem = colunas.findIndex((coluna) => coluna.cards.some((card) => card[0] === alvo));
      const destino = colunas.findIndex((coluna) => coluna.title === destinoTitulo);
      if (origem < 0 || destino < 0 || origem === destino) return colunas;
      const card = colunas[origem].cards.find((item) => item[0] === alvo);
      if (!card) return colunas;
      return colunas.map((coluna) => ({
        ...coluna,
        cards: coluna.title === colunas[origem].title
          ? coluna.cards.filter((item) => item[0] !== alvo)
          : coluna.title === destinoTitulo
            ? [...coluna.cards, card]
            : coluna.cards,
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
      <header className="leads-section-head"><div><h2 id="lead-pipeline-title">Pipeline de Leads <span>(Funil)</span></h2><small>{visualizacaoPipeline === 'colunas' ? 'Arraste os cartões entre as etapas para atualizar o status' : 'Use "Mover para" em cada linha para atualizar o status'}</small></div><div className="lead-pipeline-actions"><select aria-label="Selecionar funil"><option>Funil Padrão</option></select><button onClick={() => setPersonalizarAberto(true)}>⚙ Personalizar</button><button onClick={() => setVisualizacaoPipeline('lista')} className={visualizacaoPipeline === 'lista' ? 'active' : ''} aria-label="Visualização em lista" aria-pressed={visualizacaoPipeline === 'lista'}>☷</button><button onClick={() => setVisualizacaoPipeline('colunas')} className={visualizacaoPipeline === 'colunas' ? 'active' : ''} aria-label="Visualização em colunas" aria-pressed={visualizacaoPipeline === 'colunas'}>▦</button></div></header>
      {visualizacaoPipeline === 'colunas' ? <div className="lead-kanban">
        {pipelineVisivel.map((column, columnIndex) => <article className={`lead-kanban-column lead-kanban-column--${column.tone}`} key={column.title} onDragOver={prepararDestino} onDrop={() => moverLead(column.title)}>
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
      </div> : <div className="lead-table-card lead-pipeline-list"><div className="lead-table-scroll"><table><thead><tr><th>Lead</th><th>Interesse</th><th>Valor</th><th>Etapa</th><th>Tempo</th><th>Mover para</th></tr></thead><tbody>
        {linhasListaPipeline.map(({ coluna, card }, indice) => <tr key={card[0]}>
          <td><div className="lead-name-cell"><LeadAvatar initials={card[4]} index={indice} /><b>{card[0]}</b></div></td>
          <td>{card[1]}</td>
          <td><b>{card[2]}</b></td>
          <td><em className={`lead-status lead-status--${coluna.tone}`}>{coluna.title}</em></td>
          <td>{card[3]}</td>
          <td><select aria-label={`Mover ${card[0]} para outra etapa`} value={coluna.title} onChange={(evento) => moverLead(evento.target.value, card[0])}>{pipelineVisivel.map((c) => <option key={c.title} value={c.title}>{c.title}</option>)}</select></td>
        </tr>)}
      </tbody></table></div></div>}
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

    {personalizarAberto && <div className="lead-modal-backdrop" role="presentation" onMouseDown={(evento)=>{if(evento.target===evento.currentTarget)setPersonalizarAberto(false);}}><section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="personalizar-funil-title"><header><div><h2 id="personalizar-funil-title">Personalizar Funil</h2><p>Escolha quais etapas aparecem e a ordem delas no Kanban e na Lista.</p></div><button onClick={()=>setPersonalizarAberto(false)} aria-label="Fechar">×</button></header>
      <div className="lead-personalizar-lista">{preferenciasFunil.ordem.map((titulo, indice) => {
        const oculta = preferenciasFunil.ocultas.includes(titulo);
        return <div className="lead-personalizar-item" key={titulo}>
          <label><input type="checkbox" checked={!oculta} onChange={() => setPreferenciasFunil((preferencias) => ({ ...preferencias, ocultas: oculta ? preferencias.ocultas.filter((item) => item !== titulo) : [...preferencias.ocultas, titulo] }))} />{titulo}</label>
          <span className="lead-personalizar-mover">
            <button type="button" disabled={indice === 0} aria-label={`Mover ${titulo} para cima`} onClick={() => setPreferenciasFunil((preferencias) => { const nova = [...preferencias.ordem]; [nova[indice - 1], nova[indice]] = [nova[indice], nova[indice - 1]]; return { ...preferencias, ordem: nova }; })}>↑</button>
            <button type="button" disabled={indice === preferenciasFunil.ordem.length - 1} aria-label={`Mover ${titulo} para baixo`} onClick={() => setPreferenciasFunil((preferencias) => { const nova = [...preferencias.ordem]; [nova[indice + 1], nova[indice]] = [nova[indice], nova[indice + 1]]; return { ...preferencias, ordem: nova }; })}>↓</button>
          </span>
        </div>;
      })}</div>
      <footer className="lead-personalizar-footer"><button type="button" onClick={() => setPreferenciasFunil({ ordem: titulosPadraoPipeline, ocultas: [] })}>Restaurar padrão</button><button type="button" className="lead-personalizar-concluir" onClick={() => setPersonalizarAberto(false)}>Concluir</button></footer>
    </section></div>}
  </main>;
}
