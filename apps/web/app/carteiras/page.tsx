'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Imovel, Lead, Oportunidade, Pessoa, Proposta, TransferenciaDeCarteira, Unidade, Usuario, Visita } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import styles from './carteiras.module.css';

type Filtro = 'todos' | 'andamento' | 'aguardando' | 'transferidas' | 'expiradas';
type Ordenacao = 'critico' | 'recente' | 'valor';
type Tom = 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
type Linha = {
  transferencia: TransferenciaDeCarteira;
  lead?: Lead; pessoa?: Pessoa; responsavel?: Usuario; destino?: Usuario; unidade?: Unidade;
  oportunidade?: Oportunidade; imovel?: Imovel; proposta?: Proposta; visita?: Visita; valor: number;
};

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' }, { id: 'andamento', rotulo: 'Em transferência' },
  { id: 'aguardando', rotulo: 'Aguardando escolha' }, { id: 'transferidas', rotulo: 'Transferidas' },
  { id: 'expiradas', rotulo: 'Expiradas' },
];

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (compacto && valor >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function iniciais(nome: string) { const p = nome.trim().split(/\s+/); return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? p[0]?.[1] ?? ''}`.toUpperCase(); }
function titulo(endereco?: string) { return endereco?.split(/[,—-]/)[0]?.trim() || 'Imóvel da oportunidade'; }
function diasRestantes(fim: string | null) { return fim ? Math.max(0, Math.ceil((new Date(fim).getTime() - Date.now()) / 86_400_000)) : 0; }
function tempoDesde(iso: string) {
  const horas = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (horas < 24) return `Há ${horas}h`; const dias = Math.floor(horas / 24); return `Há ${dias} dia${dias > 1 ? 's' : ''}`;
}
function rotuloEtapa(estado?: Oportunidade['estado']) {
  if (estado === 'RESERVA') return 'Reserva';
  if (estado === 'PROPOSTA_ENVIADA' || estado === 'EM_CONTRAPROPOSTA') return 'Proposta em análise';
  if (estado === 'VISITA_CONFIRMADA' || estado === 'VISITA_REALIZADA') return 'Visita confirmada';
  return 'Negociação';
}
function tomEtapa(estado?: Oportunidade['estado']): Tom {
  if (estado === 'RESERVA') return 'primary';
  if (estado === 'PROPOSTA_ENVIADA' || estado === 'EM_CONTRAPROPOSTA') return 'secondary';
  return 'secondary';
}

export default function CarteirasPage() {
  const { sessao } = useAuth();
  const [transferencias, setTransferencias] = useState<TransferenciaDeCarteira[] | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]); const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]); const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]); const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]); const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [emDecisao, setEmDecisao] = useState<string | null>(null); const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos'); const [ordenacao, setOrdenacao] = useState<Ordenacao>('critico');
  const [erro, setErro] = useState<string | null>(null); const [semPermissao, setSemPermissao] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    setErro(null); setSemPermissao(false);
    try {
      const [t, u, l, pe, un, o, i, pr, v] = await Promise.all([
        apiFetch<TransferenciaDeCarteira[]>('/carteiras/transferencias'), apiFetch<Usuario[]>('/usuarios').catch(() => []),
        apiFetch<Lead[]>('/leads').catch(() => []), apiFetch<Pessoa[]>('/pessoas').catch(() => []),
        apiFetch<Unidade[]>('/unidades').catch(() => []), apiFetch<Oportunidade[]>('/oportunidades').catch(() => []),
        apiFetch<Imovel[]>('/imoveis').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []),
        apiFetch<Visita[]>('/visitas').catch(() => []),
      ]);
      setTransferencias(t); setUsuarios(u); setLeads(l); setPessoas(pe); setUnidades(un); setOportunidades(o); setImoveis(i); setPropostas(pr); setVisitas(v);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setSemPermissao(true); setTransferencias([]); }
      else if (e instanceof ApiError && e.status === 401) setErro('Sua sessão expirou. Entre novamente para acessar as carteiras.');
      else setErro('Não foi possível carregar a fila de transferência de carteiras.');
    }
  }

  useEffect(() => { if (sessao) void carregar(); }, [sessao?.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = useMemo<Linha[]>(() => (transferencias ?? []).map((transferencia) => {
    const lead = leads.find((item) => item.id === transferencia.leadId);
    const oportunidade = oportunidades.filter((item) => item.leadId === transferencia.leadId && item.estado !== 'PERDIDA').sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
    const proposta = oportunidade ? propostas.filter((item) => item.oportunidadeId === oportunidade.id).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0] : undefined;
    const visita = oportunidade ? visitas.filter((item) => item.oportunidadeId === oportunidade.id).sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())[0] : undefined;
    const imovel = oportunidade ? imoveis.find((item) => item.id === oportunidade.imovelId) : undefined;
    return { transferencia, lead, oportunidade, proposta, visita, imovel,
      pessoa: lead ? pessoas.find((item) => item.id === lead.pessoaId) : undefined,
      responsavel: transferencia.origemUsuarioId ? usuarios.find((item) => item.id === transferencia.origemUsuarioId) : undefined,
      destino: transferencia.destinoUsuarioId ? usuarios.find((item) => item.id === transferencia.destinoUsuarioId) : undefined,
      unidade: lead ? unidades.find((item) => item.id === lead.unidadeId) : undefined,
      valor: proposta?.valor ?? imovel?.valorAnunciado ?? 0,
    };
  }), [transferencias, leads, oportunidades, propostas, visitas, imoveis, pessoas, usuarios, unidades]);

  const candidatos = usuarios.filter((u) => u.unidadeId === sessao?.unidadeId && u.status === 'ATIVO');
  const pendentes = linhas.filter((l) => l.transferencia.estado === 'PENDENTE');
  const transferidas = linhas.filter((l) => l.transferencia.estado === 'TRANSFERIDA');
  const expiradas = linhas.filter((l) => l.transferencia.estado === 'ESCALADA_MATRIZ');
  const valorDe = (lista: Linha[]) => lista.reduce((s, l) => s + l.valor, 0);
  const valorPendente = valorDe(pendentes); const valorTransferido = valorDe(transferidas); const valorExpirado = valorDe(expiradas); const valorTotal = valorDe(linhas);
  const mediaSla = pendentes.length ? Math.round(pendentes.reduce((s, l) => s + diasRestantes(l.transferencia.slaDecisaoFim), 0) / pendentes.length) : 0;
  const dentroPrazo = pendentes.filter((l) => diasRestantes(l.transferencia.slaDecisaoFim) > 1).length;
  const proximosLimite = pendentes.filter((l) => diasRestantes(l.transferencia.slaDecisaoFim) <= 1).length;
  const slaPercentual = linhas.length ? Math.round((dentroPrazo + transferidas.length) / linhas.length * 100) : 100;
  const filtradas = linhas.filter((l) => filtro === 'todos' || (filtro === 'andamento' && l.transferencia.estado !== 'TRANSFERIDA') || (filtro === 'aguardando' && l.transferencia.estado === 'PENDENTE') || (filtro === 'transferidas' && l.transferencia.estado === 'TRANSFERIDA') || (filtro === 'expiradas' && l.transferencia.estado === 'ESCALADA_MATRIZ')).sort((a, b) => {
    if (ordenacao === 'valor') return b.valor - a.valor;
    if (ordenacao === 'recente') return new Date(b.transferencia.criadoEm).getTime() - new Date(a.transferencia.criadoEm).getTime();
    return diasRestantes(a.transferencia.slaDecisaoFim) - diasRestantes(b.transferencia.slaDecisaoFim);
  });

  async function decidir(id: string) {
    const destinoUsuarioId = destinos[id]; if (!destinoUsuarioId) return;
    setSalvando(true); setErro(null);
    try { await apiFetch(`/carteiras/transferencias/${id}/decidir`, { method: 'POST', body: JSON.stringify({ destinoUsuarioId }) }); setMensagem('Carteira transferida com sucesso.'); setEmDecisao(null); await carregar(); }
    catch { setErro('Não foi possível concluir a transferência. Confirme se o responsável está ativo na unidade.'); }
    finally { setSalvando(false); }
  }

  if (!sessao) return null;
  if (erro && !transferencias) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Carteiras indisponíveis</h1><p>{erro}</p></main>;
  if (!transferencias) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando carteiras</h1><p>Carregando transferências e responsáveis...</p></main>;

  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '\uE8B7', valor: String(pendentes.length + expiradas.length).padStart(2, '0'), titulo: 'Em transferência', apoio: moeda(valorPendente + valorExpirado, true) },
    { tom: 'warning', icone: '\uE823', valor: String(pendentes.length).padStart(2, '0'), titulo: 'Aguardando escolha', apoio: moeda(valorPendente, true) },
    { tom: 'success', icone: '\uE73E', valor: String(transferidas.length).padStart(2, '0'), titulo: 'Transferidas', apoio: moeda(valorTransferido, true) },
    { tom: 'secondary', icone: '\uE716', valor: String(expiradas.length).padStart(2, '0'), titulo: 'Na matriz', apoio: moeda(valorExpirado, true) },
    { tom: 'success', icone: '\uE787', valor: `${mediaSla} dia${mediaSla === 1 ? '' : 's'}`, titulo: 'SLA restante médio', apoio: expiradas.length ? `${expiradas.length} vencida(s)` : 'dentro do prazo' },
  ];
  const recentes = [...transferidas].sort((a, b) => new Date(b.transferencia.decididoEm ?? b.transferencia.criadoEm).getTime() - new Date(a.transferencia.decididoEm ?? a.transferencia.criadoEm).getTime()).slice(0, 4);

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.metrics} aria-label="Resumo das carteiras">{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
        <section className={styles.queueHeader} id="fila-carteiras"><div className={styles.queueTitle}><div><h1>Fila de transferência de carteira</h1><p>Leads com negociação em estágio avançado não são transferidos automaticamente quando o responsável é desligado — ficam aqui até você escolher o destino, dentro do SLA de 5 dias.</p></div><span><Icon code={'\uE823'} /> SLA padrão: 5 dias</span></div><div className={styles.toolbar} id="carteiras-filtros"><div className={styles.filters}>{FILTROS.map((item) => <button type="button" className={filtro === item.id ? styles.active : ''} onClick={() => setFiltro(item.id)} key={item.id}>{item.rotulo}</button>)}</div><div className={styles.sort}><label>Ordenar por: <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}><option value="critico">Mais crítico</option><option value="recente">Mais recente</option><option value="valor">Maior valor</option></select></label><button type="button" aria-label="Visualização em lista"><Icon code={'\uE8FD'} /></button></div></div></section>
        {semPermissao && <section className={styles.permission}><Icon code={'\uE72E'} /><div><h2>Acesso restrito ao gestor</h2><p>A fila de transferências pode ser consultada e decidida apenas pelo perfil Gestor de unidade.</p></div></section>}
        {erro && <button type="button" className={styles.inlineError} onClick={() => setErro(null)}>{erro}<span>×</span></button>}
        <div className={styles.tableHeader}><span>Lead / Oportunidade</span><span>Responsável atual</span><span>Unidade origem</span><span>Status</span><span>SLA restante</span><span>Valor estimado</span><span>Ações</span></div>
        <div className={styles.list}>{filtradas.map((linha) => {
          const t = linha.transferencia; const dias = diasRestantes(t.slaDecisaoFim); const progresso = t.estado === 'ESCALADA_MATRIZ' ? 0 : Math.min(100, dias / 5 * 100);
          const statusTom: Tom = t.estado === 'TRANSFERIDA' ? 'success' : t.estado === 'ESCALADA_MATRIZ' ? 'danger' : 'warning';
          const status = t.estado === 'TRANSFERIDA' ? 'Transferida' : t.estado === 'ESCALADA_MATRIZ' ? 'SLA vencido' : 'Aguardando escolha';
          const atividade = linha.visita ? `${linha.visita.estado === 'CONFIRMADA' ? 'Visita confirmada' : 'Visita registrada'} em ${new Date(linha.visita.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : linha.proposta ? `Proposta enviada em ${new Date(linha.proposta.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : 'Negociação em andamento';
          return <article className={styles.row} key={t.id}>
            <section className={styles.lead}><span className={styles.avatar}>{iniciais(linha.pessoa?.nome ?? 'Cliente')}</span><div><h2>{linha.pessoa?.nome ?? 'Cliente não identificado'} <em data-tone={tomEtapa(linha.oportunidade?.estado)}>{rotuloEtapa(linha.oportunidade?.estado)}</em></h2><b>{titulo(linha.imovel?.enderecoResumo)} · {moeda(linha.valor)}</b><small><Icon code={'\uE787'} /> {atividade}</small></div></section>
            <section className={styles.owner}><b>{linha.responsavel?.nome ?? 'Responsável anterior'}</b><small>{t.estado === 'TRANSFERIDA' ? `Destino: ${linha.destino?.nome ?? 'Equipe'}` : 'Desligado'}</small></section>
            <section className={styles.unit}><b>{linha.unidade?.nomeFantasia ?? 'Unidade de origem'}</b><small>{linha.unidade?.eMatriz ? 'Matriz' : 'Unidade comercial'}</small></section>
            <section className={styles.statusCell}><span data-tone={statusTom}>{status}</span><small>{t.decididoEm ? tempoDesde(t.decididoEm) : tempoDesde(t.criadoEm)}</small></section>
            <section className={styles.sla}><b>{t.estado === 'TRANSFERIDA' ? 'Concluída' : `${dias} dia${dias === 1 ? '' : 's'}`}</b><div><i style={{ width: `${t.estado === 'TRANSFERIDA' ? 100 : progresso}%` }} data-tone={statusTom} /><small>{t.estado === 'TRANSFERIDA' ? '100' : Math.round(progresso)}%</small></div></section>
            <section className={styles.value}><b>{moeda(linha.valor)}</b><small>Potencial</small></section>
            <section className={styles.actions}>{t.estado === 'PENDENTE' ? <><button type="button" onClick={() => setEmDecisao(emDecisao === t.id ? null : t.id)}>Escolher destino</button><button type="button" aria-label="Mais opções">⋮</button></> : <span>{t.estado === 'TRANSFERIDA' ? 'Finalizada' : 'Na matriz'}</span>}{emDecisao === t.id && <div className={styles.destination}><label>Novo responsável<select value={destinos[t.id] ?? ''} onChange={(e) => setDestinos((atual) => ({ ...atual, [t.id]: e.target.value }))}><option value="">Escolha o destino...</option>{candidatos.filter((c) => c.id !== t.origemUsuarioId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label><button type="button" disabled={!destinos[t.id] || salvando} onClick={() => void decidir(t.id)}>{salvando ? 'Transferindo...' : 'Confirmar transferência'}</button></div>}</section>
          </article>;
        })}</div>
        {filtradas.length === 0 && !semPermissao && <section className={styles.empty}><Icon code={'\uE8B7'} /><h2>Nenhuma carteira neste filtro</h2><p>Novas transferências geradas pelo desligamento de responsáveis aparecerão automaticamente aqui.</p></section>}
        <footer className={styles.pagination}><span>Mostrando 1 a {filtradas.length} de {linhas.length} carteiras</span><nav><button type="button">‹</button><button type="button" className={styles.currentPage}>1</button><button type="button">2</button><button type="button">3</button><button type="button">›</button></nav><label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option><option>50</option></select></label></footer>
      </div>
      <aside className={styles.side}>
        <section className={styles.sideCard}><header><h2>Resumo da carteira</h2><small>{linhas.length} registros</small></header><div className={styles.summary}><div className={styles.donut} style={{ '--p1': `${valorTotal ? valorPendente / valorTotal * 360 : 0}deg`, '--p2': `${valorTotal ? (valorPendente + valorTransferido) / valorTotal * 360 : 0}deg`, '--p3': `${valorTotal ? (valorPendente + valorTransferido + valorExpirado) / valorTotal * 360 : 0}deg` } as CSSProperties}><strong>{moeda(valorTotal, true)}</strong><small>Total</small></div><ul><li><i className={styles.dotBlue} /><span>Em transferência<small>{moeda(valorPendente, true)} ({valorTotal ? Math.round(valorPendente / valorTotal * 100) : 0}%)</small></span></li><li><i className={styles.dotOrange} /><span>Aguardando escolha<small>{moeda(valorPendente, true)}</small></span></li><li><i className={styles.dotGreen} /><span>Transferidas<small>{moeda(valorTransferido, true)}</small></span></li><li><i className={styles.dotPurple} /><span>Na matriz<small>{moeda(valorExpirado, true)}</small></span></li></ul></div></section>
        <section className={styles.sideCard}><header><h2>SLA da carteira</h2><small>Tempo de decisão</small></header><div className={styles.slaSummary}><div className={styles.slaRing} style={{ '--sla': `${slaPercentual * 3.6}deg` } as CSSProperties}><strong>{slaPercentual}%</strong><small>Dentro do prazo</small></div><ul><li><b className={styles.green}>{dentroPrazo}</b> dentro do prazo</li><li><b className={styles.orange}>{proximosLimite}</b> próximos do limite</li><li><b className={styles.red}>{expiradas.length}</b> vencido(s)</li></ul></div><button type="button" className={styles.sideAction} onClick={() => setFiltro('expiradas')}>Ver detalhes do SLA →</button></section>
        <section className={styles.sideCard}><header><h2>Transferências recentes</h2><small>Últimas decisões</small></header><div className={styles.recent}>{recentes.length ? recentes.map((l) => <article key={l.transferencia.id}><span><Icon code={'\uE73E'} /></span><div><b>{l.destino?.nome ?? l.pessoa?.nome ?? 'Carteira transferida'}</b><small>{l.unidade?.nomeFantasia ?? 'Unidade'} → {l.destino?.nome ?? 'Novo responsável'}</small></div><em>Transferida</em><time>{l.transferencia.decididoEm ? tempoDesde(l.transferencia.decididoEm) : 'Recente'}</time></article>) : <p>Nenhuma transferência concluída ainda.</p>}</div><button type="button" className={styles.sideAction} onClick={() => setFiltro('transferidas')}>Ver todas as transferências →</button></section>
      </aside>
    </section>
  </main>;
}
