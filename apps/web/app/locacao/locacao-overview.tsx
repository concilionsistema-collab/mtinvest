'use client';

import { useMemo, useState } from 'react';
import type { ContratoDeAdministracao, ContratoDeLocacao, DocumentoDeContrato, Garantia, Imovel, Pessoa, Reajuste, Vistoria } from '@crm/shared';
import { TopThemeSelector } from '../../components/top-theme-selector';
import styles from './locacao.module.css';

type Props = {
  locacoes: ContratoDeLocacao[];
  administracoes: ContratoDeAdministracao[];
  imoveis: Imovel[];
  pessoas: Pessoa[];
  garantias: Record<string, Garantia[]>;
  vistorias: Record<string, Vistoria[]>;
  reajustes: Record<string, Reajuste[]>;
  documentos: Record<string, DocumentoDeContrato[]>;
  lancamentos: { id: string; contratoDeLocacaoId: string | null; tipo: 'A_PAGAR' | 'A_RECEBER'; categoria: string; descricao: string; valor: number; vencimento: string; status: 'PENDENTE' | 'LIQUIDADO' | 'CANCELADO'; dataLiquidacao: string | null }[];
};

const ESTADOS: Record<ContratoDeLocacao['estado'], string> = { RASCUNHO: 'Rascunho', EM_ASSINATURA: 'Em assinatura', AGUARDANDO_VISTORIA_ENTRADA: 'Aguardando vistoria', VIGENTE: 'Vigente', EM_ENCERRAMENTO: 'Em encerramento', EM_ENCERRAMENTO_ANTECIPADO: 'Encerramento antecipado', ENCERRADO: 'Encerrado' };
const INDICES = { IGPM: 'IGP-M', IPCA: 'IPCA', OUTRO: 'Outro' } as const;
const ETAPAS = ['Assinatura', 'Vistoria entrada', 'Vigente', 'Vistoria saída', 'Encerramento'];

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor); }
function data(iso: string | null | undefined) { return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'; }
function codigo(contrato: ContratoDeLocacao) { return `CA-${new Date(contrato.criadoEm).getFullYear()}-${contrato.id.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase()}`; }
function abrirGestao() { const detalhe = document.getElementById('gestao-tecnica-locacao') as HTMLDetailsElement | null; if (detalhe) { detalhe.open = true; detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
function iniciais(nome: string) { return nome.split(/\s+/).filter(Boolean).map((parte) => parte[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR'); }

export function LocacaoOverview({ locacoes, administracoes, imoveis, pessoas, garantias, vistorias, reajustes, documentos, lancamentos }: Props) {
  const [contratoId, setContratoId] = useState(locacoes.find((l) => l.estado === 'VIGENTE')?.id ?? locacoes[0]?.id ?? '');
  const [aba, setAba] = useState<'geral' | 'partes' | 'financeiro'>('geral');
  const contrato = locacoes.find((l) => l.id === contratoId) ?? locacoes[0];
  const contexto = useMemo(() => {
    if (!contrato) return null;
    const administracao = administracoes.find((a) => a.id === contrato.contratoDeAdministracaoId); const imovel = imoveis.find((i) => i.id === administracao?.imovelId);
    const proprietario = pessoas.find((p) => p.id === administracao?.proprietarioPessoaId); const inquilino = pessoas.find((p) => p.id === contrato.inquilinoPessoaId);
    const listaVistorias = vistorias[contrato.id] ?? []; const entrada = listaVistorias.find((v) => v.tipo === 'ENTRADA'); const saida = listaVistorias.find((v) => v.tipo === 'SAIDA');
    const garantia = (garantias[contrato.id] ?? []).find((g) => g.estado === 'ATIVA') ?? (garantias[contrato.id] ?? [])[0];
    return { administracao, imovel, proprietario, inquilino, entrada, saida, garantia, listaReajustes: reajustes[contrato.id] ?? [], listaDocumentos: documentos[contrato.id] ?? [] };
  }, [contrato, administracoes, imoveis, pessoas, vistorias, garantias, reajustes, documentos]);

  if (!contrato || !contexto) return <section className={styles.emptyState}><Icon code={'\uE8A5'} /><h1>Nenhum contrato de locação</h1><p>Cadastre a primeira administração para iniciar o ciclo de locação.</p><button type="button" onClick={abrirGestao}>Nova administração</button></section>;

  const inicio = new Date(contrato.dataInicio).getTime(); const fim = new Date(contrato.vencimentoAtual).getTime(); const agora = Date.now(); const ciclo = Math.max(0, Math.min(100, Math.round((agora - inicio) / Math.max(1, fim - inicio) * 100)));
  const estadoEtapa = contrato.estado === 'RASCUNHO' ? 0 : contrato.estado === 'EM_ASSINATURA' ? 0 : contrato.estado === 'AGUARDANDO_VISTORIA_ENTRADA' ? 1 : contrato.estado === 'VIGENTE' ? 2 : contrato.estado === 'ENCERRADO' ? 4 : 3;
  const finalidade = contexto.imovel?.finalidade === 'LOCACAO' ? 'Locação' : contexto.imovel?.finalidade === 'AMBOS' ? 'Venda e locação' : 'Residencial';
  const garantiaNome = contexto.garantia ? contexto.garantia.tipo === 'FIADOR' ? 'Fiador' : contexto.garantia.tipo === 'CAUCAO' ? 'Caução' : 'Seguro-fiança' : contrato.exigeGarantia ? 'Pendente' : 'Não exigida';
  const diasRestantes = Math.ceil((fim - agora) / 86_400_000);
  const lancamentosContrato = lancamentos.filter((item) => item.contratoDeLocacaoId === contrato.id && item.status !== 'CANCELADO').sort((a, b) => new Date(b.vencimento).getTime() - new Date(a.vencimento).getTime());
  const recebidos = lancamentosContrato.filter((item) => item.tipo === 'A_RECEBER' && item.status === 'LIQUIDADO').reduce((soma, item) => soma + item.valor, 0);
  const emAberto = lancamentosContrato.filter((item) => item.tipo === 'A_RECEBER' && item.status === 'PENDENTE').reduce((soma, item) => soma + item.valor, 0);
  const totalLancado = lancamentosContrato.filter((item) => item.tipo === 'A_RECEBER').reduce((soma, item) => soma + item.valor, 0);
  const totalContrato = contrato.valorAluguel * contrato.prazoMeses;
  const proximoVencimento = [...lancamentosContrato].filter((item) => item.status === 'PENDENTE' && item.tipo === 'A_RECEBER').sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime())[0];
  const ultimoReajuste = contexto.listaReajustes.at(-1);

  return <section className={styles.overview}>
    <div className={styles.contractHero}>
      <div className={styles.contractIdentity}><span><Icon code={'\uE8A5'} /></span><div><small>CONTRATO DE LOCAÇÃO</small><h1>{codigo(contrato)} <em data-state={contrato.estado}>{ESTADOS[contrato.estado]}</em></h1><p>Início: <b>{data(contrato.dataInicio)}</b><i>•</i>Vencimento: <b>{data(contrato.vencimentoAtual)}</b>{diasRestantes > 0 && <small> (em {diasRestantes} dias)</small>}</p></div></div>
      <div className={styles.heroActions}><TopThemeSelector /><div><select aria-label="Selecionar contrato" value={contrato.id} onChange={(e) => setContratoId(e.target.value)}>{locacoes.map((item) => <option value={item.id} key={item.id}>{codigo(item)} · {ESTADOS[item.estado]}</option>)}</select><button type="button" onClick={abrirGestao}><Icon code={'\uE70F'} /> Editar contrato</button><button type="button" onClick={abrirGestao}>••• Mais ações⌄</button></div></div>
    </div>

    <nav className={styles.contractTabs} aria-label="Seções do contrato">{[
      ['geral', 'Visão geral'], ['partes', 'Partes'], ['financeiro', 'Financeiro'], ['garantias', 'Garantias'], ['documentos', 'Documentos'], ['portais', 'Portais'], ['historico', 'Histórico'], ['observacoes', 'Observações'],
    ].map(([id, item]) => <button type="button" className={aba === id ? styles.tabActive : ''} onClick={() => id === 'geral' || id === 'partes' || id === 'financeiro' ? setAba(id) : abrirGestao()} key={id}>{id === 'documentos' && <Icon code={'\uE8A5'} />}{item}</button>)}</nav>

    <div className={styles.overviewGrid}>
      <div className={styles.overviewMain}>
        {aba === 'geral' ? <>
          <article className={`${styles.card} ${styles.propertyCard}`}><h2>Imóvel locado</h2><div className={styles.propertyContent}><img src="/property-featured-hq.png" alt="Imagem de apresentação do imóvel locado" /><section><h3>{contexto.imovel?.enderecoResumo ?? 'Imóvel sem endereço cadastrado'} <Icon code={'\uE8A7'} /></h3><p>{finalidade} <i>•</i> {contexto.imovel?.estadoCompartilhamento.replaceAll('_', ' ').toLocaleLowerCase('pt-BR') ?? 'cadastro ativo'}</p><span><Icon code={'\uE707'} /> {contexto.imovel?.enderecoResumo ?? 'Endereço não informado'}</span><div className={styles.propertyTags}><b><Icon code={'\uE80F'} /> Imóvel cadastrado</b><b><Icon code={'\uE8C7'} /> {contexto.imovel?.valorAnunciado ? moeda(contexto.imovel.valorAnunciado) : 'Valor não informado'}</b><b><Icon code={'\uE81C'} /> {finalidade}</b></div><h4>Partes do contrato</h4><p>Proprietário: <strong>{contexto.proprietario?.nome ?? '—'}</strong><br />Locatário: <strong>{contexto.inquilino?.nome ?? '—'}</strong></p></section></div><footer><button type="button" onClick={abrirGestao}>Ver detalhes do imóvel →</button></footer></article>

          <article className={`${styles.card} ${styles.infoCard}`}><h2>Informações principais</h2><div className={styles.infoGrid}>
          <span><Icon code={'\uE8A5'} /><small>Tipo de contrato</small><b>Administração de locação</b></span><span><Icon code={'\uE787'} /><small>Início</small><b>{data(contrato.dataInicio)}</b></span><span><Icon code={'\uE8B0'} /><small>Garantia</small><b>{garantiaNome}</b></span><span><Icon code={'\uE8C7'} /><small>Competência de cobrança</small><b>Locatário</b></span>
          <span><Icon code={'\uE7EE'} /><small>Finalidade</small><b>{finalidade}</b></span><span><Icon code={'\uE787'} /><small>Vencimento</small><b>{data(contrato.vencimentoAtual)}</b></span><span><Icon code={'\uE8D7'} /><small>Reajustes aplicados</small><b>{contexto.listaReajustes.length}</b></span><span><Icon code={'\uE73E'} /><small>Documentos</small><b>{contexto.listaDocumentos.length} cadastrado(s)</b></span>
          <span><Icon code={'\uE916'} /><small>Prazo</small><b>{contrato.prazoMeses} meses</b></span><span><Icon code={'\uE7BA'} /><small>Renovação automática</small><b>Não — exige confirmação</b></span><span><Icon code={'\uE8D4'} /><small>Índice de reajuste</small><b>{INDICES[contrato.indiceReajuste]}</b></span><span><Icon code={'\uE9D2'} /><small>Dia do vencimento</small><b>Todo dia {contrato.diaVencimento}</b></span>
          </div></article>
        </> : aba === 'partes' ? <article className={`${styles.card} ${styles.partiesCard}`}><header><h2>Partes do contrato</h2><p>Confira os envolvidos neste contrato de locação e suas funções.</p></header><div className={styles.partiesList}>{[
          { pessoa: contexto.proprietario, papel: 'LOCADOR', tom: 'success', apoio: 'Proprietário do imóvel administrado' },
          { pessoa: contexto.inquilino, papel: 'LOCATÁRIO', tom: 'primary', apoio: 'Responsável pela locação' },
          ...(contexto.garantia?.tipo === 'FIADOR' ? [{ pessoa: pessoas.find((p) => p.id === contexto.garantia?.fiadorPessoaId), papel: 'FIADOR', tom: 'secondary', apoio: 'Garantia vinculada ao contrato' }] : []),
        ].map((item) => <article data-tone={item.tom} key={item.papel}><span className={styles.partyAvatar}>{iniciais(item.pessoa?.nome ?? item.papel)}<i><Icon code={'\uE716'} /></i></span><section><em>{item.papel}</em><h3>{item.pessoa?.nome ?? 'Pessoa não cadastrada'}</h3><p><span><Icon code={'\uE8D7'} /> {item.pessoa?.documentoNormalizado ?? 'Documento não informado'}</span><i>•</i><span><Icon code={'\uE717'} /> {item.pessoa?.telefoneNormalizado ?? 'Telefone não informado'}</span></p><p><span><Icon code={'\uE715'} /> E-mail não disponível no cadastro</span></p><small><Icon code={'\uE707'} /> {item.apoio}</small></section><button type="button" aria-label={`Editar ${item.papel.toLocaleLowerCase('pt-BR')}`} onClick={abrirGestao}><Icon code={'\uE70F'} /></button></article>)}</div><button type="button" className={styles.addParty} onClick={abrirGestao}><Icon code={'\uE710'} /> Adicionar parte ao contrato<small>Inclua locador, locatário, fiador ou responsável</small></button></article> : <section className={styles.contractFinance}>
          <article className={`${styles.card} ${styles.financeSummary}`}><h2>Resumo financeiro</h2><div>{[
            ['primary', '\uE8C7', 'Valor do aluguel', moeda(contrato.valorAluguel), ''],
            ['success', '\uE8B0', 'Valor total do contrato', moeda(totalContrato), `${contrato.prazoMeses} meses`],
            ['secondary', '\uE8A5', 'Recebido até agora', totalLancado ? moeda(recebidos) : '—', totalLancado ? `${Math.round(recebidos / totalLancado * 100)}% do lançado` : 'sem lançamentos'],
            ['warning', '\uE823', 'Em aberto', totalLancado ? moeda(emAberto) : '—', totalLancado ? `${Math.round(emAberto / totalLancado * 100)}% do lançado` : 'sem lançamentos'],
          ].map(([tom, icone, titulo, valor, apoio]) => <span data-tone={tom} key={titulo}><i><Icon code={icone} /></i><small>{titulo}</small><b>{valor}</b>{apoio && <em>{apoio}</em>}</span>)}</div></article>
          <div className={styles.financeDetails}>
            <article className={`${styles.card} ${styles.valueBreakdown}`}><h2>Detalhamento de valores</h2><p><span>Aluguel mensal</span><b>{moeda(contrato.valorAluguel)}</b></p><p><span>Encargos cadastrados</span><b>—</b></p><p><span>Taxa de administração</span><b>—</b></p><p><span>Outros valores</span><b>—</b></p><footer><span>Total mensal conhecido</span><b>{moeda(contrato.valorAluguel)}</b></footer><small>Condomínio, IPTU, seguro e taxa administrativa não existem no cadastro atual.</small></article>
            <article className={`${styles.card} ${styles.adjustmentCard}`}><h2>Reajuste</h2><p><span>Índice de reajuste</span><b>{INDICES[contrato.indiceReajuste]}</b></p><p><span>Periodicidade</span><b>Anual</b></p><p><span>Último reajuste</span><b>{ultimoReajuste?.competencia ?? '—'}</b></p><p><span>Índice aplicado</span><b>{ultimoReajuste ? `${ultimoReajuste.percentualAplicado.toLocaleString('pt-BR')}%` : '—'}</b></p><p><span>Valor após reajuste</span><b>{ultimoReajuste ? moeda(ultimoReajuste.valorAluguelNovo) : '—'}</b></p></article>
          </div>
          <article className={`${styles.card} ${styles.paymentHistory}`}><header><h2>Histórico de pagamentos</h2><small>{lancamentosContrato.length} lançamento(s)</small></header><div className={styles.paymentHead}><span>Vencimento</span><span>Descrição</span><span>Valor</span><span>Status</span><span>Pagamento</span><span>Categoria</span><span>Comprovante</span></div>{lancamentosContrato.length ? lancamentosContrato.slice(0, 8).map((item) => <article key={item.id}><time>{data(item.vencimento)}</time><b>{item.descricao}</b><strong>{moeda(item.valor)}</strong><em data-status={item.status}>{item.status === 'LIQUIDADO' ? 'Pago' : item.status === 'PENDENTE' ? 'Pendente' : 'Cancelado'}</em><span>{data(item.dataLiquidacao)}</span><span>{item.categoria.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}</span><span><Icon code={'\uE8A5'} /></span></article>) : <div className={styles.noPayments}><Icon code={'\uE8C7'} /><b>Nenhum lançamento financeiro</b><small>Cadastre cobranças para acompanhar pagamentos neste contrato.</small></div>}<footer>Exibindo {Math.min(8, lancamentosContrato.length)} de {lancamentosContrato.length} lançamentos <button type="button" onClick={abrirGestao}>Ver todos os lançamentos →</button></footer></article>
        </section>}
      </div>

      <aside className={styles.overviewSide}>
        <article className={`${styles.card} ${styles.statusCard}`}><header><h2>Status do contrato</h2><b><i /> {ESTADOS[contrato.estado]}⌄</b></header><div className={styles.timeline}>{ETAPAS.map((etapa, indice) => <span className={indice <= estadoEtapa ? styles.stepDone : ''} key={etapa}><i>{indice < estadoEtapa ? '✓' : ''}</i><b>{etapa}</b><small>{indice === 0 ? data(contrato.dataInicio) : indice === 1 ? data(contexto.entrada?.dataHora) : indice === 2 ? `até ${data(contrato.vencimentoAtual)}` : indice === 3 ? data(contexto.saida?.dataHora) : '—'}</small></span>)}</div><footer><span><small>Progresso do ciclo</small><i><em style={{ width: `${ciclo}%` }} /></i></span><b>{ciclo}%</b><span><small>Próximo marco</small><strong>{estadoEtapa < 2 ? 'Vigência' : estadoEtapa === 2 ? 'Vistoria de saída' : 'Encerramento'}</strong></span></footer></article>

        {aba === 'financeiro' ? <>
          <article className={`${styles.card} ${styles.dueCard}`}><header><h2>Próximos vencimentos</h2><button type="button" onClick={abrirGestao}>Ver calendário →</button></header>{proximoVencimento ? <div><time><b>{new Date(proximoVencimento.vencimento).getUTCDate()}</b><small>{new Date(proximoVencimento.vencimento).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '').toLocaleUpperCase('pt-BR')}</small></time><span><small>{proximoVencimento.descricao}</small><b>{moeda(proximoVencimento.valor)}</b></span><em>Pendente</em></div> : <p><Icon code={'\uE787'} /> Nenhum vencimento pendente registrado.</p>}<button type="button" onClick={abrirGestao}>Ver todos os vencimentos →</button></article>
          <article className={`${styles.card} ${styles.quickCard}`}><h2>Ações rápidas</h2>{[
            ['\uE8B0', 'Registrar pagamento', 'Liquidar um lançamento pendente', 'primary'], ['\uE8C7', 'Gerar boleto', 'Integração bancária ainda indisponível', 'success'],
            ['\uE715', 'Enviar lembrete', 'Use o portal do locatário', 'warning'], ['\uE8A5', 'Extrato financeiro', `${lancamentosContrato.length} lançamento(s) no contrato`, 'primary'],
          ].map(([icone, titulo, apoio, tom]) => <button type="button" onClick={abrirGestao} data-tone={tom} key={titulo}><span><Icon code={icone} /></span><b>{titulo}<small>{apoio}</small></b><em>›</em></button>)}</article>
          <article className={`${styles.card} ${styles.financeHelp}`}><span><Icon code={'\uE897'} /></span><p><b>Dúvidas sobre o financeiro?</b><small>Consulte a gestão avançada do contrato</small></p><button type="button" onClick={abrirGestao}>→</button></article>
        </> : <>
          <article className={`${styles.card} ${styles.financialCard}`}><header><h2>Resumo financeiro</h2><button type="button" onClick={() => setAba('financeiro')}>Ver detalhes →</button></header><div><span><small>Valor do aluguel</small><b>{moeda(contrato.valorAluguel)}</b></span><span><small>Encargos</small><b>—</b></span><span><small>Valor total</small><b>—</b></span><span><small>Dia do vencimento</small><b>Todo dia {contrato.diaVencimento}</b></span><span><small>Índice de reajuste</small><b>{INDICES[contrato.indiceReajuste]}</b></span><span><small>Próximo reajuste</small><b>{data(contrato.vencimentoAtual)}</b></span></div><p>Encargos e taxa de administração não são calculados pelo backend atual.</p></article>
          <article className={`${styles.card} ${styles.quickCard}`}><h2>Ações rápidas</h2>{[
            ['\uE8C7', 'Emitir boleto', 'Cobrança ainda não integrada', 'success'], ['\uE8B0', 'Registrar pagamento', 'Módulo de pagamentos pendente', 'primary'],
            ['\uE787', 'Agendar vistoria de saída', contexto.saida ? `Vistoria: ${data(contexto.saida.dataHora)}` : 'Agende a vistoria do imóvel', 'secondary'], ['\uE715', 'Enviar comunicado', 'Gerencie o portal das partes', 'warning'],
          ].map(([icone, titulo, apoio, tom]) => <button type="button" onClick={abrirGestao} data-tone={tom} key={titulo}><span><Icon code={icone} /></span><b>{titulo}<small>{apoio}</small></b><em>›</em></button>)}</article>
        </>}
      </aside>
    </div>
  </section>;
}
