import { BadRequestException } from '@nestjs/common';
import { ReservasService } from './reservas.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-018 (ART-014) / RN-307 (ART-009).
describe('ReservasService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    propostaFindFirst?: jest.Mock;
    reservaCreate?: jest.Mock;
    reservaUpdate?: jest.Mock;
    reservaFindMany?: jest.Mock;
    oportunidadeFindFirst?: jest.Mock;
    validarResponsavelDaOportunidade?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          proposta: { findFirst: tx.propostaFindFirst },
          oportunidade: {
            findFirst: tx.oportunidadeFindFirst ?? jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' }),
          },
          reserva: {
            create: tx.reservaCreate,
            update: tx.reservaUpdate ?? jest.fn(),
            findMany: tx.reservaFindMany ?? jest.fn().mockResolvedValue([]),
          },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const oportunidadesService = {
      moverEstagioTx: jest.fn().mockResolvedValue({}),
      validarResponsavelDaOportunidade:
        tx.validarResponsavelDaOportunidade ?? jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' }),
    } as unknown as OportunidadesService;

    return {
      service: new ReservasService(tenantPrisma, oportunidadesService, new AuditoriaService(tenantPrisma)),
      oportunidadesService,
    };
  }

  it('CA-001: formaliza reserva a partir de proposta aceita e sincroniza a oportunidade', async () => {
    const propostaFindFirst = jest.fn().mockResolvedValue({ id: 'prop1', tenantId, oportunidadeId: 'op1', status: 'ACEITA' });
    const reservaCreate = jest.fn().mockResolvedValue({
      id: 'res1',
      tenantId,
      oportunidadeId: 'op1',
      propostaId: 'prop1',
      estado: 'ATIVA',
      expiraEm: new Date('2026-08-06T00:00:00.000Z'),
      criadoEm: new Date('2026-08-01T00:00:00.000Z'),
    });
    const { service, oportunidadesService } = criarServicoComTx({ propostaFindFirst, reservaCreate });

    const resultado = await service.formalizar(tenantId, 'op1', { propostaId: 'prop1' }, 'usr1');

    // PENDENCIA FECHADA (Permissões, US-018): so o responsavel pela oportunidade formaliza.
    expect(oportunidadesService.validarResponsavelDaOportunidade).toHaveBeenCalledWith(
      expect.anything(),
      tenantId,
      'op1',
      'usr1',
    );
    expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'RESERVA', 'usr1');
    expect(resultado.estado).toBe('ATIVA');
  });

  it('PENDENCIA FECHADA (Permissões, US-018): rejeita quem nao e o responsavel pela oportunidade', async () => {
    const validarResponsavelDaOportunidade = jest.fn().mockRejectedValue(new BadRequestException('sem permissao'));
    const reservaCreate = jest.fn();
    const { service, oportunidadesService } = criarServicoComTx({ reservaCreate, validarResponsavelDaOportunidade });

    await expect(service.formalizar(tenantId, 'op1', { propostaId: 'prop1' }, 'outro')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(reservaCreate).not.toHaveBeenCalled();
    expect(oportunidadesService.moverEstagioTx).not.toHaveBeenCalled();
  });

  it('rejeita formalizar reserva a partir de proposta nao aceita', async () => {
    const propostaFindFirst = jest.fn().mockResolvedValue({ id: 'prop1', tenantId, oportunidadeId: 'op1', status: 'ENVIADA' });
    const reservaCreate = jest.fn();
    const { service, oportunidadesService } = criarServicoComTx({ propostaFindFirst, reservaCreate });

    await expect(service.formalizar(tenantId, 'op1', { propostaId: 'prop1' }, 'usr1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(reservaCreate).not.toHaveBeenCalled();
    expect(oportunidadesService.moverEstagioTx).not.toHaveBeenCalled();
  });

  it('CA-002: expira reservas vencidas ao listar, com ator sistema (null) auditado', async () => {
    // findMany e chamado duas vezes: 1) expirarVencidas busca as ATIVA vencidas,
    // 2) listarPorOportunidade busca a lista final (ja com o novo estado).
    const reservaFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'res1', tenantId, oportunidadeId: 'op1', propostaId: 'prop1', estado: 'ATIVA', expiraEm: new Date('2020-01-01'), criadoEm: new Date('2026-08-01') },
      ])
      .mockResolvedValueOnce([
        { id: 'res1', tenantId, oportunidadeId: 'op1', propostaId: 'prop1', estado: 'EXPIRADA', expiraEm: new Date('2020-01-01'), criadoEm: new Date('2026-08-01') },
      ]);
    const reservaUpdate = jest.fn().mockResolvedValue({});
    const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
    const { service } = criarServicoComTx({ reservaFindMany, reservaUpdate, registroDeAuditoriaCreate });

    const reservas = await service.listarPorOportunidade(tenantId, 'op1', 'u1');

    expect(reservaUpdate).toHaveBeenCalledWith({ where: { id: 'res1' }, data: { estado: 'EXPIRADA' } });
    expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
      data: {
        tenantId,
        atorUsuarioId: null,
        acao: 'RESERVA_ESTADO_ALTERADO',
        entidadeTipo: 'Reserva',
        entidadeId: 'res1',
        motivo: 'ATIVA->EXPIRADA (prazo de 5 dias vencido, RN-307/US-018)',
      },
    });
    expect(reservas[0].estado).toBe('EXPIRADA');
  });
});
