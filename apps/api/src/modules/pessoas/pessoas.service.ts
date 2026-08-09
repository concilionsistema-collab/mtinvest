import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Pessoa as PessoaRecord, Prisma } from '@prisma/client';
import { AtualizarPessoaInput, CriarPessoaInput, Pessoa } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraPessoa(registro: PessoaRecord): Pessoa {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    tipo: registro.tipo,
    nome: registro.nome,
    documentoNormalizado: registro.documentoNormalizado,
    telefoneNormalizado: registro.telefoneNormalizado,
    anonimizadoEm: registro.anonimizadoEm ? registro.anonimizadoEm.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// CORREÇÃO REGISTRADA: telefoneNormalizado existe no modelo (Pessoa, ART-005)
// desde sempre, mas nunca era aceito por este endpoint - só LeadsService.capturar
// preenchia esse campo (criando a Pessoa por outro caminho). Fechado aqui.
function mensagemConflitoUnico(erro: Prisma.PrismaClientKnownRequestError): string {
  const alvo = (erro.meta?.target as string[] | undefined) ?? [];
  if (alvo.some((campo) => campo.includes('documento'))) {
    return 'Já existe uma pessoa com este documento neste tenant.';
  }
  if (alvo.some((campo) => campo.includes('telefone'))) {
    return 'Já existe uma pessoa com este telefone neste tenant.';
  }
  return 'Dado já cadastrado para outra pessoa deste tenant.';
}

@Injectable()
export class PessoasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async criar(tenantId: string, input: CriarPessoaInput): Promise<Pessoa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      try {
        const criada = await tx.pessoa.create({
          data: {
            tenantId,
            tipo: input.tipo,
            nome: input.nome,
            documentoNormalizado: input.documentoNormalizado,
            telefoneNormalizado: input.telefoneNormalizado,
          },
        });
        return paraPessoa(criada);
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
          throw new BadRequestException(mensagemConflitoUnico(erro));
        }
        throw erro;
      }
    });
  }

  async listar(tenantId: string): Promise<Pessoa[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.pessoa.findMany({
        where: { tenantId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraPessoa);
    });
  }

  // ART-012 (LGPD): "direito de correção" - mínimo exigido junto com
  // consulta e eliminação. Auditado por tocar dado pessoal, mesmo sem ser
  // um dos itens explicitamente listados em ART-005 §9.
  async atualizar(
    tenantId: string,
    atorUsuarioId: string,
    pessoaId: string,
    input: AtualizarPessoaInput,
  ): Promise<Pessoa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const pessoa = await tx.pessoa.findFirst({ where: { id: pessoaId, tenantId } });
      if (!pessoa) {
        throw new NotFoundException('Pessoa não encontrada neste tenant.');
      }
      if (pessoa.anonimizadoEm) {
        throw new BadRequestException('Este titular já foi anonimizado a pedido (LGPD) e não pode ser editado.');
      }

      try {
        const atualizada = await tx.pessoa.update({
          where: { id: pessoaId },
          data: {
            nome: input.nome,
            documentoNormalizado: input.documentoNormalizado,
            telefoneNormalizado: input.telefoneNormalizado,
          },
        });

        await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'PESSOA_DADOS_CORRIGIDOS', 'Pessoa', pessoaId);

        return paraPessoa(atualizada);
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
          throw new BadRequestException(mensagemConflitoUnico(erro));
        }
        throw erro;
      }
    });
  }

  // ART-012 (LGPD): "processo de atendimento a pedido de eliminação, sujeito
  // à política de retenção (DEC-NEG-018) e a eventuais obrigações de guarda
  // que impeçam eliminação imediata". Nunca faz DELETE físico - as FKs de
  // Lead/ContratoDeAdministracao/ContratoDeLocacao/Garantia/
  // ImovelCoproprietario apontam pra Pessoa com ON DELETE RESTRICT de
  // propósito (apagar quebraria o histórico contratual/financeiro, que a
  // própria LGPD permite guardar por obrigação legal - art. 16). Em vez
  // disso, anonimiza nome/documento/telefone quando não há obrigação ativa
  // bloqueando. Idempotente: chamar de novo num titular já anonimizado só
  // devolve o estado atual, sem re-auditar.
  //
  // DEC-NEG-018 (pendente) trata "lead em prospecção" como categoria de
  // legítimo interesse de janela curta, não obrigação contratual - por isso
  // um Lead ativo NÃO bloqueia eliminação aqui, só vínculo contratual real
  // (administração ativa, locação não encerrada como inquilino, garantia de
  // fiador em contrato não encerrado, coproprietariedade vigente).
  async solicitarEliminacao(
    tenantId: string,
    atorUsuarioId: string,
    pessoaId: string,
    motivo: string,
  ): Promise<Pessoa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const pessoa = await tx.pessoa.findFirst({ where: { id: pessoaId, tenantId } });
      if (!pessoa) {
        throw new NotFoundException('Pessoa não encontrada neste tenant.');
      }
      if (pessoa.anonimizadoEm) {
        return paraPessoa(pessoa);
      }

      const [administracaoAtiva, locacaoNaoEncerrada, garantiaEmContratoAtivo, coproprietarioVigente] = await Promise.all([
        tx.contratoDeAdministracao.findFirst({ where: { tenantId, proprietarioPessoaId: pessoaId, status: 'ATIVO' } }),
        tx.contratoDeLocacao.findFirst({ where: { tenantId, inquilinoPessoaId: pessoaId, estado: { not: 'ENCERRADO' } } }),
        tx.garantia.findFirst({
          where: { tenantId, fiadorPessoaId: pessoaId, contratoDeLocacao: { estado: { not: 'ENCERRADO' } } },
        }),
        tx.imovelCoproprietario.findFirst({ where: { tenantId, pessoaId, vigenteAte: null } }),
      ]);

      if (administracaoAtiva) {
        throw new BadRequestException(
          'Não é possível eliminar: esta pessoa é proprietária em um contrato de administração ativo (DEC-NEG-018).',
        );
      }
      if (locacaoNaoEncerrada) {
        throw new BadRequestException(
          'Não é possível eliminar: esta pessoa é inquilino em um contrato de locação ainda não encerrado (DEC-NEG-018).',
        );
      }
      if (garantiaEmContratoAtivo) {
        throw new BadRequestException(
          'Não é possível eliminar: esta pessoa é fiador de uma garantia vinculada a um contrato de locação ainda não encerrado (DEC-NEG-018).',
        );
      }
      if (coproprietarioVigente) {
        throw new BadRequestException(
          'Não é possível eliminar: esta pessoa é coproprietária vigente de um imóvel (DEC-NEG-018).',
        );
      }

      const anonimizada = await tx.pessoa.update({
        where: { id: pessoaId },
        data: {
          nome: 'Titular anonimizado (LGPD)',
          documentoNormalizado: null,
          telefoneNormalizado: null,
          anonimizadoEm: new Date(),
        },
      });

      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'PESSOA_ANONIMIZADA', 'Pessoa', pessoaId, motivo);

      return paraPessoa(anonimizada);
    });
  }
}
