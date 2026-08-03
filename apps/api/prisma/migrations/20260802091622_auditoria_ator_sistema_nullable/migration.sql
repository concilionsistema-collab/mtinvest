-- DropForeignKey
ALTER TABLE "registro_de_auditoria" DROP CONSTRAINT "registro_de_auditoria_ator_usuario_id_fkey";

-- AlterTable
ALTER TABLE "registro_de_auditoria" ALTER COLUMN "ator_usuario_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "registro_de_auditoria" ADD CONSTRAINT "registro_de_auditoria_ator_usuario_id_fkey" FOREIGN KEY ("ator_usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
