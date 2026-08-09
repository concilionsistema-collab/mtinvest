'use client';

import { FormEvent, useEffect, useState } from 'react';
import type {
  AcessoPortalContrato,
  AplicarReajusteInput,
  ContestacaoDecisao,
  ContestacaoDeVistoria,
  ContratoDeAdministracao,
  ContratoDeLocacao,
  DocumentoDeContrato,
  DocumentoDeContratoTipo,
  EncerramentoAntecipado,
  Garantia,
  GarantiaTipo,
  GerarAcessoPortalResultado,
  Imovel,
  IndiceReajuste,
  Pessoa,
  Reajuste,
  Renovacao,
  Unidade,
  Vistoria,
} from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, ApiError } from '../../lib/api';
import { buttonStyle, buttonSecondaryStyle, cardStyle, inputStyle } from '../../lib/styles';

const ROTULOS_INDICE: Record<IndiceReajuste, string> = { IGPM: 'IGP-M', IPCA: 'IPCA', OUTRO: 'Outro' };
const INDICES: IndiceReajuste[] = ['IGPM', 'IPCA', 'OUTRO'];
const ROTULOS_TIPO_GARANTIA: Record<GarantiaTipo, string> = { FIADOR: 'Fiador', CAUCAO: 'Caução', SEGURO_FIANCA: 'Seguro-fiança' };
const TIPOS_GARANTIA: GarantiaTipo[] = ['FIADOR', 'CAUCAO', 'SEGURO_FIANCA'];
const ROTULOS_ESTADO_CONTRATO: Record<ContratoDeLocacao['estado'], string> = {
  RASCUNHO: 'Rascunho',
  EM_ASSINATURA: 'Em assinatura',
  AGUARDANDO_VISTORIA_ENTRADA: 'Aguardando vistoria de entrada',
  VIGENTE: 'Vigente',
  EM_ENCERRAMENTO: 'Em encerramento',
  EM_ENCERRAMENTO_ANTECIPADO: 'Em encerramento antecipado',
  ENCERRADO: 'Encerrado',
};
const ROTULOS_ESTADO_VISTORIA: Record<Vistoria['estado'], string> = {
  AGENDADA: 'Agendada',
  REALIZADA: 'Realizada',
  CONFIRMADA: 'Confirmada',
  EM_CONTESTACAO: 'Em contestação',
  RETIFICADA: 'Retificada',
};
const DECISOES_CONTESTACAO: ContestacaoDecisao[] = ['CONFIRMADA', 'RETIFICADA'];
const ROTULOS_DECISAO: Record<ContestacaoDecisao, string> = { CONFIRMADA: 'Manter laudo original', RETIFICADA: 'Retificar laudo' };
const TIPOS_DOCUMENTO: DocumentoDeContratoTipo[] = [
  'CONTRATO_ASSINADO',
  'LAUDO_VISTORIA',
  'COMPROVANTE_GARANTIA',
  'TERMO_RENOVACAO',
  'TERMO_RESCISAO',
  'OUTRO',
];
const ROTULOS_TIPO_DOCUMENTO: Record<DocumentoDeContratoTipo, string> = {
  CONTRATO_ASSINADO: 'Contrato assinado',
  LAUDO_VISTORIA: 'Laudo de vistoria',
  COMPROVANTE_GARANTIA: 'Comprovante de garantia',
  TERMO_RENOVACAO: 'Termo de renovação',
  TERMO_RESCISAO: 'Termo de rescisão',
  OUTRO: 'Outro',
};

