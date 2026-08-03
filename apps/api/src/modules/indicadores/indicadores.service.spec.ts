import { ForbiddenException } from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// Cobre US-024 (ART-014) / RN-011 (ART-004: nunca expõe dado individual, só agregação;
// gestor de unidade vê só a própria unidade, sem perfil de matriz nesta fatia).
describe('IndicadoresService', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'gestor1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'cor1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  interface TxMocks {
    leadFindMany?: jest.Mock;
    oportunidadeFindMany?: jest.Mock;
    visitaCount?: jest.Mock;
    propostaCount?: jest.Mock;
    comissaoCruzadaCount?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          lead: { findMany: tx.leadFindMany },
          oportunidade: { findMany: tx.oportunidadeFindMany },
          visita: { count: tx.visitaCount },
          proposta: { count: tx.propostaCount },
          comissaoCruzadaAcionada: { count: tx.comissaoCruzadaCount ?? jest.fn().mockResolvedValue(0) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new IndicadoresService(tenantPrisma);
  }

  it('CA-001: agrega contagem por estagio do funil e SLA aproximado, para a propria unidade do gestor', async () => {
    const leadFindMany = jest.fn().mockResolvedValue([
      { id: 'l1', estado: 'EM_FILA_DE_DISTRIBUICAO', origemCanal: 'whatsapp' },
      { id: 'l2', estado: 'DISTRIBUIDO', origemCanal: 'whatsapp' },
      { id: 'l3', estado: 'EM_ATENDIMENTO', origemCanal: 'site' },
      { id: 'l4', estado: 'CONVERTIDO', origemCanal: 'indicacao' },
      { id: 'l5', estado: 'INATIVO', origemCanal: 'site' },
    ]);
    const oportunidadeFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'o1', estado: 'QUALIFICACAO' },
        { id: 'o2', estado: 'FECHADA' },
        { id: 'o3', estado: 'FECHADA' },
      ]) // contagem por estagio
      .mockResolvedValueOnce([
        { id: 'o2', imovel: { valorAnunciado: { toNumber: () => 500000 } } },
        { id: 'o3', imovel: { valorAnunciado: { toNumber: () => 300000 } } },
      ]); // base do VGV fechado (so as FECHADA, com imovel)
    const visitaCount = jest.fn().mockResolvedValue(4);
    const propostaCount = jest.fn().mockResolvedValue(2);
    const comissaoCruzadaCount = jest.fn().mockResolvedValue(1);
    const service = criarServicoComTx({
      leadFindMany,
      oportunidadeFindMany,
      visitaCount,
      propostaCount,
      comissaoCruzadaCount,
    });

    const resultado = await service.obter(tenantId, gestor);

    expect(resultado.unidadeId).toBe('un-A');
    expect(leadFindMany).toHaveBeenCalledWith({
      where: { tenantId, unidadeId: 'un-A' },
      select: { id: true, estado: true, origemCanal: true },
    });
    expect(resultado.leadsPorCanal).toEqual({ whatsapp: 2, site: 2, indicacao: 1 });
    expect(resultado.leadsDistribuidos).toBe(4); // todos exceto EM_FILA_DE_DISTRIBUICAO
    expect(resultado.leadsEmAtendimento).toBe(1);
    expect(resultado.leadsConvertidos).toBe(1);
    expect(resultado.leadsInativos).toBe(1);
    expect(resultado.oportunidadesPorEstagio.FECHADA).toBe(2);
    expect(resultado.oportunidadesPorEstagio.QUALIFICACAO).toBe(1);
    expect(resultado.oportunidadesPorEstagio.PERDIDA).toBe(0);
    expect(resultado.fechamentos).toBe(2);
    expect(resultado.visitasRealizadas).toBe(4);
    expect(resultado.propostasEnviadas).toBe(2);
    expect(resultado.vgvFechado).toBe(800000);
    expect(resultado.comissoesCruzadasQuantidade).toBe(1);
    // 4 leads fora da fila, 2 atendidos (EM_ATENDIMENTO + CONVERTIDO) => 50%
    expect(resultado.slaPercentualAtendidoDentroDaJanela).toBe(50);
  });

  it('unidade sem dados retorna tudo zerado', async () => {
    const leadFindMany = jest.fn().mockResolvedValue([]);
    const oportunidadeFindMany = jest.fn().mockResolvedValue([]);
    const visitaCount = jest.fn().mockResolvedValue(0);
    const propostaCount = jest.fn().mockResolvedValue(0);
    const service = criarServicoComTx({ leadFindMany, oportunidadeFindMany, visitaCount, propostaCount });

    const resultado = await service.obter(tenantId, gestor);

    expect(resultado.unidadeId).toBe('un-A');
    expect(resultado.slaPercentualAtendidoDentroDaJanela).toBe(0);
  });

  it('"Permissões" (US-024): CORRETOR nao pode consultar indicadores', async () => {
    const service = criarServicoComTx({});

    await expect(service.obter(tenantId, corretor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('RN-011: gestor nao pode consultar indicadores de outra unidade (sem perfil de matriz nesta fatia)', async () => {
    const service = criarServicoComTx({});

    await expect(service.obter(tenantId, gestor, 'un-B-outra-unidade')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gestor pode consultar explicitamente a propria unidade', async () => {
    const leadFindMany = jest.fn().mockResolvedValue([]);
    const oportunidadeFindMany = jest.fn().mockResolvedValue([]);
    const visitaCount = jest.fn().mockResolvedValue(0);
    const propostaCount = jest.fn().mockResolvedValue(0);
    const service = criarServicoComTx({ leadFindMany, oportunidadeFindMany, visitaCount, propostaCount });

    const resultado = await service.obter(tenantId, gestor, 'un-A');

    expect(resultado.unidadeId).toBe('un-A');
  });
});
