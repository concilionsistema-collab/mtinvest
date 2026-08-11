-- Foto de perfil (tela "Equipe") guardada no proprio Postgres, nao em disco -
-- a API roda em hospedagem com disco efemero (perdido a cada deploy), e o
-- Postgres ja e o unico armazenamento duravel deste sistema. Ver
-- schema.prisma (Usuario) e usuarios.controller.ts/usuarios.service.ts.
--
-- Nao mexe na coluna legada "foto_perfil_url" (migration
-- 20260806093000_usuario_foto_perfil_url) - ela nunca chegou a ser usada por
-- nenhum codigo em producao e fica orfa por enquanto (ver README).
ALTER TABLE "usuario" ADD COLUMN "foto_perfil" BYTEA;
ALTER TABLE "usuario" ADD COLUMN "foto_perfil_tipo" TEXT;
ALTER TABLE "usuario" ADD COLUMN "foto_perfil_atualizada_em" TIMESTAMP(3);
