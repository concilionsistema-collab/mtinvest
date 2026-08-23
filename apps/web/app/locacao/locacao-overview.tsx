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
};

const ESTADOS: Record<ContratoDeLocacao['estado'], string> = { RASCUNHO: 'Rascunho', EM_ASSINATURA: 'Em assinatura', AGUARDANDO_VISTORIA_ENTRADA: 'Aguardando vistoria', VIGENTE: 'Vigente', EM_ENCERRAMENTO: 'Em encerramento', EM_ENCERRAMENTO_ANTECIPADO: 'Encerramento antecipado', ENCERRADO: 'Encerrado' };
const INDICES = { IGPM: 'IGP-M', IPCA: 'IPCA', OUTRO: 'Outro' } as const;
const ETAPAS = ['Assinatura', 'Vistoria entrada', 'Vigente', 'Vistoria saída', 'Encerramento'];

function Icon({ code }: { code: string }) { return <span className={`fluent ${styles.icon}`} aria-hidden="true">{code}</span>; }
function moeda(valor: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor); }
function data(iso: string | null | undefined) { return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'; }
function codigo(contrato: ContratoDeLocacao) { return `CA-${new Date(contrato.criadoEm).getFullYear()}-${contrato.id.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase()}`; }
function abrirGestao() { const detalhe = document.getElementById('gestao-tecnica-locacao') as HTMLDetailsElement | null; if (detalhe) { detalhe.open = true; detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }

export function LocacaoOverview({ locacoes, administracoes, imoveis, pessoas, garantias, vistorias, reajustes, documentos }: Props) {
  const [contratoId, setContratoId] = useState(locacoes.find((l) => l.estado === 'VIGENTE')?.id ?? locacoes[0]?.id ?? '');
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

  return <section className={styles.overview}>
    <div className={styles.contractHero}>
      <div className={styles.contractIdentity}><span><Icon code={'\uE8A5'} /></span><div><small>CONTRATO DE LOCAÇÃO</small><h1>{codigo(contrato)} <em data-state={contrato.estado}>{ESTADOS[contrato.estado]}</em></h1><p>Início: <b>{data(contrato.dataInicio)}</b><i>•</i>Vencimento: <b>{data(contrato.vencimentoAtual)}</b>{diasRestantes > 0 && <small> (em {diasRestantes} dias)</small>}</p></div></div>
      <div className={styles.heroActions}><TopThemeSelector /><div><select aria-label="Selecionar contrato" value={contrato.id} onChange={(e) => setContratoId(e.target.value)}>{locacoes.map((item) => <option value={item.id} key={item.id}>{codigo(item)} · {ESTADOS[item.estado]}</option>)}</select><button type="button" onClick={abrirGestao}><Icon code={'\uE70F'} /> Editar contrato</button><button type="button" onClick={abrirGestao}>••• Mais ações⌄</button></div></div>
    </div>

    <nav className={styles.contractTabs} aria-label="Seções do contrato">{['Visão geral', 'Partes', 'Financeiro', 'Garantias', 'Documentos', 'Portais', 'Histórico', 'Observações'].map((item, indice) => <button type="button" className={indice === 0 ? styles.tabActive : ''} onClick={indice === 0 ? undefined : abrirGestao} key={item}>{indice === 4 && <Icon code={'\uE8A5'} />}{item}</button>)}</nav>

    <div className={styles.overviewGrid}>
      <div className={styles.overviewMain}>
        <article className={`${styles.card} ${styles.propertyCard}`}><h2>Imóvel locado</h2><div className={styles.propertyContent}><img src="/property-featured-hq.png" alt="Imagem de apresentação do imóvel locado" /><section><h3>{contexto.imovel?.enderecoResumo ?? 'Imóvel sem endereço cadastrado'} <Icon code={'\uE8A7'} /></h3><p>{finalidade} <i>•</i> {contexto.imovel?.estadoCompartilhamento.replaceAll('_', ' ').toLocaleLowerCase('pt-BR') ?? 'cadastro ativo'}</p><span><Icon code={'\uE707'} /> {contexto.imovel?.enderecoResumo ?? 'Endereço não informado'}</span><div className={styles.propertyTags}><b><Icon code={'\uE80F'} /> Imóvel cadastrado</b><b><Icon code={'\uE8C7'} /> {contexto.imovel?.valorAnunciado ? moeda(contexto.imovel.valorAnunciado) : 'Valor não informado'}</b><b><Icon code={'\uE81C'} /> {finalidade}</b></div><h4>Partes do contrato</h4><p>Proprietário: <strong>{contexto.proprietario?.nome ?? '—'}</strong><br />Locatário: <strong>{contexto.inquilino?.nome ?? '—'}</strong></p></section></div><footer><button type="button" onClick={abrirGestao}>Ver detalhes do imóvel →</button></footer></article>

        <article className={`${styles.card} ${styles.infoCard}`}><h2>Informações principais</h2><div className={styles.infoGrid}>
          <span><Icon code={'\uE8A5'} /><small>Tipo de contrato</small><b>Administração de locação</b></span><span><Icon code={'\uE787'} /><small>Início</small><b>{data(contrato.dataInicio)}</b></span><span><Icon code={'\uE8B0'} /><small>Garantia</small><b>{garantiaNome}</b></span><span><Icon code={'\uE8C7'} /><small>Competência de cobrança</small><b>Locatário</b></span>
          <span><Icon code={'\uE7EE'} /><small>Finalidade</small><b>{finalidade}</b></span><span><Icon code={'\uE787'} /><small>Vencimento</small><b>{data(contrato.vencimentoAtual)}</b></span><span><Icon code={'\uE8D7'} /><small>Reajustes aplicados</small><b>{contexto.listaReajustes.length}</b></span><span><Icon code={'\uE73E'} /><small>Documentos</small><b>{contexto.listaDocumentos.length} cadastrado(s)</b></span>
          <span><Icon code={'\uE916'} /><small>Prazo</small><b>{contrato.prazoMeses} meses</b></span><span><Icon code={'\uE7BA'} /><small>Renovação automática</small><b>Não — exige confirmação</b></span><span><Icon code={'\uE8D4'} /><small>Índice de reajuste</small><b>{INDICES[contrato.indiceReajuste]}</b></span><span><Icon code={'\uE9D2'} /><small>Dia do vencimento</small><b>Todo dia {contrato.diaVencimento}</b></span>
        </div></article>
      </div>

      <aside className={styles.overviewSide}>
        <article className={`${styles.card} ${styles.statusCard}`}><header><h2>Status do contrato</h2><b><i /> {ESTADOS[contrato.estado]}⌄</b></header><div className={styles.timeline}>{ETAPAS.map((etapa, indice) => <span className={indice <= estadoEtapa ? styles.stepDone : ''} key={etapa}><i>{indice < estadoEtapa ? '✓' : ''}</i><b>{etapa}</b><small>{indice === 0 ? data(contrato.dataInicio) : indice === 1 ? data(contexto.entrada?.dataHora) : indice === 2 ? `até ${data(contrato.vencimentoAtual)}` : indice === 3 ? data(contexto.saida?.dataHora) : '—'}</small></span>)}</div><footer><span><small>Progresso do ciclo</small><i><em style={{ width: `${ciclo}%` }} /></i></span><b>{ciclo}%</b><span><small>Próximo marco</small><strong>{estadoEtapa < 2 ? 'Vigência' : estadoEtapa === 2 ? 'Vistoria de saída' : 'Encerramento'}</strong></span></footer></article>

        <article className={`${styles.card} ${styles.financialCard}`}><header><h2>Resumo financeiro</h2><button type="button" onClick={abrirGestao}>Ver detalhes →</button></header><div><span><small>Valor do aluguel</small><b>{moeda(contrato.valorAluguel)}</b></span><span><small>Encargos</small><b>—</b></span><span><small>Valor total</small><b>—</b></span><span><small>Dia do vencimento</small><b>Todo dia {contrato.diaVencimento}</b></span><span><small>Índice de reajuste</small><b>{INDICES[contrato.indiceReajuste]}</b></span><span><small>Próximo reajuste</small><b>{data(contrato.vencimentoAtual)}</b></span></div><p>Encargos e taxa de administração não são calculados pelo backend atual.</p></article>

        <article className={`${styles.card} ${styles.quickCard}`}><h2>Ações rápidas</h2>{[
          ['\uE8C7', 'Emitir boleto', 'Cobrança ainda não integrada', 'success'], ['\uE8B0', 'Registrar pagamento', 'Módulo de pagamentos pendente', 'primary'],
          ['\uE787', 'Agendar vistoria de saída', contexto.saida ? `Vistoria: ${data(contexto.saida.dataHora)}` : 'Agende a vistoria do imóvel', 'secondary'], ['\uE715', 'Enviar comunicado', 'Gerencie o portal das partes', 'warning'],
        ].map(([icone, titulo, apoio, tom]) => <button type="button" onClick={abrirGestao} data-tone={tom} key={titulo}><span><Icon code={icone} /></span><b>{titulo}<small>{apoio}</small></b><em>›</em></button>)}</article>
      </aside>
    </div>
  </section>;
}