export default function LocacaoPage() {
  const { sessao } = useAuth();

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [administracoes, setAdministracoes] = useState<ContratoDeAdministracao[]>([]);
  const [locacoes, setLocacoes] = useState<ContratoDeLocacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [unidadeId, setUnidadeId] = useState('');
  const [imovelId, setImovelId] = useState('');
  const [proprietarioPessoaId, setProprietarioPessoaId] = useState('');
  const [salvandoAdministracao, setSalvandoAdministracao] = useState(false);

  const [contratoDeAdministracaoId, setContratoDeAdministracaoId] = useState('');
  const [inquilinoPessoaId, setInquilinoPessoaId] = useState('');
  const [valorAluguel, setValorAluguel] = useState('');
  const [diaVencimento, setDiaVencimento] = useState('10');
  const [indiceReajuste, setIndiceReajuste] = useState<IndiceReajuste>('IGPM');
  const [aceitaReajusteNegativo, setAceitaReajusteNegativo] = useState(false);
  const [exigeGarantia, setExigeGarantia] = useState(true);
  const [dataInicio, setDataInicio] = useState('');
  const [prazoMeses, setPrazoMeses] = useState('30');
  const [salvandoLocacao, setSalvandoLocacao] = useState(false);

  const [garantiasPorContrato, setGarantiasPorContrato] = useState<Record<string, Garantia[]>>({});
  const [formGarantia, setFormGarantia] = useState<Record<string, { tipo: GarantiaTipo; fiadorPessoaId: string }>>({});
  const [salvandoGarantia, setSalvandoGarantia] = useState<string | null>(null);

  const [vistoriasPorContrato, setVistoriasPorContrato] = useState<Record<string, Vistoria[]>>({});
  const [dataVistoria, setDataVistoria] = useState<Record<string, string>>({});
  const [laudoVistoria, setLaudoVistoria] = useState<Record<string, string>>({});
  const [salvandoVistoria, setSalvandoVistoria] = useState<string | null>(null);
  const [salvandoTransicao, setSalvandoTransicao] = useState<string | null>(null);

  const [dataVistoriaSaida, setDataVistoriaSaida] = useState<Record<string, string>>({});
  const [contestacoesPorVistoria, setContestacoesPorVistoria] = useState<Record<string, ContestacaoDeVistoria[]>>({});
  const [formContestacao, setFormContestacao] = useState<Record<string, { motivo: string; evidencia: string }>>({});
  const [formDecisao, setFormDecisao] = useState<Record<string, { decisao: ContestacaoDecisao; justificativaDecisao: string }>>({});
  const [salvandoContestacao, setSalvandoContestacao] = useState<string | null>(null);

  const [reajustesPorContrato, setReajustesPorContrato] = useState<Record<string, Reajuste[]>>({});
  const [formReajuste, setFormReajuste] = useState<Record<string, { competencia: string; percentualIndice: string }>>({});
  const [salvandoReajuste, setSalvandoReajuste] = useState<string | null>(null);

  const [renovacoesPorContrato, setRenovacoesPorContrato] = useState<Record<string, Renovacao[]>>({});
  const [prazoAdicionalMeses, setPrazoAdicionalMeses] = useState<Record<string, string>>({});
  const [salvandoRenovacao, setSalvandoRenovacao] = useState<string | null>(null);

  const [documentosPorContrato, setDocumentosPorContrato] = useState<Record<string, DocumentoDeContrato[]>>({});
  const [formDocumento, setFormDocumento] = useState<Record<string, { tipo: DocumentoDeContratoTipo; descricao: string; referencia: string }>>({});
  const [salvandoDocumento, setSalvandoDocumento] = useState<string | null>(null);

  const [acessosPorContrato, setAcessosPorContrato] = useState<Record<string, AcessoPortalContrato[]>>({});
  const [pessoaAcessoPortal, setPessoaAcessoPortal] = useState<Record<string, string>>({});
  const [salvandoAcesso, setSalvandoAcesso] = useState<string | null>(null);
  const [tokenGerado, setTokenGerado] = useState<Record<string, string>>({});

  const [encerramentosPorContrato, setEncerramentosPorContrato] = useState<Record<string, EncerramentoAntecipado[]>>({});
  const [formEncerramento, setFormEncerramento] = useState<Record<string, { isento: boolean; motivoIsencao: string }>>({});
  const [salvandoEncerramento, setSalvandoEncerramento] = useState<string | null>(null);

  async function carregar() {
    try {
      const [listaUnidades, listaImoveis, listaPessoas, listaAdministracoes, listaLocacoes] = await Promise.all([
        apiFetch<Unidade[]>('/unidades'),
        apiFetch<Imovel[]>('/imoveis'),
        apiFetch<Pessoa[]>('/pessoas'),
        apiFetch<ContratoDeAdministracao[]>('/locacao/administracao-contratos'),
        apiFetch<ContratoDeLocacao[]>('/locacao/contratos'),
      ]);
      setUnidades(listaUnidades);
      setImoveis(listaImoveis);
      setPessoas(listaPessoas);
      setAdministracoes(listaAdministracoes);
      setLocacoes(listaLocacoes);

      const [listasGarantias, listasVistorias] = await Promise.all([
        Promise.all(listaLocacoes.map((l) => apiFetch<Garantia[]>(`/locacao/contratos/${l.id}/garantias`))),
        Promise.all(listaLocacoes.map((l) => apiFetch<Vistoria[]>(`/locacao/vistorias?contratoDeLocacaoId=${l.id}`))),
      ]);
      const mapaGarantias: Record<string, Garantia[]> = {};
      const mapaVistorias: Record<string, Vistoria[]> = {};
      listaLocacoes.forEach((l, i) => {
        mapaGarantias[l.id] = listasGarantias[i];
        mapaVistorias[l.id] = listasVistorias[i];
      });
      setGarantiasPorContrato(mapaGarantias);
      setVistoriasPorContrato(mapaVistorias);

      // US-107: contestação só existe para vistoria de SAIDA já com laudo registrado.
      const vistoriasSaidaComLaudo = listasVistorias.flat().filter((v) => v.tipo === 'SAIDA' && v.estado !== 'AGENDADA');
      const listasContestacoes = await Promise.all(
        vistoriasSaidaComLaudo.map((v) => apiFetch<ContestacaoDeVistoria[]>(`/locacao/vistorias/${v.id}/contestacao`)),
      );
      const mapaContestacoes: Record<string, ContestacaoDeVistoria[]> = {};
      vistoriasSaidaComLaudo.forEach((v, i) => {
        mapaContestacoes[v.id] = listasContestacoes[i];
      });
      setContestacoesPorVistoria(mapaContestacoes);

      const listasReajustes = await Promise.all(
        listaLocacoes.map((l) => apiFetch<Reajuste[]>(`/locacao/contratos/${l.id}/reajustes`)),
      );
      const mapaReajustes: Record<string, Reajuste[]> = {};
      listaLocacoes.forEach((l, i) => {
        mapaReajustes[l.id] = listasReajustes[i];
      });
      setReajustesPorContrato(mapaReajustes);

      const listasRenovacoes = await Promise.all(
        listaLocacoes.map((l) => apiFetch<Renovacao[]>(`/locacao/contratos/${l.id}/renovacoes`)),
      );
      const mapaRenovacoes: Record<string, Renovacao[]> = {};
      listaLocacoes.forEach((l, i) => {
        mapaRenovacoes[l.id] = listasRenovacoes[i];
      });
      setRenovacoesPorContrato(mapaRenovacoes);

      const listasDocumentos = await Promise.all(
        listaLocacoes.map((l) => apiFetch<DocumentoDeContrato[]>(`/locacao/contratos/${l.id}/documentos`)),
      );
      const mapaDocumentos: Record<string, DocumentoDeContrato[]> = {};
      listaLocacoes.forEach((l, i) => {
        mapaDocumentos[l.id] = listasDocumentos[i];
      });
      setDocumentosPorContrato(mapaDocumentos);

      // Listar acessos e restrito a GESTOR_UNIDADE (mesmo criterio de gerar/
      // revogar) - CORRETOR recebe 403 aqui, tratado como "sem acessos
      // visiveis" em vez de quebrar a pagina inteira.
      try {
        const listasAcessos = await Promise.all(
          listaLocacoes.map((l) => apiFetch<AcessoPortalContrato[]>(`/locacao/contratos/${l.id}/portal/acessos`)),
        );
        const mapaAcessos: Record<string, AcessoPortalContrato[]> = {};
        listaLocacoes.forEach((l, i) => {
          mapaAcessos[l.id] = listasAcessos[i];
        });
        setAcessosPorContrato(mapaAcessos);
      } catch {
        setAcessosPorContrato({});
      }

      const listasEncerramentos = await Promise.all(
        listaLocacoes.map((l) => apiFetch<EncerramentoAntecipado[]>(`/locacao/contratos/${l.id}/encerramento-antecipado`)),
      );
      const mapaEncerramentos: Record<string, EncerramentoAntecipado[]> = {};
      listaLocacoes.forEach((l, i) => {
        mapaEncerramentos[l.id] = listasEncerramentos[i];
      });
      setEncerramentosPorContrato(mapaEncerramentos);

      setCarregado(true);
    } catch {
      setErro('Falha ao carregar dados de locação.');
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  async function criarAdministracao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoAdministracao(true);
    try {
      await apiFetch('/locacao/administracao-contratos', {
        method: 'POST',
        body: JSON.stringify({ unidadeId, imovelId, proprietarioPessoaId }),
      });
      setUnidadeId('');
      setImovelId('');
      setProprietarioPessoaId('');
      await carregar();
    } catch {
      setErro('Falha ao criar contrato de administração.');
    } finally {
      setSalvandoAdministracao(false);
    }
  }

  async function criarLocacao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvandoLocacao(true);
    try {
      await apiFetch('/locacao/contratos', {
        method: 'POST',
        body: JSON.stringify({
          contratoDeAdministracaoId,
          inquilinoPessoaId,
          valorAluguel: Number(valorAluguel),
          diaVencimento: Number(diaVencimento),
          indiceReajuste,
          aceitaReajusteNegativo,
          exigeGarantia,
          dataInicio,
          prazoMeses: Number(prazoMeses),
        }),
      });
      setContratoDeAdministracaoId('');
      setInquilinoPessoaId('');
      setValorAluguel('');
      setDataInicio('');
      await carregar();
    } catch {
      setErro('Falha ao criar contrato de locação.');
    } finally {
      setSalvandoLocacao(false);
    }
  }

  function garantiaFormDe(locacaoId: string) {
    return formGarantia[locacaoId] ?? { tipo: 'CAUCAO' as GarantiaTipo, fiadorPessoaId: '' };
  }

  function atualizarFormGarantia(locacaoId: string, patch: Partial<{ tipo: GarantiaTipo; fiadorPessoaId: string }>) {
    setFormGarantia((atual) => ({ ...atual, [locacaoId]: { ...garantiaFormDe(locacaoId), ...patch } }));
  }

  async function enviarGarantia(locacaoId: string, temAtiva: boolean) {
    const form = garantiaFormDe(locacaoId);
    setSalvandoGarantia(locacaoId);
    try {
      const path = temAtiva ? `/locacao/contratos/${locacaoId}/garantias/troca` : `/locacao/contratos/${locacaoId}/garantias`;
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({
          tipo: form.tipo,
          ...(form.tipo === 'FIADOR' ? { fiadorPessoaId: form.fiadorPessoaId } : {}),
        }),
      });
      setFormGarantia((atual) => ({ ...atual, [locacaoId]: { tipo: 'CAUCAO', fiadorPessoaId: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao registrar/trocar garantia.');
    } finally {
      setSalvandoGarantia(null);
    }
  }

  async function ativarGarantia(garantiaId: string) {
    setSalvandoGarantia(garantiaId);
    try {
      await apiFetch(`/locacao/garantias/${garantiaId}/ativar`, { method: 'POST' });
      await carregar();
    } catch {
      setErro('Falha ao ativar garantia.');
    } finally {
      setSalvandoGarantia(null);
    }
  }

  async function avancarAssinatura(locacaoId: string) {
    setSalvandoTransicao(locacaoId);
    try {
      await apiFetch(`/locacao/contratos/${locacaoId}/avancar-assinatura`, { method: 'POST' });
      await carregar();
    } catch {
      setErro('Falha ao avançar para assinatura.');
    } finally {
      setSalvandoTransicao(null);
    }
  }

  async function confirmarAssinatura(locacaoId: string) {
    setSalvandoTransicao(locacaoId);
    try {
      await apiFetch(`/locacao/contratos/${locacaoId}/confirmar-assinatura`, { method: 'POST' });
      await carregar();
    } catch {
      setErro('Falha ao confirmar assinatura.');
    } finally {
      setSalvandoTransicao(null);
    }
  }

  async function agendarVistoriaEntrada(locacaoId: string) {
    const dataHora = dataVistoria[locacaoId];
    if (!dataHora) return;
    setSalvandoVistoria(locacaoId);
    try {
      await apiFetch('/locacao/vistorias', {
        method: 'POST',
        body: JSON.stringify({ contratoDeLocacaoId: locacaoId, tipo: 'ENTRADA', dataHora }),
      });
      setDataVistoria((atual) => ({ ...atual, [locacaoId]: '' }));
      await carregar();
    } catch {
      setErro('Falha ao agendar vistoria de entrada.');
    } finally {
      setSalvandoVistoria(null);
    }
  }

  async function registrarLaudo(vistoriaId: string) {
    const laudo = laudoVistoria[vistoriaId];
    if (!laudo) return;
    setSalvandoVistoria(vistoriaId);
    try {
      await apiFetch(`/locacao/vistorias/${vistoriaId}/laudo`, { method: 'POST', body: JSON.stringify({ laudo }) });
      setLaudoVistoria((atual) => ({ ...atual, [vistoriaId]: '' }));
      await carregar();
    } catch {
      setErro('Falha ao registrar laudo de vistoria (só Gestor de unidade pode registrar, ART-010 §13).');
    } finally {
      setSalvandoVistoria(null);
    }
  }

  async function agendarVistoriaSaida(locacaoId: string) {
    const dataHora = dataVistoriaSaida[locacaoId];
    if (!dataHora) return;
    setSalvandoVistoria(locacaoId);
    try {
      await apiFetch('/locacao/vistorias', {
        method: 'POST',
        body: JSON.stringify({ contratoDeLocacaoId: locacaoId, tipo: 'SAIDA', dataHora }),
      });
      setDataVistoriaSaida((atual) => ({ ...atual, [locacaoId]: '' }));
      await carregar();
    } catch {
      setErro('Falha ao agendar vistoria de saída (o contrato precisa estar Vigente ou em encerramento).');
    } finally {
      setSalvandoVistoria(null);
    }
  }

  function contestacaoFormDe(vistoriaId: string) {
    return formContestacao[vistoriaId] ?? { motivo: '', evidencia: '' };
  }

  async function enviarContestacao(vistoriaId: string) {
    const form = contestacaoFormDe(vistoriaId);
    if (!form.motivo || !form.evidencia) return;
    setSalvandoContestacao(vistoriaId);
    try {
      await apiFetch(`/locacao/vistorias/${vistoriaId}/contestacao`, {
        method: 'POST',
        body: JSON.stringify({ motivo: form.motivo, evidencia: form.evidencia }),
      });
      setFormContestacao((atual) => ({ ...atual, [vistoriaId]: { motivo: '', evidencia: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao registrar contestação (verifique se ainda está dentro do prazo, DEC-NEG-016).');
    } finally {
      setSalvandoContestacao(null);
    }
  }

  function decisaoFormDe(vistoriaId: string) {
    return formDecisao[vistoriaId] ?? { decisao: 'CONFIRMADA' as ContestacaoDecisao, justificativaDecisao: '' };
  }

  async function enviarDecisao(vistoriaId: string) {
    const form = decisaoFormDe(vistoriaId);
    if (!form.justificativaDecisao) return;
    setSalvandoContestacao(vistoriaId);
    try {
      await apiFetch(`/locacao/vistorias/${vistoriaId}/contestacao/decisao`, {
        method: 'POST',
        body: JSON.stringify({ decisao: form.decisao, justificativaDecisao: form.justificativaDecisao }),
      });
      setFormDecisao((atual) => ({ ...atual, [vistoriaId]: { decisao: 'CONFIRMADA', justificativaDecisao: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao decidir contestação (só Gestor de unidade decide, e nunca quem fez o laudo original — RN-405).');
    } finally {
      setSalvandoContestacao(null);
    }
  }

  function reajusteFormDe(locacaoId: string) {
    return formReajuste[locacaoId] ?? { competencia: '', percentualIndice: '' };
  }

  async function aplicarReajuste(locacaoId: string) {
    const form = reajusteFormDe(locacaoId);
    if (!form.competencia || !form.percentualIndice) return;
    setSalvandoReajuste(locacaoId);
    try {
      const input: AplicarReajusteInput = { competencia: form.competencia, percentualIndice: Number(form.percentualIndice) };
      await apiFetch(`/locacao/contratos/${locacaoId}/reajustes`, { method: 'POST', body: JSON.stringify(input) });
      setFormReajuste((atual) => ({ ...atual, [locacaoId]: { competencia: '', percentualIndice: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao aplicar reajuste (só Gestor de unidade, contrato precisa estar Vigente, competência não pode repetir).');
    } finally {
      setSalvandoReajuste(null);
    }
  }

  async function confirmarRenovacao(locacaoId: string) {
    const meses = prazoAdicionalMeses[locacaoId];
    if (!meses) return;
    setSalvandoRenovacao(locacaoId);
    try {
      await apiFetch(`/locacao/contratos/${locacaoId}/renovacao`, {
        method: 'POST',
        body: JSON.stringify({ prazoAdicionalMeses: Number(meses) }),
      });
      setPrazoAdicionalMeses((atual) => ({ ...atual, [locacaoId]: '' }));
      await carregar();
    } catch {
      setErro('Falha ao confirmar renovação (só Gestor de unidade, contrato precisa estar Vigente).');
    } finally {
      setSalvandoRenovacao(null);
    }
  }

  function documentoFormDe(locacaoId: string) {
    return formDocumento[locacaoId] ?? { tipo: 'CONTRATO_ASSINADO' as DocumentoDeContratoTipo, descricao: '', referencia: '' };
  }

  async function anexarDocumento(locacaoId: string) {
    const form = documentoFormDe(locacaoId);
    if (!form.descricao || !form.referencia) return;
    setSalvandoDocumento(locacaoId);
    try {
      await apiFetch(`/locacao/contratos/${locacaoId}/documentos`, { method: 'POST', body: JSON.stringify(form) });
      setFormDocumento((atual) => ({ ...atual, [locacaoId]: { tipo: 'CONTRATO_ASSINADO', descricao: '', referencia: '' } }));
      await carregar();
    } catch {
      setErro('Falha ao anexar documento.');
    } finally {
      setSalvandoDocumento(null);
    }
  }

  async function gerarAcessoPortal(locacaoId: string) {
    const pessoaId = pessoaAcessoPortal[locacaoId];
    if (!pessoaId) return;
    setSalvandoAcesso(locacaoId);
    try {
      const resultado = await apiFetch<GerarAcessoPortalResultado>(`/locacao/contratos/${locacaoId}/portal/acessos`, {
        method: 'POST',
        body: JSON.stringify({ pessoaId }),
      });
      setPessoaAcessoPortal((atual) => ({ ...atual, [locacaoId]: '' }));
      setTokenGerado((atual) => ({ ...atual, [locacaoId]: resultado.token }));
      await carregar();
    } catch {
      setErro('Falha ao gerar acesso ao portal (a pessoa precisa ser o proprietário ou o inquilino deste contrato, RN-413).');
    } finally {
      setSalvandoAcesso(null);
    }
  }

  async function revogarAcessoPortal(acessoId: string, locacaoId: string) {
    setSalvandoAcesso(acessoId);
    try {
      await apiFetch(`/locacao/contratos/portal/acessos/${acessoId}/revogar`, { method: 'POST' });
      setTokenGerado((atual) => ({ ...atual, [locacaoId]: '' }));
      await carregar();
    } catch {
      setErro('Falha ao revogar acesso ao portal.');
    } finally {
      setSalvandoAcesso(null);
    }
  }

  function encerramentoFormDe(locacaoId: string) {
    return formEncerramento[locacaoId] ?? { isento: false, motivoIsencao: '' };
  }

  async function solicitarEncerramentoAntecipado(locacaoId: string) {
    const form = encerramentoFormDe(locacaoId);
    setSalvandoEncerramento(locacaoId);
    try {
      await apiFetch(`/locacao/contratos/${locacaoId}/encerramento-antecipado`, {
        method: 'POST',
        body: JSON.stringify(form.isento ? { isento: true, motivoIsencao: form.motivoIsencao } : {}),
      });
      setFormEncerramento((atual) => ({ ...atual, [locacaoId]: { isento: false, motivoIsencao: '' } }));
      await carregar();
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 403
          ? 'Encerramento antecipado com multa está bloqueado para uso em produção real até validação jurídica formal (ART-010 §21) — precisa de LOCACAO_MULTA_RESCISORIA_HABILITADA=true no servidor.'
          : 'Falha ao solicitar encerramento antecipado.',
      );
    } finally {
      setSalvandoEncerramento(null);
    }
  }

  if (!sessao) return null;
  if (erro) return <main><h1>Locação</h1><p>{erro}</p></main>;
  if (!carregado) return <main><h1>Locação</h1><p>Carregando...</p></main>;

  function enderecoDoImovel(imovelId: string) {
    return imoveis.find((i) => i.id === imovelId)?.enderecoResumo ?? '—';
  }

  function nomeDaPessoa(pessoaId: string) {
    return pessoas.find((p) => p.id === pessoaId)?.nome ?? '—';
  }

  return (
    <main>
      <h1>Locação</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Fase 2 (ART-010/ART-015) — contrato de administração, contrato de locação, garantias
        (registrar/ativar/trocar), o ciclo até Vigente (assinatura + vistoria de entrada), vistoria
        de saída com contestação, reajuste por competência, renovação com confirmação humana,
        documentos do contrato e portal do proprietário/inquilino (link com token, somente
        leitura). Sem renovação confirmada até o vencimento, o contrato entra em encerramento
        automaticamente. Encerramento antecipado com multa existe como exercício técnico, mas fica
        bloqueado por padrão até validação jurídica formal (ver aviso na seção).
      </p>

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Contratos de administração</h2>
      <form onSubmit={criarAdministracao} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <select aria-label="Unidade" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} required style={inputStyle}>
          <option value="">Unidade...</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nomeFantasia}</option>)}
        </select>
        <select aria-label="Imóvel" value={imovelId} onChange={(e) => setImovelId(e.target.value)} required style={inputStyle}>
          <option value="">Imóvel...</option>
          {imoveis.map((i) => <option key={i.id} value={i.id}>{i.enderecoResumo}</option>)}
        </select>
        <select aria-label="Proprietário" value={proprietarioPessoaId} onChange={(e) => setProprietarioPessoaId(e.target.value)} required style={inputStyle}>
          <option value="">Proprietário...</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <button style={buttonStyle} disabled={salvandoAdministracao}>{salvandoAdministracao ? 'Salvando...' : 'Cadastrar administração'}</button>
      </form>
      {administracoes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum contrato de administração ainda.</p>}
      {administracoes.map((a) => (
        <div style={cardStyle} key={a.id}>
          <b>{enderecoDoImovel(a.imovelId)}</b>
          <small style={{ display: 'block', color: 'var(--muted)' }}>
            Proprietário: {nomeDaPessoa(a.proprietarioPessoaId)} · {a.status}
          </small>
        </div>
      ))}

      <h2 style={{ fontSize: 14, marginTop: 24 }}>Contratos de locação</h2>
      <form onSubmit={criarLocacao} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0', maxWidth: 760 }}>
        <select aria-label="Contrato de administração" value={contratoDeAdministracaoId} onChange={(e) => setContratoDeAdministracaoId(e.target.value)} required style={inputStyle}>
          <option value="">Contrato de administração...</option>
          {administracoes.map((a) => <option key={a.id} value={a.id}>{enderecoDoImovel(a.imovelId)}</option>)}
        </select>
        <select aria-label="Inquilino" value={inquilinoPessoaId} onChange={(e) => setInquilinoPessoaId(e.target.value)} required style={inputStyle}>
          <option value="">Inquilino...</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input aria-label="Valor do aluguel" type="number" min="0" step="0.01" value={valorAluguel} onChange={(e) => setValorAluguel(e.target.value)} required style={{ ...inputStyle, width: 140 }} placeholder="Valor do aluguel" />
        <input aria-label="Dia de vencimento" type="number" min="1" max="31" value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} required style={{ ...inputStyle, width: 100 }} placeholder="Dia vencimento" />
        <select aria-label="Índice de reajuste" value={indiceReajuste} onChange={(e) => setIndiceReajuste(e.target.value as IndiceReajuste)} style={inputStyle}>
          {INDICES.map((i) => <option key={i} value={i}>{ROTULOS_INDICE[i]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={aceitaReajusteNegativo} onChange={(e) => setAceitaReajusteNegativo(e.target.checked)} />
          Aceita reajuste negativo
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={exigeGarantia} onChange={(e) => setExigeGarantia(e.target.checked)} />
          Exige garantia (RN-402)
        </label>
        <input aria-label="Data de início" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required style={inputStyle} />
        <input aria-label="Prazo em meses" type="number" min="1" value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)} required style={{ ...inputStyle, width: 100 }} placeholder="Prazo (meses)" />
        <button style={buttonStyle} disabled={salvandoLocacao}>{salvandoLocacao ? 'Salvando...' : 'Cadastrar locação'}</button>
      </form>
      {locacoes.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum contrato de locação ainda.</p>}
      {locacoes.map((l) => {
        const administracao = administracoes.find((a) => a.id === l.contratoDeAdministracaoId);
        const garantias = garantiasPorContrato[l.id] ?? [];
        const garantiaAtiva = garantias.find((g) => g.estado === 'ATIVA');
        const form = garantiaFormDe(l.id);
        const vistorias = vistoriasPorContrato[l.id] ?? [];
        const vistoriaEntradaAgendada = vistorias.find((v) => v.tipo === 'ENTRADA' && v.estado === 'AGENDADA');
        const temVistoriaEntrada = vistorias.some((v) => v.tipo === 'ENTRADA');
        const vistoriasSaida = vistorias.filter((v) => v.tipo === 'SAIDA');
        const vistoriaSaidaAgendada = vistoriasSaida.find((v) => v.estado === 'AGENDADA');
        const temVistoriaSaida = vistoriasSaida.length > 0;
        const podeAgendarSaida = ['VIGENTE', 'EM_ENCERRAMENTO', 'EM_ENCERRAMENTO_ANTECIPADO'].includes(l.estado);
        const reajustes = reajustesPorContrato[l.id] ?? [];
        const formR = reajusteFormDe(l.id);
        const renovacoes = renovacoesPorContrato[l.id] ?? [];
        const documentos = documentosPorContrato[l.id] ?? [];
        const formDoc = documentoFormDe(l.id);
        const acessos = acessosPorContrato[l.id] ?? [];
        const acessosAtivos = acessos.filter((a) => !a.revogadoEm);
        const encerramentos = encerramentosPorContrato[l.id] ?? [];
        const formEnc = encerramentoFormDe(l.id);

        return (
          <div style={cardStyle} key={l.id}>
            <b>{administracao ? enderecoDoImovel(administracao.imovelId) : '—'}</b>
            <small style={{ display: 'block', color: 'var(--muted)' }}>
              Inquilino: {nomeDaPessoa(l.inquilinoPessoaId)} · R$ {l.valorAluguel.toLocaleString('pt-BR')}/mês ·{' '}
              {ROTULOS_ESTADO_CONTRATO[l.estado]} · índice {ROTULOS_INDICE[l.indiceReajuste]}
              {l.exigeGarantia ? ' · exige garantia' : ''}
              {l.estado === 'VIGENTE' ? ` · vencimento atual ${new Date(l.vencimentoAtual).toLocaleDateString('pt-BR')}` : ''}
            </small>

            {l.estado === 'RASCUNHO' && (
              <button style={buttonSecondaryStyle} disabled={salvandoTransicao === l.id} onClick={() => avancarAssinatura(l.id)}>
                {salvandoTransicao === l.id ? 'Salvando...' : 'Avançar para assinatura'}
              </button>
            )}
            {l.estado === 'EM_ASSINATURA' && (
              <button style={buttonSecondaryStyle} disabled={salvandoTransicao === l.id} onClick={() => confirmarAssinatura(l.id)}>
                {salvandoTransicao === l.id ? 'Salvando...' : 'Confirmar assinatura'}
              </button>
            )}

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Garantias:</small>
              {garantias.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhuma registrada.</small>}
              {garantias.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0' }}>
                  <span>{ROTULOS_TIPO_GARANTIA[g.tipo]} · {g.estado}{g.fiadorPessoaId ? ` · ${nomeDaPessoa(g.fiadorPessoaId)}` : ''}</span>
                  {g.estado === 'EM_ANALISE' && (
                    <button style={buttonSecondaryStyle} disabled={salvandoGarantia === g.id} onClick={() => ativarGarantia(g.id)}>
                      {salvandoGarantia === g.id ? 'Ativando...' : 'Ativar'}
                    </button>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <select aria-label="Tipo de garantia" value={form.tipo} onChange={(e) => atualizarFormGarantia(l.id, { tipo: e.target.value as GarantiaTipo })} style={{ ...inputStyle, width: 140 }}>
                  {TIPOS_GARANTIA.map((t) => <option key={t} value={t}>{ROTULOS_TIPO_GARANTIA[t]}</option>)}
                </select>
                {form.tipo === 'FIADOR' && (
                  <select aria-label="Fiador" value={form.fiadorPessoaId} onChange={(e) => atualizarFormGarantia(l.id, { fiadorPessoaId: e.target.value })} style={{ ...inputStyle, width: 160 }}>
                    <option value="">Fiador...</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                )}
                <button
                  style={buttonSecondaryStyle}
                  disabled={salvandoGarantia === l.id || (form.tipo === 'FIADOR' && !form.fiadorPessoaId)}
                  onClick={() => enviarGarantia(l.id, Boolean(garantiaAtiva))}
                >
                  {salvandoGarantia === l.id ? 'Salvando...' : garantiaAtiva ? 'Trocar garantia' : 'Registrar garantia'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Vistoria de entrada (RN-404):</small>
              {vistorias.filter((v) => v.tipo === 'ENTRADA').map((v) => (
                <div key={v.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  <span>{new Date(v.dataHora).toLocaleString('pt-BR')} · {v.estado}{v.laudo ? ` · "${v.laudo}"` : ''}</span>
                  {v.estado === 'AGENDADA' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <input
                        aria-label="Laudo da vistoria"
                        value={laudoVistoria[v.id] ?? ''}
                        onChange={(e) => setLaudoVistoria((atual) => ({ ...atual, [v.id]: e.target.value }))}
                        style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                        placeholder="Laudo (ex.: imóvel em bom estado)"
                      />
                      <button
                        style={buttonSecondaryStyle}
                        disabled={salvandoVistoria === v.id || !laudoVistoria[v.id]}
                        onClick={() => registrarLaudo(v.id)}
                      >
                        {salvandoVistoria === v.id ? 'Salvando...' : 'Registrar laudo'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!temVistoriaEntrada && l.estado === 'AGUARDANDO_VISTORIA_ENTRADA' && !vistoriaEntradaAgendada && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input
                    aria-label="Data e hora da vistoria"
                    type="datetime-local"
                    value={dataVistoria[l.id] ?? ''}
                    onChange={(e) => setDataVistoria((atual) => ({ ...atual, [l.id]: e.target.value }))}
                    style={inputStyle}
                  />
                  <button style={buttonSecondaryStyle} disabled={salvandoVistoria === l.id || !dataVistoria[l.id]} onClick={() => agendarVistoriaEntrada(l.id)}>
                    {salvandoVistoria === l.id ? 'Salvando...' : 'Agendar vistoria de entrada'}
                  </button>
                </div>
              )}
              {!temVistoriaEntrada && l.estado !== 'AGUARDANDO_VISTORIA_ENTRADA' && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Disponível quando o contrato estiver "Aguardando vistoria de entrada".
                </small>
              )}
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Vistoria de saída e contestação (RN-405):</small>
              {vistoriasSaida.map((v) => {
                const contestacoes = contestacoesPorVistoria[v.id] ?? [];
                const contestacaoPendente = contestacoes.find((c) => c.decisao === null);
                const formC = contestacaoFormDe(v.id);
                const formD = decisaoFormDe(v.id);
                return (
                  <div key={v.id} style={{ fontSize: 12, margin: '4px 0' }}>
                    <span>
                      {new Date(v.dataHora).toLocaleString('pt-BR')} · {ROTULOS_ESTADO_VISTORIA[v.estado]}
                      {v.laudo ? ` · "${v.laudo}"` : ''}
                      {v.prazoContestacaoAte ? ` · prazo de contestação até ${new Date(v.prazoContestacaoAte).toLocaleDateString('pt-BR')}` : ''}
                    </span>

                    {v.estado === 'AGENDADA' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <input
                          aria-label="Laudo da vistoria de saída"
                          value={laudoVistoria[v.id] ?? ''}
                          onChange={(e) => setLaudoVistoria((atual) => ({ ...atual, [v.id]: e.target.value }))}
                          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                          placeholder="Laudo (ex.: dano na parede da sala)"
                        />
                        <button
                          style={buttonSecondaryStyle}
                          disabled={salvandoVistoria === v.id || !laudoVistoria[v.id]}
                          onClick={() => registrarLaudo(v.id)}
                        >
                          {salvandoVistoria === v.id ? 'Salvando...' : 'Registrar laudo'}
                        </button>
                      </div>
                    )}

                    {v.estado === 'REALIZADA' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <input
                          aria-label="Motivo da contestação"
                          value={formC.motivo}
                          onChange={(e) => setFormContestacao((atual) => ({ ...atual, [v.id]: { ...formC, motivo: e.target.value } }))}
                          style={{ ...inputStyle, minWidth: 140 }}
                          placeholder="Motivo da contestação"
                        />
                        <input
                          aria-label="Evidência da contestação"
                          value={formC.evidencia}
                          onChange={(e) => setFormContestacao((atual) => ({ ...atual, [v.id]: { ...formC, evidencia: e.target.value } }))}
                          style={{ ...inputStyle, minWidth: 140 }}
                          placeholder="Evidência (foto/vídeo, URL ou descrição)"
                        />
                        <button
                          style={buttonSecondaryStyle}
                          disabled={salvandoContestacao === v.id || !formC.motivo || !formC.evidencia}
                          onClick={() => enviarContestacao(v.id)}
                        >
                          {salvandoContestacao === v.id ? 'Salvando...' : 'Contestar'}
                        </button>
                      </div>
                    )}

                    {v.estado === 'EM_CONTESTACAO' && contestacaoPendente && (
                      <div style={{ marginTop: 4 }}>
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          Contestado: "{contestacaoPendente.motivo}" (evidência: {contestacaoPendente.evidencia})
                        </small>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <select
                            aria-label="Decisão da contestação"
                            value={formD.decisao}
                            onChange={(e) => setFormDecisao((atual) => ({ ...atual, [v.id]: { ...formD, decisao: e.target.value as ContestacaoDecisao } }))}
                            style={inputStyle}
                          >
                            {DECISOES_CONTESTACAO.map((d) => <option key={d} value={d}>{ROTULOS_DECISAO[d]}</option>)}
                          </select>
                          <input
                            aria-label="Justificativa da decisão"
                            value={formD.justificativaDecisao}
                            onChange={(e) => setFormDecisao((atual) => ({ ...atual, [v.id]: { ...formD, justificativaDecisao: e.target.value } }))}
                            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                            placeholder="Justificativa da decisão (analista distinto do autor do laudo)"
                          />
                          <button
                            style={buttonSecondaryStyle}
                            disabled={salvandoContestacao === v.id || !formD.justificativaDecisao}
                            onClick={() => enviarDecisao(v.id)}
                          >
                            {salvandoContestacao === v.id ? 'Salvando...' : 'Decidir'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!temVistoriaSaida && podeAgendarSaida && !vistoriaSaidaAgendada && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input
                    aria-label="Data e hora da vistoria de saída"
                    type="datetime-local"
                    value={dataVistoriaSaida[l.id] ?? ''}
                    onChange={(e) => setDataVistoriaSaida((atual) => ({ ...atual, [l.id]: e.target.value }))}
                    style={inputStyle}
                  />
                  <button style={buttonSecondaryStyle} disabled={salvandoVistoria === l.id || !dataVistoriaSaida[l.id]} onClick={() => agendarVistoriaSaida(l.id)}>
                    {salvandoVistoria === l.id ? 'Salvando...' : 'Agendar vistoria de saída'}
                  </button>
                </div>
              )}
              {!temVistoriaSaida && !podeAgendarSaida && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Disponível quando o contrato estiver Vigente ou em encerramento.
                </small>
              )}
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Reajuste por competência (RN-406/RN-407):</small>
              {reajustes.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhum reajuste aplicado ainda.</small>}
              {reajustes.map((r) => (
                <div key={r.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  <span>
                    {r.competencia} ({ROTULOS_INDICE[r.indice]} {r.percentualIndice}%
                    {r.percentualAplicado !== r.percentualIndice ? `, piso zero aplicado (RN-407)` : ''}) · R${' '}
                    {r.valorAluguelAnterior.toLocaleString('pt-BR')} → R$ {r.valorAluguelNovo.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
              {l.estado === 'VIGENTE' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input
                    aria-label="Competência do reajuste"
                    type="month"
                    value={formR.competencia}
                    onChange={(e) => setFormReajuste((atual) => ({ ...atual, [l.id]: { ...formR, competencia: e.target.value } }))}
                    style={inputStyle}
                  />
                  <input
                    aria-label="Percentual do índice"
                    type="number"
                    step="0.01"
                    value={formR.percentualIndice}
                    onChange={(e) => setFormReajuste((atual) => ({ ...atual, [l.id]: { ...formR, percentualIndice: e.target.value } }))}
                    style={{ ...inputStyle, width: 140 }}
                    placeholder={`% do ${ROTULOS_INDICE[l.indiceReajuste]} no período`}
                  />
                  <button
                    style={buttonSecondaryStyle}
                    disabled={salvandoReajuste === l.id || !formR.competencia || !formR.percentualIndice}
                    onClick={() => aplicarReajuste(l.id)}
                  >
                    {salvandoReajuste === l.id ? 'Salvando...' : 'Aplicar reajuste'}
                  </button>
                </div>
              )}
              {l.estado !== 'VIGENTE' && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Disponível quando o contrato estiver Vigente.
                </small>
              )}
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Renovação (RN-408/RN-409):</small>
              {renovacoes.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhuma renovação confirmada ainda.</small>}
              {renovacoes.map((r) => (
                <div key={r.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  <span>
                    +{r.prazoAdicionalMeses} meses: {new Date(r.vencimentoAnterior).toLocaleDateString('pt-BR')} →{' '}
                    {new Date(r.novoVencimento).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
              {l.estado === 'VIGENTE' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input
                    aria-label="Meses adicionais de renovação"
                    type="number"
                    min="1"
                    value={prazoAdicionalMeses[l.id] ?? ''}
                    onChange={(e) => setPrazoAdicionalMeses((atual) => ({ ...atual, [l.id]: e.target.value }))}
                    style={{ ...inputStyle, width: 140 }}
                    placeholder="Meses adicionais"
                  />
                  <button
                    style={buttonSecondaryStyle}
                    disabled={salvandoRenovacao === l.id || !prazoAdicionalMeses[l.id]}
                    onClick={() => confirmarRenovacao(l.id)}
                  >
                    {salvandoRenovacao === l.id ? 'Salvando...' : 'Confirmar renovação'}
                  </button>
                </div>
              )}
              {l.estado === 'EM_ENCERRAMENTO' && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Contrato venceu sem renovação confirmada (RN-409) — segue para a vistoria de saída acima.
                </small>
              )}
              {l.estado !== 'VIGENTE' && l.estado !== 'EM_ENCERRAMENTO' && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Disponível quando o contrato estiver Vigente.
                </small>
              )}
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Documentos do contrato (RN-411):</small>
              {documentos.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhum documento anexado ainda.</small>}
              {documentos.map((d) => (
                <div key={d.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  <span>{ROTULOS_TIPO_DOCUMENTO[d.tipo]} — {d.descricao} ({d.referencia})</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <select
                  aria-label="Tipo de documento"
                  value={formDoc.tipo}
                  onChange={(e) => setFormDocumento((atual) => ({ ...atual, [l.id]: { ...formDoc, tipo: e.target.value as DocumentoDeContratoTipo } }))}
                  style={{ ...inputStyle, width: 200 }}
                >
                  {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULOS_TIPO_DOCUMENTO[t]}</option>)}
                </select>
                <input
                  aria-label="Descrição do documento"
                  value={formDoc.descricao}
                  onChange={(e) => setFormDocumento((atual) => ({ ...atual, [l.id]: { ...formDoc, descricao: e.target.value } }))}
                  style={{ ...inputStyle, minWidth: 160 }}
                  placeholder="Descrição"
                />
                <input
                  aria-label="Referência do documento"
                  value={formDoc.referencia}
                  onChange={(e) => setFormDocumento((atual) => ({ ...atual, [l.id]: { ...formDoc, referencia: e.target.value } }))}
                  style={{ ...inputStyle, minWidth: 160 }}
                  placeholder="URL ou referência do documento"
                />
                <button
                  style={buttonSecondaryStyle}
                  disabled={salvandoDocumento === l.id || !formDoc.descricao || !formDoc.referencia}
                  onClick={() => anexarDocumento(l.id)}
                >
                  {salvandoDocumento === l.id ? 'Salvando...' : 'Anexar documento'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Portal do proprietário/inquilino (RN-413, somente leitura):</small>
              {acessosAtivos.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhum acesso ativo.</small>}
              {acessosAtivos.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0' }}>
                  <span>{nomeDaPessoa(a.pessoaId)} · acesso gerado em {new Date(a.criadoEm).toLocaleDateString('pt-BR')}</span>
                  <button style={buttonSecondaryStyle} disabled={salvandoAcesso === a.id} onClick={() => revogarAcessoPortal(a.id, l.id)}>
                    {salvandoAcesso === a.id ? 'Revogando...' : 'Revogar'}
                  </button>
                </div>
              ))}
              {tokenGerado[l.id] && (
                <div style={{ fontSize: 12, margin: '6px 0', wordBreak: 'break-all' }}>
                  <small style={{ display: 'block', color: 'var(--muted)' }}>
                    Link gerado (copie e envie agora — não fica salvo, não é possível recuperar depois):
                  </small>
                  <code>{typeof window !== 'undefined' ? window.location.origin : ''}/portal/{tokenGerado[l.id]}</code>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <select
                  aria-label="Pessoa para acesso ao portal"
                  value={pessoaAcessoPortal[l.id] ?? ''}
                  onChange={(e) => setPessoaAcessoPortal((atual) => ({ ...atual, [l.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 220 }}
                >
                  <option value="">Proprietário ou inquilino...</option>
                  {administracao && <option value={administracao.proprietarioPessoaId}>{nomeDaPessoa(administracao.proprietarioPessoaId)} (proprietário)</option>}
                  <option value={l.inquilinoPessoaId}>{nomeDaPessoa(l.inquilinoPessoaId)} (inquilino)</option>
                </select>
                <button
                  style={buttonSecondaryStyle}
                  disabled={salvandoAcesso === l.id || !pessoaAcessoPortal[l.id]}
                  onClick={() => gerarAcessoPortal(l.id)}
                >
                  {salvandoAcesso === l.id ? 'Gerando...' : 'Gerar link de acesso'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <small style={{ color: 'var(--muted)' }}>Encerramento antecipado com multa (RN-410):</small>
              <div style={{ background: 'var(--warning-bg, #4a2e00)', color: 'var(--warning-text, #ffcc80)', fontSize: 11, padding: '6px 8px', borderRadius: 4, margin: '4px 0' }}>
                ⚠ Exercício técnico — fórmula não validada juridicamente (ART-010 §21, DEC-NEG-017
                pendente). Bloqueado por padrão: só funciona se o servidor tiver
                LOCACAO_MULTA_RESCISORIA_HABILITADA=true, por sua conta e risco. Nunca use em
                produção real sem revisão jurídica formal.
              </div>
              {encerramentos.length === 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>Nenhum encerramento antecipado solicitado.</small>}
              {encerramentos.map((e) => (
                <div key={e.id} style={{ fontSize: 12, margin: '4px 0' }}>
                  <span>
                    {e.isento
                      ? `Isento (motivo: ${e.motivoIsencao})`
                      : `Multa: R$ ${e.valorMulta.toLocaleString('pt-BR')} (${e.mesesRestantes}/${e.mesesTotais} meses restantes, ${(e.percentualProporcional * 100).toFixed(1)}% de R$ ${e.valorReferencia.toLocaleString('pt-BR')})`}
                  </span>
                </div>
              ))}
              {l.estado === 'VIGENTE' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={formEnc.isento}
                      onChange={(e2) => setFormEncerramento((atual) => ({ ...atual, [l.id]: { ...formEnc, isento: e2.target.checked } }))}
                    />
                    Isentar multa (exige apuração formal)
                  </label>
                  {formEnc.isento && (
                    <input
                      aria-label="Motivo da isenção"
                      value={formEnc.motivoIsencao}
                      onChange={(e2) => setFormEncerramento((atual) => ({ ...atual, [l.id]: { ...formEnc, motivoIsencao: e2.target.value } }))}
                      style={{ ...inputStyle, minWidth: 200 }}
                      placeholder="Motivo da isenção (apuração formal, RN-410)"
                    />
                  )}
                  <button
                    style={buttonSecondaryStyle}
                    disabled={salvandoEncerramento === l.id || (formEnc.isento && !formEnc.motivoIsencao)}
                    onClick={() => solicitarEncerramentoAntecipado(l.id)}
                  >
                    {salvandoEncerramento === l.id ? 'Solicitando...' : 'Solicitar encerramento antecipado'}
                  </button>
                </div>
              )}
              {l.estado !== 'VIGENTE' && (
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Disponível quando o contrato estiver Vigente.
                </small>
              )}
            </div>
          </div>
        );
      })}
    </main>
  );
}
