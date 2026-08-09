-- CORRECAO REGISTRADA: coluna ja existia em schema.prisma (Usuario.fotoPerfilUrl)
-- sem migration correspondente - schema e banco real ficaram fora de sincronia.
-- Nullable, sem default: nao inventa nenhuma regra de negocio, so fecha a
-- lacuna mecanica entre o schema declarado e o banco.
ALTER TABLE "usuario" ADD COLUMN "foto_perfil_url" TEXT;
