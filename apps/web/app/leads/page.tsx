'use client';

import { CSSProperties, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { CapturarLeadResultado, Imovel, ImovelFinalidade, Lead, LeadEstado, Oportunidade, OportunidadeEstado, Pessoa, Unidade, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';

const NOMES_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp', portal: 'Portal', site: 'Site / Portal', indicacao: 'Indicação',
  redes_sociais: 'Redes Sociais', campanha: 'Campanhas', captacao_ativa: 'Captação ativa',
};

const LABEL_ESTADO_LEAD: Record<LeadEstado, { label: string; tone: string }> = {
  EM_FILA_DE_DISTRIBUICAO: { label: 'Na fila', tone: '' },
  DISTRIBUIDO: { label: 'Distribuído', tone: 'blue' },
  EM_ATENDIMENTO: { label: 'Em atendimento', tone: 'orange' },
  INATIVO: { label: 'Inativo', tone: 'red' },
  CONVERTIDO: { label: 'Convertido', tone: 'green' },
};

const LABEL_FINALIDADE: Record<string, string> = { VENDA: 'Venda', LOCACAO: 'Locação', AMBOS: 'Venda ou locação' };

const SEQUENCIA_ESTADOS_OPORTUNIDADE = ['QUALIFICACAO', 'VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA', 'PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA', 'RESERVA', 'DOCUMENTACAO_CONCLUIDA', 'FECHADA'];
function avancoPercentual(estado: OportunidadeEstado): number {
  const indice = SEQUENCIA_ESTADOS_OPORTUNIDADE.indexOf(estado);
  return indice === -1 ? 0 : Math.round(((indice + 1) / SEQUENCIA_ESTADOS_OPORTUNIDADE.length) * 100);
}

const INICIO_DO_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function criadosNoMes<T extends { criadoEm: string }>(itens: T[]): number { return itens.filter((item) => new Date(item.criadoEm) >= INICIO_DO_MES).length; }
/** Mesma simplificação registrada no Dashboard: sem histórico de transição de estado, mede "quanto do total de hoje é novo este mês". */
function tendencia(totalAgora: number, criadosEsteMes: number): number | null {
  const totalInicioDoMes = totalAgora - criadosEsteMes;
  if (totalInicioDoMes <= 0) return criadosEsteMes > 0 ? 100 : null;
  return (criadosEsteMes / totalInicioDoMes) * 100;
}
function rotuloTendencia(percentual: number | null): string { return percentual === null ? 'sem base anterior' : `${percentual >= 0 ? '↗' : '↘'} ${Math.abs(percentual).toFixed(0)}% vs mês anterior`; }

function formatarOrcamento(minimo: number | null, maximo: number | null): string {
  if (minimo == null && maximo == null) return 'Não informado';
  const fmt = (v: number) => v.toLocaleString('pt-BR');
  if (minimo != null && maximo != null) return `R$ ${fmt(minimo)} – R$ ${fmt(maximo)}`;
  return `Até R$ ${fmt((maximo ?? minimo) as number)}`;
}

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
    const porTitulo = new Map(colunasPipeline.map((coluna) => [coluna.title, coluna]));
    return preferenciasFunil.ordem
      .filter((titulo) => !preferenciasFunil.ocultas.includes(titulo))
      .map((titulo) => porTitulo.get(titulo))
      .filter((coluna): coluna is (typeof colunasPipeline)[number] => Boolean(coluna));
  }, [colunasPipeline, preferenciasFunil]);

  const linhasListaPipeline = useMemo(
    () => pipelineVisivel.flatMap((coluna) => coluna.cartoes.map((cartao) => ({ coluna, cartao }))),
    [pipelineVisivel],
  );
  useEffect(() => {
    const abrirPeloEndereco = () => setModalAberto(window.location.hash === '#novo-lead');
    abrirPeloEndereco(); window.addEventListener('hashchange', abrirPeloEndereco);
    return () => window.removeEventListener('hashchange', abrirPeloEndereco);
  }, []);

  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const usuarioPorId = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);

  // Oportunidade mais avançada de cada lead (se houver mais de uma ao longo do tempo) - usada pra "Em Negociação" e "Leads Quentes".
  const melhorOportunidadePorLead = useMemo(() => {
    const mapa = new Map<string, Oportunidade>();
    for (const o of oportunidades) {
      const atual = mapa.get(o.leadId);
      if (!atual || avancoPercentual(o.estado) > avancoPercentual(atual.estado)) mapa.set(o.leadId, o);
    }
    return mapa;
  }, [oportunidades]);

  const kpis = useMemo(() => {
    const totalLeads = leads.length;
    const novos = criadosNoMes(leads);
    const ativos = leads.filter((l) => l.estado !== 'INATIVO' && l.estado !== 'CONVERTIDO');
    const emNegociacao = leads.filter((l) => {
      const o = melhorOportunidadePorLead.get(l.id);
      return o && o.estado !== 'FECHADA' && o.estado !== 'PERDIDA';
    });
    const qualificados = leads.filter((l) => l.estado !== 'EM_FILA_DE_DISTRIBUICAO');
    const convertidosMes = leads.filter((l) => l.estado === 'CONVERTIDO' && new Date(l.criadoEm) >= INICIO_DO_MES);
    const convertidosTotal = leads.filter((l) => l.estado === 'CONVERTIDO');
    const taxaConversao = totalLeads > 0 ? Math.round((convertidosTotal.length / totalLeads) * 1000) / 10 : 0;
    return {
      lista: [
        { label: 'Leads Totais', valor: totalLeads, tone: '', detalhe: rotuloTendencia(tendencia(totalLeads, novos)) },
        { label: 'Novos Leads', valor: novos, tone: 'blue', detalhe: 'este mês' },
        { label: 'Leads Ativos', valor: ativos.length, tone: 'blue', detalhe: rotuloTendencia(tendencia(ativos.length, criadosNoMes(ativos))) },
        { label: 'Em Negociação', valor: emNegociacao.length, tone: 'orange', detalhe: rotuloTendencia(tendencia(emNegociacao.length, criadosNoMes(emNegociacao))) },
        { label: 'Qualificados', valor: qualificados.length, tone: 'green', detalhe: rotuloTendencia(tendencia(qualificados.length, criadosNoMes(qualificados))) },
        { label: 'Convertidos (Mês)', valor: convertidosMes.length, tone: '', detalhe: 'este mês' },
      ],
      taxaConversao,
    };
  }, [leads, melhorOportunidadePorLead]);

  const canaisOrdenados = useMemo(() => {
    const totais = new Map<string, number>();
    for (const lead of leads) totais.set(lead.origemCanal, (totais.get(lead.origemCanal) ?? 0) + 1);
    const total = leads.length || 1;
    return [...totais.entries()].sort(([, a], [, b]) => b - a).map(([canal, quantidade]) => ({ canal, nome: NOMES_CANAL[canal] ?? canal, quantidade, percentual: Math.round((quantidade / total) * 100) }));
  }, [leads]);

  const leadsRecentes = useMemo(() => [...leads]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .slice(0, 5)
    .map((lead) => ({ lead, pessoa: pessoaPorId.get(lead.pessoaId) })),
    [leads, pessoaPorId]);

  const leadsQuentes = useMemo(() => leads
    .map((lead) => ({ lead, pessoa: pessoaPorId.get(lead.pessoaId), oportunidade: melhorOportunidadePorLead.get(lead.id) }))
    .filter((item): item is typeof item & { oportunidade: Oportunidade } => Boolean(item.oportunidade) && item.oportunidade!.estado !== 'FECHADA' && item.oportunidade!.estado !== 'PERDIDA')
    .sort((a, b) => avancoPercentual(b.oportunidade.estado) - avancoPercentual(a.oportunidade.estado))
    .slice(0, 4),
    [leads, pessoaPorId, melhorOportunidadePorLead]);

  const leadsFiltrados = useMemo(() => leads
    .map((lead) => ({ lead, pessoa: pessoaPorId.get(lead.pessoaId), responsavel: lead.responsavelUsuarioId ? usuarioPorId.get(lead.responsavelUsuarioId) : undefined }))
    .filter(({ lead, pessoa }) => `${pessoa?.nome ?? ''} ${NOMES_CANAL[lead.origemCanal] ?? lead.origemCanal} ${lead.finalidadeDesejada ?? ''}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => new Date(b.lead.criadoEm).getTime() - new Date(a.lead.criadoEm).getTime()),
    [leads, busca, pessoaPorId, usuarioPorId]);

  function mensagemDeErro(erro: unknown, fallback: string): string {
    return erro instanceof ApiError && erro.backendMessage ? erro.backendMessage : fallback;
  }

  // idOportunidade opcional: drag-and-drop (Kanban) usa oportunidadeArrastada
  // ja setado via onDragStart; o seletor "Mover para" (Lista) e os botoes do
  // modal de detalhe passam o id direto, porque o handler roda antes de
  // qualquer setState anterior ter efeito (setOportunidadeArrastada + mover
  // na mesma funcao nao veriam o valor atualizado por causa do closure do
  // React). Valida a transicao no cliente so pra dar feedback imediato -
  // quem decide de verdade e sempre o backend (ver TRANSICOES_VALIDAS em
  // oportunidades.service.ts), que revalida tudo de novo.
  async function moverOportunidade(destinoTitulo: string, idOportunidade?: string) {
    const alvo = idOportunidade ?? oportunidadeArrastada;
    setOportunidadeArrastada(null);
    if (!alvo) return;
    const atual = oportunidades.find((item) => item.id === alvo);
    const destino = ESTADOS_OPORTUNIDADE.find((item) => item.label === destinoTitulo);
    if (!atual || !destino || atual.estado === destino.estado) return;

    if (!TRANSICOES_VALIDAS[atual.estado].includes(destino.estado)) {
      setErro(`Não é possível mover direto de "${infoEstado(atual.estado).label}" para "${destino.label}".`);
      return;
    }

    setMovendoId(alvo);
    setErro(null);
    try {
      // DOCUMENTACAO_CONCLUIDA -> FECHADA tem uma rota propria (/fechar) -
      // alem de mudar o estado, ela registra o gatilho de comissao cruzada
      // quando o imovel e de outra unidade (RN-309, ART-009).
      const atualizada = atual.estado === 'DOCUMENTACAO_CONCLUIDA' && destino.estado === 'FECHADA'
        ? await apiFetch<Oportunidade>(`/oportunidades/${alvo}/fechar`, { method: 'POST' })
        : await apiFetch<Oportunidade>(`/oportunidades/${alvo}/mover`, { method: 'POST', body: JSON.stringify({ estadoDestino: destino.estado }) });
      setOportunidades((atuais) => atuais.map((item) => (item.id === alvo ? atualizada : item)));
      setAviso(`Movida para "${destino.label}".`);
    } catch (erro) {
      setErro(mensagemDeErro(erro, 'Não foi possível mover a oportunidade.'));
    } finally {
      setMovendoId(null);
    }
  }

  // US-013/RN-302 (ART-009): registra uma tentativa de contato - conta pro
  // minimo exigido antes de aceitar mover para "Perdida" (o backend rejeita
  // com uma mensagem explicando quantas faltam, ver mensagemDeErro acima).
  async function registrarTentativaDeContato(idOportunidade: string) {
    setMovendoId(idOportunidade);
    setErro(null);
    try {
      const resultado = await apiFetch<{ tentativasRegistradas: number }>(`/oportunidades/${idOportunidade}/tentativas-contato`, { method: 'POST' });
      setAviso(`Tentativa de contato registrada (${resultado.tentativasRegistradas} ao todo).`);
    } catch (erro) {
      setErro(mensagemDeErro(erro, 'Não foi possível registrar a tentativa de contato.'));
    } finally {
      setMovendoId(null);
    }
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
      {oportunidades.length === 0 && !erro && <p className="lead-pipeline-vazio">Nenhuma oportunidade ainda — crie uma em <a href="/oportunidades">Negociações</a> vinculando um lead a um imóvel para ela aparecer aqui.</p>}
      {visualizacaoPipeline === 'colunas' ? <div className="lead-kanban">
        {pipelineVisivel.map((column) => <article className={`lead-kanban-column lead-kanban-column--${column.tone}`} key={column.title} onDragOver={prepararDestino} onDrop={() => moverOportunidade(column.title)}>
          <header><b>{column.title}</b><div><span>{column.cartoes.length} {column.cartoes.length === 1 ? 'oportunidade' : 'oportunidades'}</span><strong>{formatarValor(column.total)}</strong></div></header>
          <div className="lead-kanban-cards">{column.cartoes.map((cartao, cardIndex) => (
            <button
              className={`lead-kanban-card ${oportunidadeArrastada === cartao.id ? 'lead-kanban-card--dragging' : ''} ${movendoId === cartao.id ? 'lead-kanban-card--movendo' : ''}`}
              key={cartao.id}
              disabled={movendoId === cartao.id}
              draggable
              onDragStart={(evento) => { setOportunidadeArrastada(cartao.id); evento.dataTransfer.effectAllowed = 'move'; evento.dataTransfer.setData('text/plain', cartao.id); }}
              onDragEnd={() => setOportunidadeArrastada(null)}
              onClick={() => setDetalheOportunidadeId(cartao.id)}
              aria-label={`${cartao.nome}, ${cartao.interesse}, ${formatarValor(cartao.valor)} - clique para ver detalhes e avançar etapa`}
            >
              <LeadAvatar initials={cartao.iniciais} index={cardIndex} /><span className="lead-card-copy"><span className="lead-card-name"><i>{cartao.iniciais}</i><b>{cartao.nome}</b></span><small>{cartao.interesse}</small><footer><strong>{formatarValor(cartao.valor)}</strong><time>{formatarIdade(cartao.criadoEm)}</time></footer></span><i className="lead-card-status">{column.estado === 'FECHADA' ? '✓' : column.estado === 'PERDIDA' ? '✕' : '›'}</i>
            </button>
          ))}</div>
        </article>)}
      </div> : <div className="lead-table-card lead-pipeline-list"><div className="lead-table-scroll"><table><thead><tr><th>Lead</th><th>Interesse</th><th>Valor</th><th>Etapa</th><th>Tempo</th><th>Mover para</th><th>Detalhes</th></tr></thead><tbody>
        {linhasListaPipeline.map(({ coluna, cartao }, indice) => <tr key={cartao.id}>
          <td><div className="lead-name-cell"><LeadAvatar initials={cartao.iniciais} index={indice} /><b>{cartao.nome}</b></div></td>
          <td>{cartao.interesse}</td>
          <td><b>{formatarValor(cartao.valor)}</b></td>
          <td><em className={`lead-status lead-status--${coluna.tone}`}>{coluna.title}</em></td>
          <td>{formatarIdade(cartao.criadoEm)}</td>
          <td><select aria-label={`Mover ${cartao.nome} para outra etapa`} disabled={movendoId === cartao.id} value={coluna.title} onChange={(evento) => moverOportunidade(evento.target.value, cartao.id)}>{ESTADOS_OPORTUNIDADE.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}</select></td>
          <td><button type="button" onClick={() => setDetalheOportunidadeId(cartao.id)}>Ver</button></td>
        </tr>)}
      </tbody></table></div></div>}
    </section>

    <section className="lead-kpi-grid" aria-label="Indicadores de leads">
      {kpis.lista.map(({ label, valor, tone, detalhe }) => <article className={`lead-kpi${tone ? ` lead-kpi--${tone}` : ''}`} key={label}><div><small>{label}</small><strong>{valor.toLocaleString('pt-BR')}</strong><em>{detalhe}</em></div></article>)}
      <article className="lead-kpi lead-kpi--conversion"><div><small>Taxa de Conversão</small><strong>{kpis.taxaConversao}%</strong><em>{leads.length === 0 ? 'sem leads ainda' : 'de todos os leads'}</em></div><span className="lead-kpi__ring" /></article>
    </section>

    <div className="leads-primary-grid leads-primary-grid--insights">
      <aside className="leads-side-column">
        <section className="leads-surface lead-source-card"><header className="leads-section-head"><h2>Leads por Fonte</h2></header><div className="lead-source-body">{canaisOrdenados.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '0 12px' }}>Nenhum lead capturado ainda.</p> : <><div className="lead-source-donut"><strong>{leads.length}</strong><span>Leads</span></div><ul>{canaisOrdenados.map((c, index) => <li className={index % 4 === 0 ? '' : `lead-source--${['blue', 'cyan', 'orange', 'gold'][(index - 1) % 4]}`} key={c.canal}><i/><span>{c.nome}</span><b>{c.percentual}% <em>({c.quantidade})</em></b></li>)}</ul></>}</div></section>
        <section className="leads-surface lead-activity-card"><header className="leads-section-head"><h2>Leads Recentes</h2></header><ul>{leadsRecentes.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '0 12px' }}>Nenhum lead capturado ainda.</p> : leadsRecentes.map(({ lead, pessoa }, index) => <li key={lead.id}><i className={`fluent lead-activity-icon lead-activity-icon--${['blue', 'orange', 'purple'][index % 3]}`} /><span><b>Novo lead</b><small>{pessoa?.nome ?? 'Contato'}</small></span><time>{formatarIdade(lead.criadoEm)}</time></li>)}</ul></section>
      </aside>
    </div>

    <div className="leads-secondary-grid">
      <section className="leads-surface lead-table-card">
        <header className="lead-table-toolbar"><div><h2>Todos os Leads</h2><b>{leads.length} resultados</b></div><label><span className="fluent">&#xE721;</span><input value={busca} onChange={(evento)=>setBusca(evento.target.value)} placeholder="Buscar lead..." /></label><button className="lead-table-new" onClick={()=>setModalAberto(true)}>+ Novo Lead</button></header>
        <div className="lead-table-scroll"><table><thead><tr><th>Lead</th><th>Contato</th><th>Fonte</th><th>Interesse</th><th>Orçamento</th><th>Status</th><th>Responsável</th><th>Criado</th></tr></thead><tbody>{leadsFiltrados.map(({ lead, pessoa, responsavel }, index) => <tr key={lead.id}><td><div className="lead-name-cell"><LeadAvatar initials={iniciaisDe(pessoa?.nome ?? '?')} index={index}/><b>{pessoa?.nome ?? 'Contato'}</b></div></td><td><span className="lead-contact"><small>{pessoa?.telefoneNormalizado ?? 'Sem telefone'}</small></span></td><td><span className="lead-source-label">{NOMES_CANAL[lead.origemCanal] ?? lead.origemCanal}</span></td><td><span className="lead-interest"><b>{lead.finalidadeDesejada ? LABEL_FINALIDADE[lead.finalidadeDesejada] : 'Sem preferência'}</b></span></td><td><b>{formatarOrcamento(lead.orcamentoMinimo, lead.orcamentoMaximo)}</b></td><td><em className={`lead-status${LABEL_ESTADO_LEAD[lead.estado].tone ? ` lead-status--${LABEL_ESTADO_LEAD[lead.estado].tone}` : ''}`}>{LABEL_ESTADO_LEAD[lead.estado].label}</em></td><td><span className="lead-broker">{responsavel ? <><LeadAvatar initials={iniciaisDe(responsavel.nome)} index={index+2}/>{responsavel.nome}</> : 'Sem responsável'}</span></td><td>{formatarIdade(lead.criadoEm)}</td></tr>)}</tbody></table></div>
        <footer className="lead-table-footer"><span>Mostrando {leadsFiltrados.length} de {leads.length} leads</span></footer>
      </section>

      <aside className="leads-surface hot-leads-card"><header className="leads-section-head"><h2>Negociações Mais Avançadas</h2></header><ul>{leadsQuentes.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 11, padding: '0 12px' }}>Nenhuma negociação ativa no momento.</p> : leadsQuentes.map(({ lead, pessoa, oportunidade }, index) => { const nome = pessoa?.nome ?? 'Contato'; const telefone = pessoa?.telefoneNormalizado; return <li key={lead.id}><LeadAvatar initials={iniciaisDe(nome)} index={index}/><span><b>{nome}</b><small>{avancoPercentual(oportunidade.estado)}% do funil</small></span>{telefone ? <a href={`tel:${telefone}`}>Ligar</a> : <em>Sem telefone</em>}</li>; })}</ul></aside>
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

    {detalheOportunidade && <div className="lead-modal-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setDetalheOportunidadeId(null); }}><section className="lead-modal lead-detalhe-modal" role="dialog" aria-modal="true" aria-labelledby="detalhe-oportunidade-title">
      <header><div><h2 id="detalhe-oportunidade-title">{detalheOportunidade.nome}</h2><p>{detalheOportunidade.interesse}</p></div><button onClick={() => setDetalheOportunidadeId(null)} aria-label="Fechar">×</button></header>
      <div className="lead-detalhe-corpo">
        <dl className="lead-detalhe-info">
          <div><dt>Etapa atual</dt><dd><em className={`lead-status lead-status--${infoEstado(detalheOportunidade.estado).tone}`}>{infoEstado(detalheOportunidade.estado).label}</em></dd></div>
          <div><dt>Valor do imóvel</dt><dd>{formatarValor(detalheOportunidade.valor)}</dd></div>
          <div><dt>Oportunidade criada</dt><dd>{new Date(detalheOportunidade.criadoEm).toLocaleDateString('pt-BR')} ({formatarIdade(detalheOportunidade.criadoEm)})</dd></div>
        </dl>

        <div className="lead-detalhe-acoes">
          <button type="button" disabled={movendoId === detalheOportunidade.id} onClick={() => registrarTentativaDeContato(detalheOportunidade.id)}>☎ Registrar tentativa de contato</button>
          {TRANSICOES_VALIDAS[detalheOportunidade.estado].length === 0
            ? <p className="lead-detalhe-terminal">{detalheOportunidade.estado === 'FECHADA' ? 'Negócio fechado — não há próxima etapa.' : 'Oportunidade perdida — não há próxima etapa.'}</p>
            : TRANSICOES_VALIDAS[detalheOportunidade.estado].map((destino) => (
              <button key={destino} type="button" disabled={movendoId === detalheOportunidade.id} className={destino === 'PERDIDA' ? 'lead-detalhe-perder' : 'lead-detalhe-avancar'} onClick={() => moverOportunidade(infoEstado(destino).label, detalheOportunidade.id)}>
                {destino === 'PERDIDA' ? 'Marcar como perdida' : `Avançar para ${infoEstado(destino).label} →`}
              </button>
            ))}
        </div>
      </div>
    </section></div>}
  </main>;
}
