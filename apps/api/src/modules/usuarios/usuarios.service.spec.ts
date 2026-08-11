import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsuariosService } from './usuarios.service';
import { LeadsService } from '../leads/leads.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';

function criarServicoComTx(tx: {
  usuarioFindFirst?: jest.Mock;
  usuarioUpdate?: jest.Mock;
  usuarioCreate?: jest.Mock;
  unidadeFindFirst?: jest.Mock;
  leadFindMany?: jest.Mock;
  leadUpdate?: jest.Mock;
  oportunidadeFindFirst?: jest.Mock;
  transferenciaDeCarteiraCreate?: jest.Mock;
  registroDeAuditoriaCreate?: jest.Mock;
}) {
  const tenantPrisma = {
    run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
      work({
        usuario: { findFirst: tx.usuarioFindFirst, update: tx.usuarioUpdate, create: tx.usuarioCreate },
        unidade: { findFirst: tx.unidadeFindFirst },
        lead: { findMany: tx.leadFindMany ?? jest.fn().mockResolvedValue([]), update: tx.leadUpdate },
        oportunidade: { findFirst: tx.oportunidadeFindFirst ?? jest.fn().mockResolvedValue(null) },
        transferenciaDeCarteira: {
          create: tx.transferenciaDeCarteiraCreate ?? jest.fn().mockResolvedValue({}),
        },
        registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
      }),
    ),
  } as unknown as TenantPrismaService;

  const leadsService = { distribuirLead: jest.fn().mockResolvedValue({}) } as unknown as LeadsService;
  const auditoriaService = new AuditoriaService(tenantPrisma);

  return { service: new UsuariosService(tenantPrisma, leadsService, auditoriaService), leadsService };
}

