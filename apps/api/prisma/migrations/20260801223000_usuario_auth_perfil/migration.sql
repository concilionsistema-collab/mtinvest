-- CreateEnum
CREATE TYPE "UsuarioPerfil" AS ENUM ('GESTOR_UNIDADE', 'CORRETOR');

-- AlterTable
-- email/senha_hash ficam nulos para usuarios ja existentes (criados antes
-- desta migration) ate backfill manual - ver README.md, secao de bootstrap
-- do primeiro usuario. Toda criacao nova via API (US-002) exige os dois.
ALTER TABLE "usuario" ADD COLUMN     "email" TEXT,
ADD COLUMN     "senha_hash" TEXT,
ADD COLUMN     "perfil" "UsuarioPerfil" NOT NULL DEFAULT 'CORRETOR';

-- CreateIndex
-- Multiplos NULLs sao permitidos (nao colidem entre si) - usuarios sem
-- email/senha ainda (legado, pre-migration) nao quebram este indice.
CREATE UNIQUE INDEX "usuario_tenant_id_email_key" ON "usuario"("tenant_id", "email");
