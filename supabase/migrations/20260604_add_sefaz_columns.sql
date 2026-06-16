-- ============================================================
-- Migration: 20260604 - Adicionar colunas SEFAZ/NFS-e
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar campos de certificado e configuracao na tabela empresa
ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS pfx_base64     TEXT,
  ADD COLUMN IF NOT EXISTS pfx_senha      TEXT,
  ADD COLUMN IF NOT EXISTS ambiente       VARCHAR(20) DEFAULT 'homologacao'
    CHECK (ambiente IN ('producao', 'homologacao'));

-- 2. Adicionar campos faltantes na captura_sefaz_config
ALTER TABLE captura_sefaz_config
  ADD COLUMN IF NOT EXISTS ult_nsu            VARCHAR(15) DEFAULT '000000000000000',
  ADD COLUMN IF NOT EXISTS ambiente           VARCHAR(20) DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS nfse_ativo         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nfse_data_inicio   DATE,
  ADD COLUMN IF NOT EXISTS cnpj               VARCHAR(18);

-- 3. Criar tabela documentos_fiscais (caso nao exista)
CREATE TABLE IF NOT EXISTS documentos_fiscais (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID REFERENCES empresa(id) ON DELETE CASCADE,
    chave_acesso    VARCHAR(50) NOT NULL UNIQUE,
    xml             TEXT NOT NULL,
    schema          VARCHAR(20) DEFAULT 'nfeProc',
    nsu             VARCHAR(20),
    sim             VARCHAR(50),
    importado_em    TIMESTAMPTZ DEFAULT NOW(),
    criado_em       TIMESTAMPTZ DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_docs_fiscais_empresa ON documentos_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_docs_fiscais_chave   ON documentos_fiscais(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_docs_fiscais_schema  ON documentos_fiscais(schema);

-- RLS para documentos_fiscais
ALTER TABLE documentos_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_docs_fiscais ON documentos_fiscais;
CREATE POLICY allow_all_docs_fiscais ON documentos_fiscais
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Criar view de resumo para o dashboard
CREATE OR REPLACE VIEW v_captura_status AS
SELECT
  e.id            AS empresa_id,
  e.cnpj          AS cnpj,
  e.razao_social,
  e.uf,
  c.polling_ativo,
  c.nfse_ativo,
  c.ult_nsu,
  c.ultima_execucao,
  c.ultimo_status,
  c.ultimo_erro,
  c.total_capturados,
  COUNT(d.id)     AS total_documentos
FROM empresa e
LEFT JOIN captura_sefaz_config c ON c.empresa_id = e.id
LEFT JOIN documentos_fiscais d   ON d.empresa_id = e.id
GROUP BY e.id, e.cnpj, e.razao_social, e.uf,
         c.polling_ativo, c.nfse_ativo, c.ult_nsu,
         c.ultima_execucao, c.ultimo_status, c.ultimo_erro, c.total_capturados;

-- 5. Indice de performance em documentos_fiscais por data
CREATE INDEX IF NOT EXISTS idx_docs_fiscais_importado
  ON documentos_fiscais(importado_em DESC);

-- Comentarios para documentacao
COMMENT ON COLUMN empresa.pfx_base64  IS 'Certificado A1 em Base64 (PFX/P12)';
COMMENT ON COLUMN empresa.pfx_senha   IS 'Senha do certificado A1';
COMMENT ON COLUMN empresa.ambiente    IS 'Ambiente SEFAZ: producao ou homologacao';
COMMENT ON COLUMN captura_sefaz_config.ult_nsu IS 'Ultimo NSU processado no polling DF-e';
COMMENT ON COLUMN captura_sefaz_config.nfse_ativo IS 'Ativa polling do Portal Nacional NFS-e';
COMMENT ON COLUMN captura_sefaz_config.nfse_data_inicio IS 'Data inicio da busca NFS-e (incrementa a cada execucao)';