// Cobre US-010 / CA-001 (ART-014) / RN-008 (ART-004).
describe('UsuariosService - desligar (US-010)', () => {
  const tenantId = 'tenant-1';

  it('CA-001: libera e redistribui leads sob responsabilidade do usuario desligado', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
    const usuarioUpdate = jest.fn().mockResolvedValue({
      id: 'usr1',
      tenantId,
      unidadeId: 'u1',
      nome: 'Corretor Teste',
      status: 'DESLIGADO',
      criadoEm: new Date('2026-08-01T00:00:00.000Z'),
    });
    const leadFindMany = jest.fn().mockResolvedValue([
      { id: 'l1', tenantId, unidadeId: 'u1', estado: 'DISTRIBUIDO', responsavelUsuarioId: 'usr1' },
      { id: 'l2', tenantId, unidadeId: 'u1', estado: 'EM_ATENDIMENTO', responsavelUsuarioId: 'usr1' },
    ]);
    const leadUpdate = jest.fn().mockImplementation(({ where }) => ({
      id: where.id,
      estado: 'EM_FILA_DE_DISTRIBUICAO',
      responsavelUsuarioId: null,
    }));
    const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});

    const { service, leadsService } = criarServicoComTx({
      usuarioFindFirst,
      usuarioUpdate,
      leadFindMany,
      leadUpdate,
      registroDeAuditoriaCreate,
    });

    const resultado = await service.desligar(tenantId, 'usr1', 'gestor1');

    expect(usuarioUpdate).toHaveBeenCalledWith({ where: { id: 'usr1' }, data: { status: 'DESLIGADO' } });
    // US-003, "bloqueio gera RegistroDeAuditoria":
    expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
      data: { tenantId, atorUsuarioId: 'gestor1', acao: 'USUARIO_DESLIGADO', entidadeTipo: 'Usuario', entidadeId: 'usr1', motivo: undefined },
    });
    expect(leadFindMany).toHaveBeenCalledWith({
      where: { tenantId, responsavelUsuarioId: 'usr1', estado: { in: ['DISTRIBUIDO', 'EM_ATENDIMENTO'] } },
    });
    expect(leadUpdate).toHaveBeenCalledTimes(2);
    expect(leadsService.distribuirLead).toHaveBeenCalledTimes(2);
    // PENDENCIA DE AUDITORIA FECHADA (ator sistema): quem audita a
    // redistribuicao em si e o proprio LeadsService.distribuirLead agora
    // (testado em leads.service.spec.ts) - aqui so verificamos que o ator
    // humano correto (quem desligou) e repassado para ele.
    expect(leadsService.distribuirLead).toHaveBeenCalledWith(expect.anything(), tenantId, expect.objectContaining({ id: 'l1' }), 'gestor1');
    expect(leadsService.distribuirLead).toHaveBeenCalledWith(expect.anything(), tenantId, expect.objectContaining({ id: 'l2' }), 'gestor1');
    expect(resultado.status).toBe('DESLIGADO');
    // Aqui so o desligamento em si e auditado (1) - a redistribuicao de cada
    // lead e responsabilidade do LeadsService.distribuirLead (mockado nesta suite).
    expect(registroDeAuditoriaCreate).toHaveBeenCalledTimes(1);
  });

  it('usuario de outro tenant nao e encontrado (404)', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(null);
    const { service } = criarServicoComTx({ usuarioFindFirst });

    await expect(service.desligar(tenantId, 'usr-de-outro-tenant', 'gestor1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('CA-002: lead com oportunidade em estagio avancado NAO e redistribuido automaticamente - entra em fila de decisao do gestor', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
    const usuarioUpdate = jest.fn().mockResolvedValue({
      id: 'usr1',
      tenantId,
      unidadeId: 'u1',
      nome: 'Corretor Teste',
      status: 'DESLIGADO',
      criadoEm: new Date('2026-08-01T00:00:00.000Z'),
    });
    const leadFindMany = jest.fn().mockResolvedValue([
      { id: 'l1', tenantId, unidadeId: 'u1', estado: 'EM_ATENDIMENTO', responsavelUsuarioId: 'usr1' },
    ]);
    const leadUpdate = jest.fn();
    const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'l1', estado: 'PROPOSTA_ENVIADA' });
    const transferenciaDeCarteiraCreate = jest.fn().mockResolvedValue({});
    const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});

    const { service, leadsService } = criarServicoComTx({
      usuarioFindFirst,
      usuarioUpdate,
      leadFindMany,
      leadUpdate,
      oportunidadeFindFirst,
      transferenciaDeCarteiraCreate,
      registroDeAuditoriaCreate,
    });

    await service.desligar(tenantId, 'usr1', 'gestor1');

    expect(oportunidadeFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        leadId: 'l1',
        estado: { in: ['VISITA_CONFIRMADA', 'PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA', 'RESERVA', 'DOCUMENTACAO_CONCLUIDA'] },
      },
    });
    // nao redistribui automaticamente nem toca no lead:
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(leadsService.distribuirLead).not.toHaveBeenCalled();
    // cria o registro pendente na fila de decisao do gestor:
    expect(transferenciaDeCarteiraCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        leadId: 'l1',
        origemUsuarioId: 'usr1',
        estado: 'PENDENTE',
        motivo: expect.stringContaining('PROPOSTA_ENVIADA'),
        slaDecisaoFim: expect.any(Date),
      }),
    });
    expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
      data: {
        tenantId,
        atorUsuarioId: 'gestor1',
        acao: 'TRANSFERENCIA_CARTEIRA_PENDENTE',
        entidadeTipo: 'Lead',
        entidadeId: 'l1',
        motivo: 'aguardando decisao do gestor apos desligamento (estagio PROPOSTA_ENVIADA)',
      },
    });
  });
});

