-- ============================================================
-- Migration: 20260605b_ensure_columns.sql
--
-- Garante que todas as colunas usadas pela aplicacao existam em
-- captura_sefaz_config, mesmo se o usuario tiver aplicado apenas
-- partes do schema.sql ou de migrations anteriores.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- Execute no SQL Editor do Supabase apos as migrations anteriores.
-- ============================================================

-- 1) Tabela base (caso nao exista)
CREATE TABLE IF NOT EXISTS captura_sefaz_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE UNIQUE
);

-- 2) Garante todas as colunas
ALTER TABLE captura_sefaz_config
  ADD COLUMN IF NOT EXISTS certificado_a1_nome      VARCHAR(150),
  ADD COLUMN IF NOT EXISTS certificado_a1_validade  DATE,
  ADD COLUMN IF NOT EXISTS certificado_a1_carregado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS webhook_url              TEXT,
  ADD COLUMN IF NOT EXISTS webhook_ativo            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pooling_ativo            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pooling_intervalo_min    INT     DEFAULT 60,
  ADD COLUMN IF NOT EXISTS polling_ativo            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS polling_intervalo_min    INT     DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ultima_execucao          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_status            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ultimo_erro              TEXT,
  ADD COLUMN IF NOT EXISTS total_capturados         INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS modo                     VARCHAR(20) DEFAULT 'POOLING',
  ADD COLUMN IF NOT EXISTS ult_nsu                  VARCHAR(15) DEFAULT '000000000000000',
  ADD COLUMN IF NOT EXISTS ambiente                 VARCHAR(20) DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS nfse_ativo               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nfse_data_inicio         DATE,
  ADD COLUMN IF NOT EXISTS cnpj                     VARCHAR(18),
  ADD COLUMN IF NOT EXISTS criado_em                TIMESTAMPTZ DEFAULT NOW();

-- 3) Garante colunas no empresa (se ainda faltarem)
ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS pfx_base64    TEXT,
  ADD COLUMN IF NOT EXISTS pfx_senha     TEXT,
  ADD COLUMN IF NOT EXISTS ambiente      VARCHAR(20) DEFAULT 'homologacao';

-- 4) Forca refresh do schema cache do Supabase (PostgREST)
NOTIFY pgrst, 'reload schema';

SELECT 'Migration 20260605b ensure_columns concluida!' AS resultado;
