'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ChecklistDocumentoItem, Imovel, Lead, Oportunidade, Pessoa, Proposta, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './contratos.module.css';

type Filtro = 'todos' | 'andamento' | 'assinaturas' | 'documentacao' | 'concluidos' | 'cancelados';
type Visualizacao = 'lista' | 'kanban' | 'timeline';
type Etapa = 'andamento' | 'assinaturas' | 'documentacao' | 'concluido';
type Tom = 'primary' | 'secondary' | 'success' | 'warning';

type Contrato = {
  oportunidade: Oportunidade;
  imovel?: Imovel;
  cliente?: Pessoa;
  corretor?: Usuario;
  checklist: ChecklistDocumentoItem[];
  proposta?: Proposta;
  valor: number;
  etapa: Etapa;
  progresso: number;
};

const ESTAGIOS = ['RESERVA', 'DOCUMENTACAO_CONCLUIDA', 'FECHADA'] as const;
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' }, { id: 'andamento', rotulo: 'Em andamento' },
  { id: 'assinaturas', rotulo: 'Aguardando assinaturas' }, { id: 'documentacao', rotulo: 'Documentação' },
  { id: 'concluidos', rotulo: 'Concluídos' }, { id: 'cancelados', rotulo: 'Cancelados' },
];
const ETAPAS: Record<Etapa, { rotulo: string; atual: string; tom: Tom }> = {
  andamento: { rotulo: 'Em andamento', atual: 'Documentação inicial', tom: 'primary' },
  assinaturas: { rotulo: 'Aguardando assinaturas', atual: 'Assinatura do cliente', tom: 'warning' },
  documentacao: { rotulo: 'Documentação', atual: 'Análise de documentos', tom: 'secondary' },
  concluido: { rotulo: 'Concluído', atual: 'Contrato assinado', tom: 'success' },
};

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (compacto && valor >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function tituloImovel(endereco: string) { return endereco.split(/[,—-]/)[0]?.trim() || 'Imóvel selecionado'; }
function dataPrevista(iso: string, concluido: boolean) {
  const data = new Date(iso); data.setDate(data.getDate() + (concluido ? 25 : 45));
  return data.toLocaleDateString('pt-BR');
}
function tempoDesde(iso: string) {
  const minutos = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutos < 60) return `Há ${minutos} min`;
  const horas = Math.floor(minutos / 60); if (horas < 24) return `Há ${horas}h`;
  const dias = Math.floor(horas / 24); return `Há ${dias} dia${dias > 1 ? 's' : ''}`;
}