// Cobre US-002 (ART-014) / RN-101, RN-102 (ART-006).
describe('UsuariosService - criar (US-002)', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'gestor1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'cor1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  it('CA-001: gestor concede perfil dentro da propria unidade', async () => {
    const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
    const usuarioCreate = jest.fn().mockResolvedValue({
      id: 'novo1',
      tenantId,
      unidadeId: 'un-A',
      nome: 'Novo Corretor',
      email: 'novo@teste.com',
      perfil: 'CORRETOR',
      status: 'ATIVO',
      criadoEm: new Date('2026-08-01T00:00:00.000Z'),
    });
    const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
    const { service } = criarServicoComTx({ unidadeFindFirst, usuarioCreate, registroDeAuditoriaCreate });

    const resultado = await service.criar(tenantId, gestor, {
      unidadeId: 'un-A',
      nome: 'Novo Corretor',
      email: 'novo@teste.com',
      senha: 'senha-forte-123',
    });

    expect(resultado.perfil).toBe('CORRETOR');
    expect(usuarioCreate).toHaveBeenCalled();
    const senhaHashSalva = usuarioCreate.mock.calls[0][0].data.senhaHash;
    expect(senhaHashSalva).not.toBe('senha-forte-123'); // nunca grava senha em texto puro
    // US-002, "toda concessão gera RegistroDeAuditoria" (RN-101):
    expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
      data: { tenantId, atorUsuarioId: 'gestor1', acao: 'PERFIL_CONCEDIDO', entidadeTipo: 'Usuario', entidadeId: 'novo1', motivo: 'perfil=CORRETOR' },
    });
  });

  it('CA-001: bloqueia concessao fora da propria unidade do concedente', async () => {
    const usuarioCreate = jest.fn();
    const { service } = criarServicoComTx({ usuarioCreate });

    await expect(
      service.criar(tenantId, gestor, {
        unidadeId: 'un-B-outra-unidade',
        nome: 'Novo Corretor',
        email: 'novo@teste.com',
        senha: 'senha-forte-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usuarioCreate).not.toHaveBeenCalled();
  });

  it('CA-002: corretor sem alcada nao pode conceder perfil GESTOR_UNIDADE', async () => {
    const usuarioCreate = jest.fn();
    const { service } = criarServicoComTx({ usuarioCreate });

    await expect(
      service.criar(tenantId, corretor, {
        unidadeId: 'un-A',
        nome: 'Outro Usuario',
        email: 'outro@teste.com',
        senha: 'senha-forte-123',
        perfil: 'GESTOR_UNIDADE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usuarioCreate).not.toHaveBeenCalled();
  });

  it('gestor pode conceder o proprio perfil GESTOR_UNIDADE a outro usuario', async () => {
    const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
    const usuarioCreate = jest.fn().mockResolvedValue({
      id: 'novo2',
      tenantId,
      unidadeId: 'un-A',
      nome: 'Novo Gestor',
      email: 'gestor2@teste.com',
      perfil: 'GESTOR_UNIDADE',
      status: 'ATIVO',
      criadoEm: new Date('2026-08-01T00:00:00.000Z'),
    });
    const { service } = criarServicoComTx({ unidadeFindFirst, usuarioCreate });

    const resultado = await service.criar(tenantId, gestor, {
      unidadeId: 'un-A',
      nome: 'Novo Gestor',
      email: 'gestor2@teste.com',
      senha: 'senha-forte-123',
      perfil: 'GESTOR_UNIDADE',
    });

    expect(resultado.perfil).toBe('GESTOR_UNIDADE');
  });
});

// EXTENSAO REGISTRADA (menu "Configurações"): ver comentario em usuarios.service.ts.
describe('UsuariosService - obterPerfil/alterarSenha (Configurações)', () => {
  const tenantId = 'tenant-1';

  describe('obterPerfil', () => {
    it('retorna os dados da propria conta do chamador', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue({
        id: 'usr1',
        tenantId,
        unidadeId: 'un-A',
        nome: 'Corretor Teste',
        email: 'corretor@teste.com',
        perfil: 'CORRETOR',
        status: 'ATIVO',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const { service } = criarServicoComTx({ usuarioFindFirst });

      const resultado = await service.obterPerfil(tenantId, 'usr1');

      expect(usuarioFindFirst).toHaveBeenCalledWith({ where: { id: 'usr1', tenantId } });
      expect(resultado.email).toBe('corretor@teste.com');
    });

    it('usuario de outro tenant nao e encontrado (404)', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ usuarioFindFirst });

      await expect(service.obterPerfil(tenantId, 'usr-de-outro-tenant')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('alterarSenha', () => {
    it('troca a senha quando a senha atual confere', async () => {
      const senhaHashAtual = await bcrypt.hash('senha-antiga-123', 10);
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId, senhaHash: senhaHashAtual });
      const usuarioUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({ usuarioFindFirst, usuarioUpdate });

      await service.alterarSenha(tenantId, 'usr1', { senhaAtual: 'senha-antiga-123', novaSenha: 'senha-nova-456' });

      expect(usuarioUpdate).toHaveBeenCalledWith({ where: { id: 'usr1' }, data: { senhaHash: expect.any(String) } });
      const novoHashSalvo = usuarioUpdate.mock.calls[0][0].data.senhaHash;
      expect(novoHashSalvo).not.toBe(senhaHashAtual);
      expect(await bcrypt.compare('senha-nova-456', novoHashSalvo)).toBe(true);
    });

    it('rejeita quando a senha atual informada esta incorreta', async () => {
      const senhaHashAtual = await bcrypt.hash('senha-antiga-123', 10);
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId, senhaHash: senhaHashAtual });
      const usuarioUpdate = jest.fn();
      const { service } = criarServicoComTx({ usuarioFindFirst, usuarioUpdate });

      await expect(
        service.alterarSenha(tenantId, 'usr1', { senhaAtual: 'senha-errada', novaSenha: 'senha-nova-456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usuarioUpdate).not.toHaveBeenCalled();
    });

    it('usuario de outro tenant nao e encontrado (404)', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ usuarioFindFirst });

      await expect(
        service.alterarSenha(tenantId, 'usr-de-outro-tenant', { senhaAtual: 'x', novaSenha: 'senha-nova-456' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

// EXTENSAO REGISTRADA (tela "Equipe"): foto de perfil guardada no Postgres -
// ver comentario em schema.prisma (Usuario.fotoPerfil).
describe('UsuariosService - salvarFoto/obterFoto (tela Equipe)', () => {
  const tenantId = 'tenant-1';

  describe('salvarFoto', () => {
    it('grava os bytes e o content-type no usuario do proprio tenant', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const usuarioUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({ usuarioFindFirst, usuarioUpdate });
      const bytes = Buffer.from('fake-jpeg-bytes');

      await service.salvarFoto(tenantId, 'usr1', bytes, 'image/jpeg');

      expect(usuarioUpdate).toHaveBeenCalledWith({
        where: { id: 'usr1' },
        data: { fotoPerfil: bytes, fotoPerfilTipo: 'image/jpeg', fotoPerfilAtualizadaEm: expect.any(Date) },
      });
    });

    it('usuario de outro tenant nao e encontrado (404) - nunca grava', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue(null);
      const usuarioUpdate = jest.fn();
      const { service } = criarServicoComTx({ usuarioFindFirst, usuarioUpdate });

      await expect(
        service.salvarFoto(tenantId, 'usr-de-outro-tenant', Buffer.from('x'), 'image/jpeg'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usuarioUpdate).not.toHaveBeenCalled();
    });
  });

  describe('obterFoto', () => {
    it('retorna os bytes e o content-type quando o usuario tem foto', async () => {
      const bytes = Buffer.from('fake-jpeg-bytes');
      const usuarioFindFirst = jest.fn().mockResolvedValue({
        id: 'usr1',
        tenantId,
        fotoPerfil: bytes,
        fotoPerfilTipo: 'image/jpeg',
      });
      const { service } = criarServicoComTx({ usuarioFindFirst });

      const resultado = await service.obterFoto(tenantId, 'usr1');

      expect(resultado).toEqual({ bytes, contentType: 'image/jpeg' });
    });

    it('retorna null (nao lanca) quando o usuario existe mas nunca fez upload', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue({
        id: 'usr1',
        tenantId,
        fotoPerfil: null,
        fotoPerfilTipo: null,
      });
      const { service } = criarServicoComTx({ usuarioFindFirst });

      await expect(service.obterFoto(tenantId, 'usr1')).resolves.toBeNull();
    });

    it('retorna null quando o usuario nao pertence a este tenant (RLS/filtro de aplicacao)', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ usuarioFindFirst });

      await expect(service.obterFoto(tenantId, 'usr-de-outro-tenant')).resolves.toBeNull();
    });
  });
});
