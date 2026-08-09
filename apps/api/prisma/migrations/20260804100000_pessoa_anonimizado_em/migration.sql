-- ART-012 (Seguranca e LGPD): marca quando um titular foi anonimizado a
-- pedido (PessoasService.solicitarEliminacao). Nullable - sem impacto em
-- linhas existentes.
ALTER TABLE "pessoa" ADD COLUMN "anonimizado_em" TIMESTAMP(3);
