import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImoveisService } from './imoveis.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-006 / CA-001 e CA-002 (ART-014) - "soma dos percentuais deve ser
// exatamente 100%" (RN-208, ART-008, aplicado preventivamente aqui).
describe('ImoveisService - coproprietarios (US-006)', () => {
  const tenantId = 'tenant-1';

  function percentual(valor: number) {
    return { toNumber: () => valor };
  }

  function criarServicoComTx(tx: {
    imovelFindFirst?: jest.Mock;
    pessoaFindMany?: jest.Mock;
    coproprietarioUpdateMany?: jest.Mock;
    coproprietarioCreateMany?: jest.Mock;
    coproprietarioFindMany?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          imovel: { findFirst: tx.imovelFindFirst },
          pessoa: { findMany: tx.pessoaFindMany },
          imovelCoproprietario: {
            updateMany: tx.coproprietarioUpdateMany,
            createMany: tx.coproprietarioCreateMany,
            findMany: tx.coproprietarioFindMany,
          },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new ImoveisService(tenantPrisma, new AuditoriaService(tenantPrisma));
  }

  it('CA-001: aceita composicao cuja soma dos percentuais e exatamente 100%', async () => {
    const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'i1', tenantId });
    const pessoaFindMany = jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    const coproprietarioUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const coproprietarioCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const coproprietarioFindMany = jest.fn().mockResolvedValue([
      {
        id: 'c1',
        imovelId: 'i1',
        pessoaId: 'p1',
        percentual: percentual(60),
        vigenteDe: new Date('2026-08-01'),
        vigenteAte: null,
      },
      {
        id: 'c2',
        imovelId: 'i1',
        pessoaId: 'p2',
        percentual: percentual(40),
        vigenteDe: new Date('2026-08-01'),
        vigenteAte: null,
      },
    ]);
    const service = criarServicoComTx({
      imovelFindFirst,
      pessoaFindMany,
      coproprietarioUpdateMany,
      coproprietarioCreateMany,
      coproprietarioFindMany,
    });

    const resultado = await service.definirCoproprietarios(tenantId, 'i1', {
      coproprietarios: [
        { pessoaId: 'p1', percentual: 60 },
        { pessoaId: 'p2', percentual: 40 },
      ],
    });

    expect(coproprietarioUpdateMany).toHaveBeenCalledWith({
      where: { imovelId: 'i1', tenantId, vigenteAte: null },
      data: { vigenteAte: expect.any(Date) },
    });
    expect(coproprietarioCreateMany).toHaveBeenCalled();
    expect(resultado.reduce((soma, item) => soma + item.percentual, 0)).toBe(100);
  });

  it('CA-002: rejeita composicao cuja soma dos percentuais nao e 100%', async () => {
    const imovelFindFirst = jest.fn();
    const service = criarServicoComTx({ imovelFindFirst });

    await expect(
      service.definirCoproprietarios(tenantId, 'i1', {
        coproprietarios: [
          { pessoaId: 'p1', percentual: 60 },
          { pessoaId: 'p2', percentual: 30 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // a validacao de soma ocorre antes de qualquer consulta ao banco.
    expect(imovelFindFirst).not.toHaveBeenCalled();
  });

  it('rejeita pessoa que nao pertence a este tenant', async () => {
    const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'i1', tenantId });
    const pessoaFindMany = jest.fn().mockResolvedValue([{ id: 'p1' }]); // p2 nao veio
    const coproprietarioCreateMany = jest.fn();
    const service = criarServicoComTx({ imovelFindFirst, pessoaFindMany, coproprietarioCreateMany });

    await expect(
      service.definirCoproprietarios(tenantId, 'i1', {
        coproprietarios: [
          { pessoaId: 'p1', percentual: 60 },
          { pessoaId: 'p2', percentual: 40 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(coproprietarioCreateMany).not.toHaveBeenCalled();
  });

  it('imovel de outro tenant nao e encontrado (404)', async () => {
    const imovelFindFirst = jest.fn().mockResolvedValue(null);
    const service = criarServicoComTx({ imovelFindFirst });

    await expect(
      service.definirCoproprietarios(tenantId, 'i-de-outro-tenant', {
        coproprietarios: [{ pessoaId: 'p1', percentual: 100 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
