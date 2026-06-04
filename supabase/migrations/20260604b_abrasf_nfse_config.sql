-- ============================================================
-- Migration: 20260604b - ABRASF NFS-e Config
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de municipios ABRASF configurados por empresa
CREATE TABLE IF NOT EXISTS nfse_abrasf_config (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id         UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    municipio_ibge     VARCHAR(7) NOT NULL,
    municipio_nome     VARCHAR(100),
    uf                 VARCHAR(2),
    url_webservice     TEXT NOT NULL,
    versao_abrasf      VARCHAR(10) DEFAULT '2.02',
    ativo              BOOLEAN DEFAULT TRUE,
    ultima_execucao    TIMESTAMPTZ,
    ultimo_status      VARCHAR(20),
    ultimo_erro        TEXT,
    total_capturados   INT DEFAULT 0,
    nfse_data_inicio   DATE,
    criado_em          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(empresa_id, municipio_ibge)
  );

CREATE INDEX IF NOT EXISTS idx_abrasf_empresa   ON nfse_abrasf_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_abrasf_municipio ON nfse_abrasf_config(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_abrasf_ativo     ON nfse_abrasf_config(ativo);

ALTER TABLE nfse_abrasf_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'nfse_abrasf_config'
      AND policyname = 'allow_all_abrasf_config'
    ) THEN
    CREATE POLICY allow_all_abrasf_config ON nfse_abrasf_config
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. View consolidada de todos os documentos NFS-e por origem
CREATE OR REPLACE VIEW v_nfse_documentos AS
SELECT
  d.id,
  d.empresa_id,
  e.cnpj,
  e.razao_social,
  e.municipio,
  e.uf,
  d.chave_acesso,
  d.schema,
  d.sim AS origem,
  CASE
    WHEN d.sim LIKE 'abrasf%'       THEN 'ABRASF Municipal'
    WHEN d.sim LIKE 'nfse_rfb%'     THEN 'Portal Nacional RFB'
    WHEN d.sim = 'nfse_nacional_cron' THEN 'Portal Nacional (cron)'
    WHEN d.sim = 'nfse_nacional_poll' THEN 'Portal Nacional (manual)'
    ELSE d.sim
  END AS origem_descricao,
  d.importado_em,
  d.criado_em
FROM documentos_fiscais d
JOIN empresa e ON e.id = d.empresa_id
WHERE d.schema = 'nfse'
ORDER BY d.importado_em DESC;

-- 3. View de status consolidado SEFAZ + NFS-e por empresa
CREATE OR REPLACE VIEW v_integracao_status AS
SELECT
  e.id            AS empresa_id,
  e.cnpj,
  e.razao_social,
  e.uf,
  e.municipio,
  e.cod_municipio_ibge,
  -- SEFAZ NF-e
  cs.polling_ativo        AS sefaz_polling_ativo,
  cs.ult_nsu              AS sefaz_ult_nsu,
  cs.ultima_execucao      AS sefaz_ultima_execucao,
  cs.ultimo_status        AS sefaz_ultimo_status,
  -- NFS-e Portal Nacional
  cs.nfse_ativo           AS nfse_rfb_ativo,
  cs.nfse_data_inicio     AS nfse_rfb_data_inicio,
  -- NFS-e ABRASF
  COUNT(na.id)            AS total_municipios_abrasf,
  SUM(CASE WHEN na.ativo THEN 1 ELSE 0 END) AS municipios_abrasf_ativos,
  -- Totais
  COUNT(df.id)            AS total_documentos
FROM empresa e
LEFT JOIN captura_sefaz_config cs ON cs.empresa_id = e.id
LEFT JOIN nfse_abrasf_config   na ON na.empresa_id = e.id
LEFT JOIN documentos_fiscais   df ON df.empresa_id = e.id
GROUP BY e.id, e.cnpj, e.razao_social, e.uf, e.municipio, e.cod_municipio_ibge,
         cs.polling_ativo, cs.ult_nsu, cs.ultima_execucao, cs.ultimo_status,
         cs.nfse_ativo, cs.nfse_data_inicio;

SELECT 'Migration ABRASF concluida!' AS resultado;
