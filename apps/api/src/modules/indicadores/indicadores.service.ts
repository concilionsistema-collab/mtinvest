import { ForbiddenException, Injectable } from '@nestjs/common';
import { IndicadoresFunil, OportunidadeEstado } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

const ESTADOS_OPORTUNIDADE: OportunidadeEstado[] = [
  'QUALIFICACAO',
  'VISITA_AGENDADA',
  'VISITA_CONFIRMADA',
  'VISITA_REALIZADA',
  'PROPOSTA_ENVIADA',
  'EM_CONTRAPROPOSTA',
  'RESERVA',
  'DOCUMENTACAO_CONCLUIDA',
  'FECHADA',
  'PERDIDA',
];

@Injectable()
export class IndicadoresService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // US-024 (ART-014) / ART-007 (metas de SLA): agregacao pura sobre Lead,
  // Oportunidade, Visita e Proposta - RN-011 (ART-004) e satisfeita por
  // construcao, ja que so retorna contagens, nunca dado individual de lead
  // ou pessoa.
  //
  // "Permissões" da US-024: "Gestor de unidade vê a própria unidade; Gestor
  // da matriz vê consolidado" (RN-011). Este sistema só tem 2 perfis
  // (GESTOR_UNIDADE/CORRETOR, ver UsuarioPerfil) - não existe um perfil de
  // rede/matriz nesta fatia, então a visão "consolidado" fica bloqueada para
  // todo mundo (default-deny) até esse perfil existir, em vez de liberada
  // para qualquer um como estava antes de US-002/US-003. CORRETOR também não
  // está na lista de perfis autorizados da história - só GESTOR_UNIDADE
  // acessa, e só a própria unidade.
  async obter(tenantId: string, chamador: UsuarioAutenticado, unidadeIdSolicitado?: string): Promise<IndicadoresFunil> {
    if (chamador.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException(
        'Apenas Gestor de unidade pode consultar indicadores ("Permissões", US-024; RN-011, ART-004).',
      );
    }
    if (unidadeIdSolicitado && unidadeIdSolicitado !== chamador.unidadeId) {
      throw new ForbiddenException(
        'Sem permissão para consultar indicadores de outra unidade — não existe perfil de rede/matriz nesta fatia (RN-011, ART-004).',
      );
    }
    const unidadeId = chamador.unidadeId;

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const leads = await tx.lead.findMany({
        where: { tenantId, unidadeId },
        select: { id: true, estado: true, origemCanal: true },
      });

      // Base da tela "Marketing" - contagem por canal (RN-011: so agregacao, nunca lead individual).
      const leadsPorCanal: Record<string, number> = {};
      for (const lead of leads) {
        leadsPorCanal[lead.origemCanal] = (leadsPorCanal[lead.origemCanal] ?? 0) + 1;
      }

      const leadsDistribuidos = leads.filter((l) => l.estado !== 'EM_FILA_DE_DISTRIBUICAO').length;
      const leadsEmAtendimento = leads.filter((l) => l.estado === 'EM_ATENDIMENTO').length;
      const leadsConvertidos = leads.filter((l) => l.estado === 'CONVERTIDO').length;
      const leadsInativos = leads.filter((l) => l.estado === 'INATIVO').length;

      // SLA - ver comentario detalhado da APROXIMACAO em packages/shared/src/indicadores.ts.
      const leadsForaDaFila = leads.filter((l) => l.estado !== 'EM_FILA_DE_DISTRIBUICAO');
      const leadsAtendidos = leads.filter((l) => l.estado === 'EM_ATENDIMENTO' || l.estado === 'CONVERTIDO');
      const slaPercentualAtendidoDentroDaJanela =
        leadsForaDaFila.length > 0 ? Math.round((leadsAtendidos.length / leadsForaDaFila.length) * 1000) / 10 : 0;

      const oportunidades = await tx.oportunidade.findMany({
        where: { tenantId, leadId: { in: leads.map((l) => l.id) } },
        select: { id: true, estado: true },
      });

      const oportunidadesPorEstagio = Object.fromEntries(
        ESTADOS_OPORTUNIDADE.map((estado) => [estado, 0]),
      ) as Record<OportunidadeEstado, number>;
      for (const oportunidade of oportunidades) {
        oportunidadesPorEstagio[oportunidade.estado] += 1;
      }

      const oportunidadeIds = oportunidades.map((o) => o.id);
      const visitasRealizadas = await tx.visita.count({
        where: { tenantId, oportunidadeId: { in: oportunidadeIds }, estado: 'REALIZADA' },
      });
      const propostasEnviadas = await tx.proposta.count({
        where: { tenantId, oportunidadeId: { in: oportunidadeIds } },
      });

      // Base da tela "Financeiro". vgvFechado nunca infere valor de imovel
      // sem valorAnunciado cadastrado (soma so o que existe de verdade).
      const fechadas = await tx.oportunidade.findMany({
        where: { tenantId, id: { in: oportunidadeIds }, estado: 'FECHADA' },
        select: { id: true, imovel: { select: { valorAnunciado: true } } },
      });
      const vgvFechado = fechadas.reduce((soma, o) => soma + (o.imovel.valorAnunciado?.toNumber() ?? 0), 0);
      const comissoesCruzadasQuantidade = await tx.comissaoCruzadaAcionada.count({
        where: { tenantId, oportunidadeId: { in: oportunidadeIds } },
      });

      return {
        unidadeId,
        leadsDistribuidos,
        leadsEmAtendimento,
        leadsConvertidos,
        leadsInativos,
        oportunidadesPorEstagio,
        leadsPorCanal,
        visitasRealizadas,
        propostasEnviadas,
        fechamentos: oportunidadesPorEstagio.FECHADA,
        vgvFechado,
        comissoesCruzadasQuantidade,
        slaPercentualAtendidoDentroDaJanela,
      };
    });
  }
}
