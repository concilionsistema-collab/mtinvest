-- Cria o role de aplicacao usado em runtime. Este role NAO e superusuario e
-- NAO tem BYPASSRLS: e o que faz a Row-Level Security (DEC-TEC-001) realmente
-- valer em desenvolvimento local, nao apenas em producao.
--
-- O role "postgres" (superusuario, definido em docker-compose.yml) e usado
-- somente para rodar as migrations do Prisma.

CREATE ROLE crm_app WITH LOGIN PASSWORD 'crm_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE crm_imobiliario TO crm_app;
GRANT USAGE ON SCHEMA public TO crm_app;

-- Tabelas ainda nao existem neste momento (migrations rodam depois via
-- "postgres"); privilegios de linha (RLS) sao aplicados por migration, mas
-- os privilegios de coluna/tabela precisam ser concedidos por padrao para
-- qualquer tabela futura criada pelo superusuario.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crm_app;
