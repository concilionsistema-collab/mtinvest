'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { Imovel, IndicadoresFunil, Lead, Oportunidade, Proposta, Unidade, Usuario, UsuarioPerfil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, apiFetchBlob, ApiError } from '../../lib/api';
import styles from './equipe.module.css';

type Filtro = 'todos' | 'corretores' | 'gestores' | 'socios' | 'inativos';
type Visualizacao = 'lista' | 'cards' | 'organograma';
type Tom = 'primary' | 'secondary' | 'success' | 'warning';
type Membro = { usuario: Usuario; unidade?: Unidade; leads: Lead[]; propostas: Proposta[]; vendas: number; performance: number };

const PERFIS: UsuarioPerfil[] = ['CORRETOR', 'GESTOR_UNIDADE'];
const PERFIL: Record<UsuarioPerfil, { rotulo: string; curto: string; tom: Tom }> = {
  CORRETOR: { rotulo: 'Corretor', curto: 'Corretor', tom: 'primary' },
  GESTOR_UNIDADE: { rotulo: 'Gestor da Unidade / Administrador', curto: 'Gestor', tom: 'secondary' },
};
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' }, { id: 'corretores', rotulo: 'Corretores' },
  { id: 'gestores', rotulo: 'Gestores' }, { id: 'socios', rotulo: 'Sócios' }, { id: 'inativos', rotulo: 'Inativos' },
];

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number, compacto = false) {
  if (compacto && valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (compacto && valor >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
}
function iniciais(nome: string) { const p = nome.trim().split(/\s+/); return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? p[0]?.[1] ?? ''}`.toUpperCase(); }
function tempoCadastro(iso: string) { const dias = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)); return dias === 1 ? 'Há 1 dia' : dias < 30 ? `Há ${dias} dias` : 'Online'; }

function MemberAvatar({ usuario, token, onClick, enviando = false }: { usuario: Usuario; token: number; onClick?: () => void; enviando?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!usuario.temFotoPerfil) { setUrl(null); return; }
    let cancelado = false; let criada: string | null = null;
    apiFetchBlob(`/usuarios/${usuario.id}/foto`).then((blob) => { if (!cancelado && blob) { criada = URL.createObjectURL(blob); setUrl(criada); } }).catch(() => { if (!cancelado) setUrl(null); });
    return () => { cancelado = true; if (criada) URL.revokeObjectURL(criada); };
  }, [usuario.id, usuario.temFotoPerfil, token]);
  return <button type="button" className={styles.avatar} onClick={onClick} aria-label={onClick ? `Alterar foto de ${usuario.nome}` : `Foto de ${usuario.nome}`} disabled={!onClick}>{url ? <img src={url} alt="" /> : <span>{iniciais(usuario.nome)}</span>}{enviando && <i>Enviando</i>}</button>;
}

export default function EquipePage() {
  const { sessao } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null); const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]); const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]); const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFunil | null>(null); const [filtro, setFiltro] = useState<Filtro>('todos');
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista'); const [modal, setModal] = useState(false);
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<UsuarioPerfil>('CORRETOR'); const [unidadeId, setUnidadeId] = useState('');
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState<string | null>(null); const [mensagem, setMensagem] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null); const [fotoUsuarioId, setFotoUsuarioId] = useState<string | null>(null);
  const [imageTokens, setImageTokens] = useState<Record<string, number>>({}); const [menu, setMenu] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function carregar() {
    setErro(null);
    try {
      const [u, un, l, o, p, i, ind] = await Promise.all([
        apiFetch<Usuario[]>('/usuarios'), apiFetch<Unidade[]>('/unidades').catch(() => []), apiFetch<Lead[]>('/leads').catch(() => []),
        apiFetch<Oportunidade[]>('/oportunidades').catch(() => []), apiFetch<Proposta[]>('/propostas').catch(() => []),
        apiFetch<Imovel[]>('/imoveis').catch(() => []), apiFetch<IndicadoresFunil>('/indicadores').catch(() => null),
      ]);
      setUsuarios(u); setUnidades(un); setLeads(l); setOportunidades(o); setPropostas(p); setImoveis(i); setIndicadores(ind);
      setUnidadeId((atual) => atual || sessao?.unidadeId || un[0]?.id || '');
    } catch (e) { setErro(e instanceof ApiError && e.status === 401 ? 'Sua sessão expirou. Entre novamente para acessar a equipe.' : 'Não foi possível carregar a equipe.'); }
  }
  useEffect(() => { if (sessao) void carregar(); }, [sessao?.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const verificarHash = () => { if (window.location.hash === '#novo-membro') setModal(true); };
    verificarHash(); window.addEventListener('hashchange', verificarHash); return () => window.removeEventListener('hashchange', verificarHash);
  }, []);

  const membros = useMemo<Membro[]>(() => {
    const base = (usuarios ?? []).map((usuario) => {
      const leadsDoUsuario = leads.filter((lead) => lead.responsavelUsuarioId === usuario.id);
      const idsLeads = new Set(leadsDoUsuario.map((lead) => lead.id));
      const oportunidadesDoUsuario = oportunidades.filter((o) => idsLeads.has(o.leadId));
      const idsOportunidades = new Set(oportunidadesDoUsuario.map((o) => o.id));
      const propostasDoUsuario = propostas.filter((p) => idsOportunidades.has(p.oportunidadeId));
      const fechadas = oportunidadesDoUsuario.filter((o) => o.estado === 'FECHADA');
      const vendas = fechadas.reduce((s, o) => { const proposta = propostasDoUsuario.filter((p) => p.oportunidadeId === o.id).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0]; return s + (proposta?.valor ?? imoveis.find((i) => i.id === o.imovelId)?.valorAnunciado ?? 0); }, 0);
      return { usuario, unidade: unidades.find((u) => u.id === usuario.unidadeId), leads: leadsDoUsuario, propostas: propostasDoUsuario, vendas, performance: 0 };
    });
    const maior = Math.max(1, ...base.map((m) => m.vendas), ...base.map((m) => m.leads.length * 10_000));
    return base.map((m) => ({ ...m, performance: m.usuario.status === 'DESLIGADO' ? 0 : Math.round(Math.max(m.vendas, m.leads.length * 10_000) / maior * 100) })).sort((a, b) => Number(b.usuario.status === 'ATIVO') - Number(a.usuario.status === 'ATIVO') || b.performance - a.performance);
  }, [usuarios, leads, oportunidades, propostas, imoveis, unidades]);

  const ativos = membros.filter((m) => m.usuario.status === 'ATIVO'); const corretores = ativos.filter((m) => m.usuario.perfil === 'CORRETOR'); const gestores = ativos.filter((m) => m.usuario.perfil === 'GESTOR_UNIDADE');
  const filtrados = membros.filter((m) => filtro === 'todos' || (filtro === 'corretores' && m.usuario.perfil === 'CORRETOR') || (filtro === 'gestores' && m.usuario.perfil === 'GESTOR_UNIDADE') || (filtro === 'inativos' && m.usuario.status !== 'ATIVO') || false);
  const vendasTotais = membros.reduce((s, m) => s + m.vendas, 0); const propostasTotais = membros.reduce((s, m) => s + m.propostas.length, 0);
  const atividade = membros.length ? Math.round(ativos.length / membros.length * 100) : 0;

  function fecharModal() { setModal(false); window.history.replaceState(null, '', window.location.pathname); }
  async function criar(e: FormEvent) {
    e.preventDefault(); setSalvando(true); setErro(null);
    try { await apiFetch('/usuarios', { method: 'POST', body: JSON.stringify({ unidadeId, nome, email, senha, perfil }) }); setNome(''); setEmail(''); setSenha(''); setPerfil('CORRETOR'); fecharModal(); setMensagem('Novo membro cadastrado com sucesso.'); await carregar(); }
    catch (e) { setErro(e instanceof ApiError && e.status === 400 ? 'Confira os dados e sua permissão para criar este perfil.' : 'Não foi possível cadastrar o membro.'); }
    finally { setSalvando(false); }
  }
  function escolherFoto(id: string) { setFotoUsuarioId(id); fileInput.current?.click(); }
  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]; if (!arquivo || !fotoUsuarioId) return; setUploadingId(fotoUsuarioId); setErro(null);
    try { const dados = new FormData(); dados.append('file', arquivo); await apiFetch(`/usuarios/${fotoUsuarioId}/foto`, { method: 'POST', body: dados }); await carregar(); setImageTokens((t) => ({ ...t, [fotoUsuarioId]: Date.now() })); setMensagem('Foto atualizada com sucesso.'); }
    catch { setErro('Não foi possível enviar a foto. Use JPEG, PNG ou WebP de até 5 MB.'); }
    finally { setUploadingId(null); setFotoUsuarioId(null); e.target.value = ''; }
  }
  async function desligar(usuario: Usuario) {
    if (!window.confirm(`Confirma o desligamento de ${usuario.nome}? As carteiras serão tratadas conforme as regras de transferência.`)) return;
    try { await apiFetch(`/usuarios/${usuario.id}/desligar`, { method: 'POST' }); setMenu(null); setMensagem('Membro desligado e carteira encaminhada conforme o estágio das negociações.'); await carregar(); }
    catch { setErro('Não foi possível desligar este membro.'); }
  }

  if (!sessao) return null;
  if (erro && !usuarios) return <main className={styles.state}><Icon code={'\uE7BA'} /><h1>Equipe indisponível</h1><p>{erro}</p></main>;
  if (!usuarios) return <main className={styles.state}><span className={styles.loader} /><h1>Organizando equipe</h1><p>Carregando membros e desempenho...</p></main>;

  const metricas: { tom: Tom; icone: string; valor: string; titulo: string; apoio: string }[] = [
    { tom: 'primary', icone: '\uE716', valor: String(ativos.length), titulo: 'Membros ativos', apoio: `${membros.length - ativos.length} inativo(s)` },
    { tom: 'success', icone: '\uE77B', valor: String(corretores.length), titulo: 'Corretores', apoio: moeda(corretores.reduce((s, m) => s + m.vendas, 0), true) + ' em vendas' },
    { tom: 'secondary', icone: '\uE821', valor: String(gestores.length), titulo: 'Gestores', apoio: `${new Set(gestores.map((m) => m.usuario.unidadeId)).size} unidade(s)` },
    { tom: 'warning', icone: '\uE716', valor: '0', titulo: 'Sócios', apoio: 'perfil ainda não configurado' },
    { tom: 'success', icone: '\uE9D2', valor: `${atividade}%`, titulo: 'Atividade média', apoio: indicadores ? `${indicadores.leadsEmAtendimento} leads em atendimento` : `${ativos.length} membro(s) ativo(s)` },
  ];

  return <main className={styles.page}>
    {mensagem && <button type="button" className={styles.toast} onClick={() => setMensagem(null)}>{mensagem}<span>×</span></button>}
    {erro && <button type="button" className={styles.inlineError} onClick={() => setErro(null)}>{erro}<span>×</span></button>}
    <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={enviarFoto} />
    <section className={styles.workspace}>
      <div className={styles.mainColumn}>
        <section className={styles.metrics}>{metricas.map((m) => <article className={styles.metric} data-tone={m.tom} key={m.titulo}><span><Icon code={m.icone} /></span><div><strong>{m.valor}</strong><b>{m.titulo}</b><small>{m.apoio}</small></div></article>)}</section>
        <div className={styles.toolbar} id="equipe-filtros"><div className={styles.filters}>{FILTROS.map((item) => <button type="button" className={filtro === item.id ? styles.active : ''} onClick={() => setFiltro(item.id)} key={item.id}>{item.rotulo}</button>)}</div><div className={styles.views}>{(['lista', 'cards', 'organograma'] as Visualizacao[]).map((item) => <button type="button" className={visualizacao === item ? styles.activeView : ''} onClick={() => setVisualizacao(item)} key={item}><Icon code={item === 'lista' ? '\uE8FD' : item === 'cards' ? '\uE8A0' : '\uE716'} />{item === 'cards' ? 'Cards' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
        {filtrados.length === 0 && <section className={styles.empty}><Icon code={'\uE716'} /><h2>Nenhum membro neste filtro</h2><p>Cadastre um novo membro ou escolha outra categoria.</p></section>}
        {visualizacao === 'lista' && filtrados.length > 0 && <><div className={styles.tableHeader}><span>Membro</span><span>Função</span><span>Unidade</span><span>Contato</span><span>Performance</span><span>Status</span><span>Ações</span></div><div className={styles.list}>{filtrados.map((m) => <article className={styles.row} key={m.usuario.id}>
          <section className={styles.member}><MemberAvatar usuario={m.usuario} token={imageTokens[m.usuario.id] ?? 0} onClick={() => escolherFoto(m.usuario.id)} enviando={uploadingId === m.usuario.id} /><div><h2>{m.usuario.nome}</h2><small>@{m.usuario.email?.split('@')[0] ?? m.usuario.id.slice(-6)}</small></div></section>
          <section className={styles.role}><span data-tone={PERFIL[m.usuario.perfil].tom}>{PERFIL[m.usuario.perfil].curto}</span></section>
          <section className={styles.unit}><b>{m.unidade?.nomeFantasia ?? 'Unidade não informada'}</b><small>{m.unidade?.eMatriz ? 'Matriz' : 'Unidade comercial'}</small></section>
          <section className={styles.contact}><span><Icon code={'\uE715'} />{m.usuario.email ?? 'E-mail não informado'}</span><small><Icon code={'\uE8D4'} />Contato interno</small></section>
          <section className={styles.performance}><small>{m.usuario.perfil === 'GESTOR_UNIDADE' ? 'Leads da equipe' : 'Vendas'}</small><b>{m.usuario.perfil === 'GESTOR_UNIDADE' ? m.leads.length : moeda(m.vendas)}</b><div><i style={{ width: `${m.performance}%` }} data-low={m.performance < 40} /><span>{m.performance}%</span></div></section>
          <section className={styles.status}><span data-active={m.usuario.status === 'ATIVO'}>{m.usuario.status === 'ATIVO' ? 'Ativo' : m.usuario.status === 'AFASTADO' ? 'Afastado' : 'Inativo'}</span><small>{m.usuario.status === 'ATIVO' ? tempoCadastro(m.usuario.criadoEm) : 'Desligado'}</small></section>
          <section className={styles.actions}><button type="button" aria-label={`Conversar com ${m.usuario.nome}`}><Icon code={'\uE8BD'} /></button><button type="button" aria-label="Mais ações" onClick={() => setMenu(menu === m.usuario.id ? null : m.usuario.id)}>⋮</button>{menu === m.usuario.id && <div className={styles.actionMenu}><button type="button" onClick={() => escolherFoto(m.usuario.id)}>Alterar foto</button>{m.usuario.status === 'ATIVO' && <button type="button" onClick={() => void desligar(m.usuario)}>Desligar membro</button>}</div>}</section>
        </article>)}</div><footer className={styles.pagination}><span>Mostrando 1 a {filtrados.length} de {membros.length} membros</span><nav><button type="button">‹</button><button type="button" className={styles.currentPage}>1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">›</button></nav><label>Itens por página: <select defaultValue="10"><option>10</option><option>20</option><option>50</option></select></label></footer></>}
        {visualizacao === 'cards' && filtrados.length > 0 && <div className={styles.cards}>{filtrados.map((m) => <article key={m.usuario.id}><MemberAvatar usuario={m.usuario} token={imageTokens[m.usuario.id] ?? 0} onClick={() => escolherFoto(m.usuario.id)} /><h2>{m.usuario.nome}</h2><span data-tone={PERFIL[m.usuario.perfil].tom}>{PERFIL[m.usuario.perfil].rotulo}</span><p>{m.unidade?.nomeFantasia ?? 'Unidade não informada'}</p><div><b>{m.leads.length}<small>Leads</small></b><b>{m.propostas.length}<small>Propostas</small></b><b>{m.performance}%<small>Performance</small></b></div></article>)}</div>}
        {visualizacao === 'organograma' && filtrados.length > 0 && <div className={styles.org}><div className={styles.orgManagers}>{gestores.map((m) => <article key={m.usuario.id}><MemberAvatar usuario={m.usuario} token={imageTokens[m.usuario.id] ?? 0} /><div><b>{m.usuario.nome}</b><small>{PERFIL[m.usuario.perfil].rotulo}</small></div></article>)}</div><i /><div className={styles.orgTeam}>{corretores.map((m) => <article key={m.usuario.id}><MemberAvatar usuario={m.usuario} token={imageTokens[m.usuario.id] ?? 0} /><b>{m.usuario.nome}</b><small>{m.unidade?.nomeFantasia}</small></article>)}</div></div>}
      </div>
      <aside className={styles.side}>
        <section className={styles.sideCard}><header><h2>Distribuição por função</h2><small>{ativos.length} ativos</small></header><div className={styles.distribution}><div className={styles.donut} style={{ '--p1': `${ativos.length ? corretores.length / ativos.length * 360 : 0}deg`, '--p2': `${ativos.length ? (corretores.length + gestores.length) / ativos.length * 360 : 0}deg` } as CSSProperties}><strong>{ativos.length}</strong><small>Total</small></div><ul><li><i className={styles.dotBlue} /><span>{corretores.length} Corretores<small>{ativos.length ? Math.round(corretores.length / ativos.length * 100) : 0}%</small></span></li><li><i className={styles.dotPurple} /><span>{gestores.length} Gestores<small>{ativos.length ? Math.round(gestores.length / ativos.length * 100) : 0}%</small></span></li><li><i className={styles.dotOrange} /><span>0 Sócios<small>Perfil indisponível</small></span></li></ul></div></section>
        <section className={styles.sideCard}><header><h2>Performance da equipe</h2><small>Este mês⌄</small></header><div className={styles.teamPerformance}><span>Vendas totais<strong>{moeda(vendasTotais, true)}</strong><b>↑ {indicadores?.fechamentos ?? 0} fechamento(s)</b></span><span>Leads atendidos<strong>{leads.filter((l) => l.responsavelUsuarioId).length}</strong><b>↑ {indicadores?.leadsConvertidos ?? 0} convertido(s)</b></span><span>Propostas geradas<strong>{propostasTotais}</strong><b>↑ atividade comercial</b></span></div><a href="/relatorios">Ver relatório completo →</a></section>
        <section className={styles.sideCard}><header><h2>Aniversariantes do mês</h2><small>Equipe</small></header><div className={styles.birthdays}><Icon code={'\uECA5'} /><h3>Datas de aniversário</h3><p>O cadastro atual ainda não possui o campo de nascimento. Quando ele for adicionado, os aniversariantes aparecerão aqui automaticamente.</p></div><button type="button">Ver todos os membros →</button></section>
      </aside>
    </section>
    {modal && <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) fecharModal(); }}><section className={styles.modal} id="novo-membro" role="dialog" aria-modal="true" aria-labelledby="novo-membro-titulo"><header><div><h2 id="novo-membro-titulo">Novo membro</h2><p>Cadastre um corretor ou gestor na equipe.</p></div><button type="button" onClick={fecharModal}>×</button></header><form onSubmit={criar}><label>Nome completo<input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome do membro" /></label><label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nome@empresa.com" /></label><div><label>Função<select value={perfil} onChange={(e) => setPerfil(e.target.value as UsuarioPerfil)}>{PERFIS.map((p) => <option key={p} value={p}>{PERFIL[p].rotulo}</option>)}</select></label><label>Unidade<select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} required>{unidades.map((u) => <option value={u.id} key={u.id}>{u.nomeFantasia}</option>)}</select></label></div><label>Senha inicial<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} placeholder="Mínimo de 8 caracteres" /></label><footer><button type="button" onClick={fecharModal}>Cancelar</button><button type="submit" disabled={salvando}>{salvando ? 'Cadastrando...' : 'Cadastrar membro'}</button></footer></form></section></div>}
  </main>;
}
