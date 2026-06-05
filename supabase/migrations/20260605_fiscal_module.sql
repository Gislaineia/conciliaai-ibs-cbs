-- ============================================================
-- Migration: 20260605_fiscal_module
--
-- 1. Tabela `documento_consultas` — histórico de consultas SEFAZ/NFS-e
-- 2. Tabela `conciliacao_periodo` — resultado de conciliação por mês
-- 3. Colunas `parseado_em` / `parse_erro` em documentos_fiscais
-- 4. Compatibiliza pooling_ativo ↔ polling_ativo
-- 5. View `v_documentos_consolidado` — XMLs capturados x escriturados
--
-- Execute no SQL Editor do Supabase.
-- ============================================================

-- ─── 1) HISTÓRICO DE CONSULTAS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documento_consultas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id        UUID REFERENCES empresa(id) ON DELETE CASCADE,
  tipo              VARCHAR(30) NOT NULL CHECK (tipo IN (
                      'NFE_CHAVE','NFE_DFE','CADASTRO_CNPJ','STATUS_SERVICO',
                      'NFSE_RFB','NFSE_ABRASF','WEBHOOK','CTE_CHAVE'
                    )),
  chave_acesso      VARCHAR(60),
  origem            VARCHAR(50),
  status            VARCHAR(10) CHECK (status IN ('OK','ERRO','TIMEOUT','IGNORADO')),
  mensagem          TEXT,
  payload_resposta  JSONB,
  duracao_ms        INT,
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consultas_empresa ON documento_consultas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consultas_chave   ON documento_consultas(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_consultas_tipo    ON documento_consultas(tipo);
CREATE INDEX IF NOT EXISTS idx_consultas_data    ON documento_consultas(criado_em DESC);

ALTER TABLE documento_consultas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename='documento_consultas' AND policyname='allow_all_consultas'
  ) THEN
    CREATE POLICY allow_all_consultas ON documento_consultas
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 2) CONCILIAÇÃO POR PERÍODO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conciliacao_periodo (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id                    UUID REFERENCES empresa(id) ON DELETE CASCADE,
  periodo                       VARCHAR(7) NOT NULL,
  total_capturados              INT DEFAULT 0,
  total_escriturados            INT DEFAULT 0,
  total_entrada                 DECIMAL(15,2) DEFAULT 0,
  total_saida                   DECIMAL(15,2) DEFAULT 0,
  total_cbs_documentos          DECIMAL(15,2) DEFAULT 0,
  total_ibs_documentos          DECIMAL(15,2) DEFAULT 0,
  total_cbs_apurado             DECIMAL(15,2) DEFAULT 0,
  total_ibs_apurado             DECIMAL(15,2) DEFAULT 0,
  capturados_nao_escriturados   INT DEFAULT 0,
  escriturados_nao_capturados   INT DEFAULT 0,
  diferenca_cbs                 DECIMAL(15,2) DEFAULT 0,
  diferenca_ibs                 DECIMAL(15,2) DEFAULT 0,
  status                        VARCHAR(20) DEFAULT 'gerada',
  duracao_ms                    INT,
  executado_em                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_conc_empresa  ON conciliacao_periodo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_conc_periodo  ON conciliacao_periodo(periodo);
ALTER TABLE conciliacao_periodo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename='conciliacao_periodo' AND policyname='allow_all_conciliacao'
  ) THEN
    CREATE POLICY allow_all_conciliacao ON conciliacao_periodo
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 3) FLAGS DE PARSEAMENTO EM documentos_fiscais ──────────────────────
ALTER TABLE documentos_fiscais
  ADD COLUMN IF NOT EXISTS parseado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parse_erro    TEXT;

CREATE INDEX IF NOT EXISTS idx_docs_fiscais_parseado
  ON documentos_fiscais(parseado_em);

-- ─── 4) Compatibiliza pooling_ativo (schema.sql) ↔ polling_ativo (migration anterior)
-- Mantém ambas e sincroniza via trigger; novas colunas a adotar = polling_ativo / polling_intervalo_min.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='captura_sefaz_config' AND column_name='polling_ativo') THEN
    ALTER TABLE captura_sefaz_config ADD COLUMN polling_ativo BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='captura_sefaz_config' AND column_name='polling_intervalo_min') THEN
    ALTER TABLE captura_sefaz_config ADD COLUMN polling_intervalo_min INT DEFAULT 60;
  END IF;
END $$;

-- Sincroniza valores existentes: pooling_ativo → polling_ativo
UPDATE captura_sefaz_config
   SET polling_ativo = COALESCE(polling_ativo, pooling_ativo, FALSE),
       polling_intervalo_min = COALESCE(polling_intervalo_min, pooling_intervalo_min, 60)
 WHERE polling_ativo IS DISTINCT FROM pooling_ativo;

-- Trigger para manter compatibilidade nas duas direções
CREATE OR REPLACE FUNCTION sync_pooling_polling() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.polling_ativo IS DISTINCT FROM OLD.polling_ativo THEN
    NEW.pooling_ativo := NEW.polling_ativo;
  ELSIF NEW.pooling_ativo IS DISTINCT FROM OLD.pooling_ativo THEN
    NEW.polling_ativo := NEW.pooling_ativo;
  END IF;
  IF NEW.polling_intervalo_min IS DISTINCT FROM OLD.polling_intervalo_min THEN
    NEW.pooling_intervalo_min := NEW.polling_intervalo_min;
  ELSIF NEW.pooling_intervalo_min IS DISTINCT FROM OLD.pooling_intervalo_min THEN
    NEW.polling_intervalo_min := NEW.pooling_intervalo_min;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pooling_polling ON captura_sefaz_config;
CREATE TRIGGER trg_sync_pooling_polling
  BEFORE UPDATE ON captura_sefaz_config
  FOR EACH ROW EXECUTE FUNCTION sync_pooling_polling();

-- ─── 5) VIEW consolidada: capturados x escriturados ─────────────────────
CREATE OR REPLACE VIEW v_documentos_consolidado AS
SELECT
  e.id            AS empresa_id,
  e.cnpj          AS cnpj,
  e.razao_social,
  df.chave_acesso,
  df.schema,
  df.sim          AS origem_captura,
  df.importado_em,
  df.parseado_em,
  d.id            AS documento_id,
  d.tipo,
  d.direcao,
  d.numero_doc,
  d.serie,
  d.data_emissao,
  d.cnpj_emitente,
  d.razao_emitente,
  d.valor_total,
  d.valor_cbs_documento,
  d.valor_ibs_documento,
  d.status_classificacao,
  d.periodo_competencia,
  CASE
    WHEN d.id IS NULL THEN 'capturado_nao_escriturado'
    WHEN d.id IS NOT NULL AND df.id IS NULL THEN 'escriturado_sem_xml'
    ELSE 'conciliado'
  END AS status_conciliacao
FROM empresa e
LEFT JOIN documentos_fiscais df ON df.empresa_id = e.id
LEFT JOIN documentos        d  ON d.chave_acesso = df.chave_acesso AND d.empresa_id = e.id;

-- ─── 6) Confirmação ──────────────────────────────────────────────────────
SELECT 'Migration 20260605 fiscal_module concluída!' AS resultado;