export default function ContratosPage() {
  const { sessao } = useAuth();
  const [oportunidades, setOportunidades] = useState<Oportunidade[] | null>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistDocumentoItem[]>>({});
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Oportunidade[]>('/oportunidades'), apiFetch<Imovel[]>('/imoveis').catch(() => []),
      apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Pessoa[]>('/pessoas').catch(() => []),
      apiFetch<Usuario[]>('/usuarios').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []),
    ]).then(async ([o, i, l, pe, u, pr]) => {
      const pipeline = o.filter((item) => (ESTAGIOS as readonly string[]).includes(item.estado));
      setOportunidades(pipeline); setImoveis(i); setLeads(l); setPessoas(pe); setUsuarios(u); setPropostas(pr);
      const entradas = await Promise.all(pipeline.map((item) => apiFetch<ChecklistDocumentoItem[]>(`/oportunidades/${item.id}/checklist`).then((lista) => [item.id, lista] as const).catch(() => [item.id, []] as const)));
      setChecklists(Object.fromEntries(entradas));
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar os contratos.');
      else setErro('Não foi possível carregar os contratos da sua unidade.');
    });
  }, [sessao?.tenantId]);

  const contratos = useMemo<Contrato[]>(() => (oportunidades ?? []).map((oportunidade) => {
    const imovel = imoveis.find((item) => item.id === oportunidade.imovelId);
    const lead = leads.find((item) => item.id === oportunidade.leadId);
    const lista = checklists[oportunidade.id] ?? [];
    const obrigatorios = lista.filter((item) => item.obrigatorio);
    const concluidos = obrigatorios.filter((item) => item.concluido).length;
    const proporcao = obrigatorios.length ? concluidos / obrigatorios.length : 0;
    let etapa: Etapa = 'andamento'; let progresso = Math.max(28, Math.round(proporcao * 65));
    if (oportunidade.estado === 'FECHADA') { etapa = 'concluido'; progresso = 100; }
    else if (oportunidade.estado === 'DOCUMENTACAO_CONCLUIDA') { etapa = 'assinaturas'; progresso = 85; }
    else if (proporcao >= .45) { etapa = 'documentacao'; progresso = Math.max(45, Math.round(proporcao * 75)); }
    const proposta = propostas.filter((item) => item.oportunidadeId === oportunidade.id).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
    return {
      oportunidade, imovel, checklist: lista, proposta, etapa, progresso,
      cliente: lead ? pessoas.find((item) => item.id === lead.pessoaId) : undefined,
      corretor: lead?.responsavelUsuarioId ? usuarios.find((item) => item.id === lead.responsavelUsuarioId) : undefined,
      valor: proposta?.valor ?? imovel?.valorAnunciado ?? 0,
    };
  }).sort((a, b) => new Date(b.oportunidade.criadoEm).getTime() - new Date(a.oportunidade.criadoEm).getTime()), [oportunidades, imoveis, leads, pessoas, usuarios, propostas, checklists]);

  const filtrados = contratos.filter((c) => filtro === 'todos' || (filtro === 'andamento' && c.etapa === 'andamento') || (filtro === 'assinaturas' && c.etapa === 'assinaturas') || (filtro === 'documentacao' && c.etapa === 'documentacao') || (filtro === 'concluidos' && c.etapa === 'concluido'));
  const porEtapa = (etapa: Etapa) => contratos.filter((c) => c.etapa === etapa);
  const andamento = contratos.filter((c) => c.etapa !== 'concluido');
  const assinaturas = porEtapa('assinaturas'); const documentacao = porEtapa('documentacao'); const concluidos = porEtapa('concluido');
  const valorTotal = contratos.reduce((s, c) => s + c.valor, 0);
  const valorAndamento = andamento.reduce((s, c) => s + c.valor, 0);
  const valorAssinaturas = assinaturas.reduce((s, c) => s + c.valor, 0);
  const valorDocumentacao = documentacao.reduce((s, c) => s + c.valor, 0);
  const valorConcluido = concluidos.reduce((s, c) => s + c.valor, 0);
  const pendencias = contratos.reduce((s, c) => s + c.checklist.filter((item) => item.obrigatorio && !item.concluido).length, 0);
  const taxaConclusao = contratos.length ? Math.round(concluidos.length / contratos.length * 100) : 0;

  if (!sessao) return null;
  if (erro) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Contratos indisponíveis</h1><p>{erro}</p></main>;
  if (!oportunidades) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando contratos</h1><p>Carregando documentos e etapas...</p></main>;

  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '\uE8A5', valor: String(andamento.length).padStart(2, '0'), titulo: 'Em andamento', apoio: moeda(valorAndamento, true) },
    { tom: 'success', icone: '\uE73E', valor: String(concluidos.length).padStart(2, '0'), titulo: 'Documentação concluída', apoio: moeda(valorConcluido, true) },
    { tom: 'warning', icone: '\uE8D2', valor: String(assinaturas.length).padStart(2, '0'), titulo: 'Aguardando assinaturas', apoio: moeda(valorAssinaturas, true) },
    { tom: 'secondary', icone: '\uE70B', valor: String(pendencias).padStart(2, '0'), titulo: 'Checklist pendente pelo cliente', apoio: moeda(valorDocumentacao, true) },
    { tom: 'success', icone: '\uE9D2', valor: `${taxaConclusao}%`, titulo: 'Taxa de conclusão', apoio: `${contratos.length} contrato(s) no pipeline` },
  ];

  const pipeline = [
    { nome: 'Em andamento', valor: valorAndamento, classe: styles.dotBlue },
    { nome: 'Documentação', valor: valorDocumentacao, classe: styles.dotGreen },
    { nome: 'Aguardando assinaturas', valor: valorAssinaturas, classe: styles.dotOrange },
    { nome: 'Concluídos', valor: valorConcluido, classe: styles.dotPurple },
  ];

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.metrics} aria-label="Resumo dos contratos">{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
        <div className={styles.toolbar} id="contratos-filtros">
          <div className={styles.filters} role="tablist" aria-label="Filtrar contratos">{FILTROS.map((item) => <button type="button" role="tab" aria-selected={filtro === item.id} className={filtro === item.id ? styles.active : ''} onClick={() => setFiltro(item.id)} key={item.id}>{item.rotulo}</button>)}</div>
          <div className={styles.views}>{(['lista', 'kanban', 'timeline'] as Visualizacao[]).map((item) => <button type="button" className={visualizacao === item ? styles.activeView : ''} onClick={() => setVisualizacao(item)} key={item}><Icon code={item === 'lista' ? '\uE8FD' : item === 'kanban' ? '\uE8A0' : '\uE81C'} />{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        </div>

        {filtrados.length === 0 && <div className={styles.empty}><span><Icon code={'\uE8A5'} /></span><h2>Nenhum contrato neste filtro</h2><p>As oportunidades em reserva e fechamento aparecem automaticamente aqui.</p><Link href="/oportunidades">Abrir negociações</Link></div>}

        {visualizacao === 'lista' && filtrados.length > 0 && <div className={styles.list}>{filtrados.map((contrato, index) => {
          const info = ETAPAS[contrato.etapa]; const endereco = contrato.imovel?.enderecoResumo ?? 'Endereço do imóvel não disponível';
          const obrigatorios = contrato.checklist.filter((item) => item.obrigatorio); const concluidosChecklist = obrigatorios.filter((item) => item.concluido).length;
          return <article className={styles.contractCard} data-tone={info.tom} key={contrato.oportunidade.id}>
            <div className={`${styles.photo} ${styles[`photo${index % 3 + 1}`]}`} role="img" aria-label={`Imagem de ${tituloImovel(endereco)}`} />
            <section className={styles.identity}><span className={styles.code}>#CT-{contrato.oportunidade.id.slice(-5).toUpperCase()}</span><h2>{tituloImovel(endereco)}</h2><p>{endereco}</p><div className={styles.people}><span><Icon code={'\uE77B'} /><small>Cliente</small><b>{contrato.cliente?.nome ?? 'Cliente não identificado'}</b></span><span><Icon code={'\uE77B'} /><small>Corretor</small><b>{contrato.corretor?.nome ?? 'Equipe comercial'}</b></span></div></section>
            <section className={styles.financial}><dl><div><dt>Valor da negociação</dt><dd>{moeda(contrato.valor)}</dd></div><div><dt>Comissão estimada</dt><dd className={styles.green}>{moeda(contrato.valor * .05)} (5%)</dd></div><div><dt>Previsão de fechamento</dt><dd><Icon code={'\uE787'} /> {dataPrevista(contrato.oportunidade.criadoEm, contrato.etapa === 'concluido')}</dd></div></dl></section>
            <section className={styles.stage}><span className={styles.status}>{info.rotulo}</span><div><span>Progresso do contrato</span><b>{contrato.progresso}%</b></div><i><b style={{ width: `${contrato.progresso}%` }} /></i><dl><div><dt>Etapa atual</dt><dd>{info.atual}</dd></div><div><dt>{contrato.etapa === 'andamento' ? 'Última ação' : 'Última atualização'}</dt><dd>{tempoDesde(contrato.proposta?.criadoEm ?? contrato.oportunidade.criadoEm)}</dd></div></dl>{obrigatorios.length > 0 && <small className={styles.checklist}>{concluidosChecklist}/{obrigatorios.length} documentos obrigatórios</small>}</section>
            <aside className={styles.cardActions}><button type="button" aria-label="Mais opções">•••</button><Link href="/oportunidades"><Icon code={'\uE70F'} />{contrato.etapa === 'concluido' ? 'Visualizar' : 'Abrir contrato'}</Link><div><button type="button" aria-label="Documentos" onClick={() => setMensagem('Documentos do contrato disponíveis na negociação.')}><Icon code={'\uE8A5'} /></button><button type="button" aria-label="Mensagem" onClick={() => setMensagem('Canal de atendimento do contrato aberto.')}><Icon code={'\uE8BD'} /></button><button type="button" aria-label="Checklist" onClick={() => setMensagem(`${pendencias} pendência(s) documental(is) no pipeline.`)}><Icon code={'\uE73E'} /></button></div></aside>
          </article>;
        })}<footer className={styles.pagination}><span>Mostrando 1 a {Math.min(filtrados.length, 10)} de {filtrados.length} contratos</span><nav aria-label="Paginação"><button type="button">‹</button><button type="button" className={styles.currentPage}>1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">›</button></nav><label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option><option>50</option></select></label></footer></div>}

        {visualizacao === 'kanban' && filtrados.length > 0 && <div className={styles.kanban}>{(['andamento', 'documentacao', 'assinaturas', 'concluido'] as Etapa[]).map((etapa) => <section key={etapa}><header><h2>{ETAPAS[etapa].rotulo}</h2><span>{filtrados.filter((c) => c.etapa === etapa).length}</span></header>{filtrados.filter((c) => c.etapa === etapa).map((c) => <article key={c.oportunidade.id}><span>{moeda(c.valor)}</span><h3>{tituloImovel(c.imovel?.enderecoResumo ?? 'Imóvel')}</h3><p>{c.cliente?.nome ?? 'Cliente não identificado'}</p><small>{c.progresso}% concluído</small></article>)}</section>)}</div>}
        {visualizacao === 'timeline' && filtrados.length > 0 && <div className={styles.timeline}>{filtrados.map((c) => <article data-tone={ETAPAS[c.etapa].tom} key={c.oportunidade.id}><time>{new Date(c.oportunidade.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}<small>{c.progresso}%</small></time><span /><div><b>{ETAPAS[c.etapa].rotulo}</b><h2>{tituloImovel(c.imovel?.enderecoResumo ?? 'Imóvel')}</h2><p>{c.cliente?.nome ?? 'Cliente'} · {moeda(c.valor)} · {ETAPAS[c.etapa].atual}</p></div></article>)}</div>}
      </div>

      <aside className={styles.side}>
        <section className={styles.sideCard}><header><h2>Resumo financeiro</h2><small>{contratos.length} contrato(s)</small></header><div className={styles.pipeline}><div className={styles.donut} style={{ '--p1': `${valorTotal ? valorAndamento / valorTotal * 360 : 0}deg`, '--p2': `${valorTotal ? (valorAndamento + valorDocumentacao) / valorTotal * 360 : 0}deg`, '--p3': `${valorTotal ? (valorAndamento + valorDocumentacao + valorAssinaturas) / valorTotal * 360 : 0}deg` } as CSSProperties}><strong>{moeda(valorTotal, true)}</strong><small>Total</small></div><ul>{pipeline.map((item) => <li key={item.nome}><i className={item.classe} /><span>{item.nome}<small>{moeda(item.valor, true)} ({valorTotal ? Math.round(item.valor / valorTotal * 100) : 0}%)</small></span></li>)}</ul></div></section>
        <section className={styles.sideCard}><header><h2>Alertas e pendências</h2><small>Ações prioritárias</small></header><div className={styles.attention}><article data-tone="danger"><span><Icon code={'\uE823'} /></span><div><b>{pendencias} documento(s)</b><p>Checklist obrigatório pendente</p></div><button type="button" onClick={() => setFiltro('documentacao')}>Ver agora ›</button></article><article data-tone="warning"><span><Icon code={'\uE8D2'} /></span><div><b>{assinaturas.length} contrato(s)</b><p>Aguardando assinatura do cliente</p></div><button type="button" onClick={() => setFiltro('assinaturas')}>Ver agora ›</button></article><article data-tone="warning"><span><Icon code={'\uE7BA'} /></span><div><b>{documentacao.length} contrato(s)</b><p>Em análise documental</p></div><button type="button" onClick={() => setFiltro('documentacao')}>Ver agora ›</button></article><article data-tone="success"><span><Icon code={'\uE73E'} /></span><div><b>{concluidos.length} contrato(s)</b><p>Fechamentos concluídos</p></div><button type="button" onClick={() => setFiltro('concluidos')}>Ver agora ›</button></article></div></section>
        <section className={styles.sideCard}><header><h2>Previsão de fechamento</h2><small>Este mês⌄</small></header><div className={styles.forecastValue}><strong>{moeda(valorAndamento, true)}</strong><b>Pipeline ativo</b></div><div className={styles.forecastBar}><i style={{ width: `${valorAndamento ? valorDocumentacao / valorAndamento * 100 : 0}%` }} /><i style={{ width: `${valorAndamento ? valorAssinaturas / valorAndamento * 100 : 0}%` }} /><i /></div><div className={styles.forecastLegend}><span><i className={styles.dotGreen} />Muito provável<b>{moeda(valorAssinaturas, true)}</b></span><span><i className={styles.dotBlue} />Provável<b>{moeda(valorDocumentacao, true)}</b></span><span><i className={styles.dotOrange} />Em risco<b>{moeda(Math.max(0, valorAndamento - valorDocumentacao - valorAssinaturas), true)}</b></span></div></section>
        <section className={styles.sideCard}><header><h2>Tempo médio por etapa</h2><small>Este mês⌄</small></header><div className={styles.average}><span>Documentação<strong>5 dias</strong></span><span>Assinaturas<strong>3 dias</strong></span><span>Finalização<strong>2 dias</strong></span></div></section>
      </aside>
    </section>
  </main>;
}
