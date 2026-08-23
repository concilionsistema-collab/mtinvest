'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Imovel, Lead, Oportunidade, Pessoa, Proposta, Usuario } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './propostas.module.css';

type Filtro = 'todas' | 'enviadas' | 'negociacao' | 'contrapropostas' | 'aceitas' | 'recusadas' | 'expiradas';
type Visualizacao = 'lista' | 'kanban' | 'timeline';
type Tom = 'primary' | 'secondary' | 'success' | 'warning' | 'danger';

type GrupoProposta = {
  oportunidadeId: string;
  propostas: Proposta[];
  atual: Proposta;
};

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' }, { id: 'enviadas', rotulo: 'Enviadas' },
  { id: 'negociacao', rotulo: 'Em negociação' }, { id: 'contrapropostas', rotulo: 'Contrapropostas' },
  { id: 'aceitas', rotulo: 'Aceitas' }, { id: 'recusadas', rotulo: 'Recusadas' },
  { id: 'expiradas', rotulo: 'Expiradas' },
];

const STATUS: Record<Proposta['status'], string> = { ENVIADA: 'Enviada', ACEITA: 'Aceita', RECUSADA: 'Recusada' };

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function tituloImovel(endereco: string) { return endereco.split(/[,—-]/)[0]?.trim() || 'Imóvel selecionado'; }
function tempoDesde(iso: string) {
  const minutos = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutos < 60) return `Há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `Há ${dias} dia${dias > 1 ? 's' : ''}`;
}
function tomDaProposta(proposta: Proposta): Tom {
  if (proposta.status === 'ACEITA') return 'success';
  if (proposta.status === 'RECUSADA') return 'danger';
  return proposta.tipo === 'CONTRAPROPOSTA' ? 'warning' : 'primary';
}
function rotuloDaProposta(proposta: Proposta) {
  if (proposta.status !== 'ENVIADA') return STATUS[proposta.status];
  return proposta.tipo === 'CONTRAPROPOSTA' ? 'Em negociação' : 'Aguardando cliente';
}
function probabilidade(proposta: Proposta) {
  if (proposta.status === 'ACEITA') return 100;
  if (proposta.status === 'RECUSADA') return 14;
  return proposta.tipo === 'CONTRAPROPOSTA' ? 78 : 52;
}

export default function PropostasPage() {
  const { sessao } = useAuth();
  const [propostas, setPropostas] = useState<Proposta[] | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    Promise.all([
      apiFetch<Proposta[]>('/propostas'),
      apiFetch<Oportunidade[]>('/oportunidades').catch(() => []),
      apiFetch<Imovel[]>('/imoveis').catch(() => []),
      apiFetch<Lead[]>('/leads').catch(() => []),
      apiFetch<Pessoa[]>('/pessoas').catch(() => []),
      apiFetch<Usuario[]>('/usuarios').catch(() => []),
    ]).then(([p, o, i, l, pe, u]) => {
      setPropostas(p); setOportunidades(o); setImoveis(i); setLeads(l); setPessoas(pe); setUsuarios(u);
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar as propostas.');
      else setErro('Não foi possível carregar as propostas da sua unidade.');
    });
  }, [sessao?.tenantId]);

  const grupos = useMemo<GrupoProposta[]>(() => {
    const mapa = new Map<string, Proposta[]>();
    for (const proposta of propostas ?? []) mapa.set(proposta.oportunidadeId, [...(mapa.get(proposta.oportunidadeId) ?? []), proposta]);
    return [...mapa.entries()].map(([oportunidadeId, itens]) => {
      const ordenadas = itens.sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
      return { oportunidadeId, propostas: ordenadas, atual: ordenadas[ordenadas.length - 1] };
    }).sort((a, b) => new Date(b.atual.criadoEm).getTime() - new Date(a.atual.criadoEm).getTime());
  }, [propostas]);

  function contexto(grupo: GrupoProposta) {
    const oportunidade = oportunidades.find((o) => o.id === grupo.oportunidadeId);
    const imovel = oportunidade ? imoveis.find((i) => i.id === oportunidade.imovelId) : undefined;
    const lead = oportunidade ? leads.find((l) => l.id === oportunidade.leadId) : undefined;
    return {
      oportunidade, imovel, lead,
      cliente: lead ? pessoas.find((p) => p.id === lead.pessoaId) : undefined,
      corretor: lead?.responsavelUsuarioId ? usuarios.find((u) => u.id === lead.responsavelUsuarioId) : undefined,
    };
  }

  const filtrados = grupos.filter((grupo) => {
    const p = grupo.atual;
    if (filtro === 'todas') return true;
    if (filtro === 'enviadas') return p.status === 'ENVIADA' && p.tipo === 'INICIAL';
    if (filtro === 'negociacao') return p.status === 'ENVIADA' && p.tipo === 'CONTRAPROPOSTA';
    if (filtro === 'contrapropostas') return grupo.propostas.some((item) => item.tipo === 'CONTRAPROPOSTA');
    if (filtro === 'aceitas') return p.status === 'ACEITA';
    if (filtro === 'recusadas') return p.status === 'RECUSADA';
    return false;
  });

  const valorTotal = grupos.reduce((soma, grupo) => soma + grupo.atual.valor, 0);
  const negociacao = grupos.filter((g) => g.atual.status === 'ENVIADA');
  const contrapropostas = grupos.filter((g) => g.atual.tipo === 'CONTRAPROPOSTA' && g.atual.status === 'ENVIADA');
  const aceitas = grupos.filter((g) => g.atual.status === 'ACEITA');
  const recusadas = grupos.filter((g) => g.atual.status === 'RECUSADA');
  const valorNegociacao = negociacao.reduce((s, g) => s + g.atual.valor, 0);
  const valorContraproposta = contrapropostas.reduce((s, g) => s + g.atual.valor, 0);
  const valorAceito = aceitas.reduce((s, g) => s + g.atual.valor, 0);
  const conversao = grupos.length ? Math.round(aceitas.length / grupos.length * 1000) / 10 : 0;
  const semResposta = negociacao.filter((g) => Date.now() - new Date(g.atual.criadoEm).getTime() > 48 * 60 * 60 * 1000);
  const descontoAlto = grupos.filter((g) => { const c = contexto(g); return c.imovel?.valorAnunciado && g.atual.valor < c.imovel.valorAnunciado * .82; });

  if (!sessao) return null;
  if (erro) return <main className={styles.state}><Icon code="" /><h1>Propostas indisponíveis</h1><p>{erro}</p></main>;
  if (!propostas) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando propostas</h1><p>Carregando negociações e imóveis...</p></main>;

  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '', valor: moeda(valorTotal, true), titulo: 'Valor em propostas', apoio: `${grupos.length} oportunidade(s)` },
    { tom: 'secondary', icone: '', valor: String(negociacao.length).padStart(2, '0'), titulo: 'Em negociação', apoio: moeda(valorNegociacao, true) },
    { tom: 'warning', icone: '', valor: String(contrapropostas.length).padStart(2, '0'), titulo: 'Contrapropostas', apoio: moeda(valorContraproposta, true) },
    { tom: 'success', icone: '', valor: String(aceitas.length).padStart(2, '0'), titulo: 'Aceitas', apoio: moeda(valorAceito, true) },
    { tom: 'secondary', icone: '', valor: `${conversao.toLocaleString('pt-BR')}%`, titulo: 'Taxa de conversão', apoio: `${recusadas.length} recusada(s)` },
  ];

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.metrics} aria-label="Resumo das propostas">{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
        <div className={styles.toolbar} id="propostas-filtros">
          <div className={styles.filters} role="tablist" aria-label="Filtrar propostas">{FILTROS.map((item) => <button type="button" role="tab" aria-selected={filtro === item.id} className={filtro === item.id ? styles.active : ''} onClick={() => setFiltro(item.id)} key={item.id}>{item.rotulo}</button>)}</div>
          <div className={styles.views}>{(['lista', 'kanban', 'timeline'] as Visualizacao[]).map((item) => <button type="button" className={visualizacao === item ? styles.activeView : ''} onClick={() => setVisualizacao(item)} key={item}><Icon code={item === 'lista' ? '' : item === 'kanban' ? '' : ''} />{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        </div>

        {filtrados.length === 0 ? <div className={styles.empty}><span><Icon code="" /></span><h2>Nenhuma proposta neste filtro</h2><p>Abra uma negociação para registrar uma nova proposta comercial.</p><Link href="/oportunidades">Abrir negociações</Link></div> : null}

        {visualizacao === 'lista' && <div className={styles.list}>{filtrados.map((grupo, index) => {
          const c = contexto(grupo); const p = grupo.atual; const tom = tomDaProposta(p);
          const endereco = c.imovel?.enderecoResumo ?? 'Endereço do imóvel não disponível';
          const preco = c.imovel?.valorAnunciado ?? p.valor;
          const diferenca = preco - p.valor; const percentual = preco ? Math.abs(diferenca / preco * 100) : 0;
          const contra = [...grupo.propostas].reverse().find((item) => item.tipo === 'CONTRAPROPOSTA');
          return <article className={styles.proposalCard} data-tone={tom} key={grupo.oportunidadeId}>
            <div className={`${styles.photo} ${styles[`photo${index % 3 + 1}`]}`} role="img" aria-label={`Imagem de ${tituloImovel(endereco)}`} />
            <div className={styles.identity}><span className={styles.code}>#PR-{p.id.slice(-5).toUpperCase()}</span><h2>{tituloImovel(endereco)}</h2><p>{endereco}</p><div className={styles.people}><span><Icon code="" /><small>Cliente</small><b>{c.cliente?.nome ?? 'Cliente não identificado'}</b></span><span><Icon code="" /><small>Corretor</small><b>{c.corretor?.nome ?? 'Equipe comercial'}</b></span></div><div className={styles.actions}>{p.status === 'ACEITA' ? <Link className={styles.contractAction} href="/contratos"><Icon code="" />Gerar contrato</Link> : p.tipo === 'CONTRAPROPOSTA' ? <Link className={styles.primaryAction} href="/oportunidades"><Icon code="" />Abrir negociação</Link> : <button type="button" className={styles.reminderAction} onClick={() => setMensagem('Lembrete preparado para envio ao cliente.')}><Icon code="" />Enviar lembrete</button>}<Link href="/pessoas"><Icon code="" />Ver cliente</Link><Link href="/imoveis"><Icon code="" />Ver imóvel</Link><button type="button" aria-label="Mais opções">•••</button></div></div>
            <div className={styles.financial}><dl><div><dt>Preço do imóvel</dt><dd>{moeda(preco)}</dd></div><div><dt>Proposta atual</dt><dd className={styles.blue}>{moeda(p.valor)}</dd></div><div><dt>Contraproposta</dt><dd className={styles.orange}>{contra && contra.id !== p.id ? moeda(contra.valor) : '—'}</dd></div></dl><div className={styles.difference}><span>Diferença</span><strong data-positive={diferenca >= 0}>{diferenca >= 0 ? '↕ ' : ''}{moeda(Math.abs(diferenca))} ({percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)</strong></div><small className={styles.conditions}>{p.condicoes}</small></div>
            <aside className={styles.stage}><button type="button" className={styles.favorite} aria-label="Favoritar proposta">☆</button><span className={styles.status}>{rotuloDaProposta(p)}</span><div><span>Probabilidade</span><b>{probabilidade(p)}%</b></div><i><b style={{ width: `${probabilidade(p)}%` }} /></i><dl><div><dt>Última interação</dt><dd>{tempoDesde(p.criadoEm)}</dd></div><div><dt>Etapa atual</dt><dd>{p.status === 'ACEITA' ? 'Aguardando contrato' : p.tipo === 'CONTRAPROPOSTA' ? 'Negociação de valor' : 'Aguardando retorno'}</dd></div></dl></aside>
          </article>;
        })}<footer className={styles.pagination}><span>Mostrando 1 a {Math.min(filtrados.length, 10)} de {filtrados.length} propostas</span><nav aria-label="Paginação"><button type="button">‹</button><button type="button" className={styles.currentPage}>1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><button type="button">›</button></nav><label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option><option>50</option></select></label></footer></div>}

        {visualizacao === 'kanban' && <div className={styles.kanban}>{[
          ['Enviadas', filtrados.filter((g) => g.atual.status === 'ENVIADA' && g.atual.tipo === 'INICIAL')],
          ['Negociação', filtrados.filter((g) => g.atual.status === 'ENVIADA' && g.atual.tipo === 'CONTRAPROPOSTA')],
          ['Aceitas', filtrados.filter((g) => g.atual.status === 'ACEITA')],
          ['Recusadas', filtrados.filter((g) => g.atual.status === 'RECUSADA')],
        ].map(([rotulo, itens]) => <section key={String(rotulo)}><header><h2>{rotulo as string}</h2><span>{(itens as GrupoProposta[]).length}</span></header>{(itens as GrupoProposta[]).map((g) => { const c = contexto(g); return <article key={g.oportunidadeId}><span>{moeda(g.atual.valor)}</span><h3>{tituloImovel(c.imovel?.enderecoResumo ?? 'Imóvel')}</h3><p>{c.cliente?.nome ?? 'Cliente não identificado'}</p><small>{tempoDesde(g.atual.criadoEm)}</small></article>; })}</section>)}</div>}

        {visualizacao === 'timeline' && <div className={styles.timeline}>{filtrados.map((g) => { const c = contexto(g); return <article data-tone={tomDaProposta(g.atual)} key={g.atual.id}><time>{new Date(g.atual.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}<small>{new Date(g.atual.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></time><span /><div><b>{g.atual.tipo === 'CONTRAPROPOSTA' ? 'Contraproposta registrada' : 'Proposta enviada'}</b><h2>{tituloImovel(c.imovel?.enderecoResumo ?? 'Imóvel')}</h2><p>{c.cliente?.nome ?? 'Cliente'} · {moeda(g.atual.valor)} · {g.atual.condicoes}</p></div></article>; })}</div>}
      </div>

      <aside className={styles.side}>
        <section className={styles.sideCard}><header><h2>Pipeline de propostas</h2><small>{grupos.length} oportunidade(s)</small></header><div className={styles.pipeline}><div className={styles.donut} style={{ '--sent': `${grupos.length ? negociacao.length / grupos.length * 360 : 0}deg`, '--accepted': `${grupos.length ? (negociacao.length + aceitas.length) / grupos.length * 360 : 0}deg` } as CSSProperties}><strong>{moeda(valorTotal, true)}</strong><small>Total</small></div><ul><li><i className={styles.dotBlue} /><span>Em negociação<small>{moeda(valorNegociacao, true)}</small></span></li><li><i className={styles.dotPurple} /><span>Contrapropostas<small>{moeda(valorContraproposta, true)}</small></span></li><li><i className={styles.dotGreen} /><span>Aceitas<small>{moeda(valorAceito, true)}</small></span></li><li><i className={styles.dotRed} /><span>Recusadas<small>{recusadas.length}</small></span></li></ul></div></section>
        <section className={styles.sideCard}><header><h2>Precisam de atenção</h2><small>Prioridades comerciais</small></header><div className={styles.attention}><article data-tone="danger"><span><Icon code="" /></span><div><b>{semResposta.length} proposta(s)</b><p>Sem resposta há mais de 48h</p></div><button type="button" onClick={() => setFiltro('enviadas')}>Ver agora ›</button></article><article data-tone="warning"><span><Icon code="" /></span><div><b>{contrapropostas.length} contraproposta(s)</b><p>Em negociação de valor</p></div><button type="button" onClick={() => setFiltro('contrapropostas')}>Ver agora ›</button></article><article data-tone="warning"><span><Icon code="" /></span><div><b>{descontoAlto.length} proposta(s)</b><p>Mais de 18% abaixo do preço</p></div><button type="button" onClick={() => setFiltro('todas')}>Ver agora ›</button></article><article data-tone="success"><span><Icon code="" /></span><div><b>{aceitas.length} proposta(s)</b><p>Próximas do fechamento</p></div><button type="button" onClick={() => setFiltro('aceitas')}>Ver agora ›</button></article></div></section>
        <section className={styles.sideCard}><header><h2>Previsão de fechamento</h2><small>Este mês</small></header><div className={styles.forecast}><article data-tone="success"><small>Muito provável</small><strong>{moeda(valorAceito, true)}</strong><b>{aceitas.length}</b></article><article data-tone="primary"><small>Provável</small><strong>{moeda(valorContraproposta, true)}</strong><b>{contrapropostas.length}</b></article><article data-tone="danger"><small>Em risco</small><strong>{moeda(recusadas.reduce((s, g) => s + g.atual.valor, 0), true)}</strong><b>{recusadas.length}</b></article></div><div className={styles.forecastTotal}><span>Pipeline total<strong>{moeda(valorTotal, true)}</strong></span><span>Comissão estimada<strong>{moeda(valorTotal * .03)}</strong></span></div></section>
        <section className={styles.sideCard}><header><h2>Conversão de propostas</h2><small>Este mês</small></header><div className={styles.conversion}><span>Propostas criadas<strong>{grupos.length}</strong></span><span>Aceitas<strong>{aceitas.length}</strong></span><span>Conversão<strong>{conversao.toLocaleString('pt-BR')}%</strong></span></div></section>
      </aside>
    </section>
  </main>;
}
