-- ============================================================
-- IBS/CBS Fiscal — Schema Supabase (PostgreSQL)
-- Reforma Tributária — LC 214/2025
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 0  ESCRITÓRIO CONTÁBIL (multi-tenant raiz)
-- ============================================================
CREATE TABLE IF NOT EXISTS escritorio_contabil (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(150) NOT NULL,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  responsavel VARCHAR(150),
  email VARCHAR(150),
  telefone VARCHAR(30),
  logo_url TEXT,
  cor_primaria VARCHAR(20) DEFAULT '#2563eb',
  cor_secundaria VARCHAR(20),
  slug VARCHAR(50) UNIQUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4.1  EMPRESA (cliente do escritório)
-- ============================================================
CREATE TABLE IF NOT EXISTS empresa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id UUID REFERENCES escritorio_contabil(id) ON DELETE CASCADE,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social VARCHAR(150) NOT NULL,
  nome_fantasia VARCHAR(100),
  uf VARCHAR(2) NOT NULL,
  municipio VARCHAR(100) NOT NULL,
  cod_municipio_ibge VARCHAR(7) NOT NULL,
  regime_tributario VARCHAR(30) NOT NULL CHECK (
    regime_tributario IN ('LUCRO_REAL','LUCRO_PRESUMIDO','SIMPLES_NACIONAL','MEI')
  ),
  regime_pis_cofins VARCHAR(20) DEFAULT 'cumulativo',
  crt VARCHAR(1) DEFAULT '3',
  regime_ibs_cbs VARCHAR(30) DEFAULT 'contribuinte_padrao',
  setor_diferenciado VARCHAR(50),
  simples_opta_destaque_ibs BOOLEAN DEFAULT FALSE,
  is_mei BOOLEAN DEFAULT FALSE,
  faturamento_anual_estimado DECIMAL(15,2),
  aliquota_cbs DECIMAL(8,4) DEFAULT 8.8000,
  aliquota_ibs_estadual DECIMAL(8,4) DEFAULT 17.7000,
  aliquota_ibs_municipal DECIMAL(8,4) DEFAULT 8.8000,
  ano_vigencia_aliquota INT DEFAULT 2026,
  certificado_a1_path TEXT,
  certificado_vencimento DATE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4.2  ALÍQUOTAS IBS POR UF/MUNICÍPIO
-- ============================================================
CREATE TABLE IF NOT EXISTS aliquotas_ibs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uf VARCHAR(2) NOT NULL,
  cod_municipio_ibge VARCHAR(7),
  ano INT NOT NULL,
  aliquota_estadual DECIMAL(8,4) NOT NULL,
  aliquota_municipal DECIMAL(8,4) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE
);
CREATE INDEX IF NOT EXISTS idx_aliquotas_ibs_uf ON aliquotas_ibs(uf, ano);

-- ============================================================
-- 4.3  DOCUMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS documentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('NFe','CTe','NFSe')),
  chave_acesso VARCHAR(60) NOT NULL UNIQUE,
  numero_doc VARCHAR(20),
  serie VARCHAR(5),
  data_emissao DATE NOT NULL,
  data_entrada_saida DATE,
  cnpj_emitente VARCHAR(18) NOT NULL,
  razao_emitente VARCHAR(150),
  cnpj_destinatario VARCHAR(18),
  uf_emitente VARCHAR(2),
  uf_destinatario VARCHAR(2),
  municipio_emitente VARCHAR(100),
  municipio_destinatario VARCHAR(100),
  cfop_principal VARCHAR(4),
  direcao VARCHAR(10) NOT NULL CHECK (direcao IN ('ENTRADA','SAIDA')),
  crt_emitente VARCHAR(1),
  tipo_credito_fornecedor VARCHAR(20),
  valor_total DECIMAL(15,2),
  valor_produtos DECIMAL(15,2),
  valor_frete DECIMAL(15,2) DEFAULT 0,
  valor_ipi DECIMAL(15,2) DEFAULT 0,
  valor_icms DECIMAL(15,2) DEFAULT 0,
  valor_pis DECIMAL(15,2) DEFAULT 0,
  valor_cofins DECIMAL(15,2) DEFAULT 0,
  valor_cbs_documento DECIMAL(15,2) DEFAULT 0,
  valor_ibs_documento DECIMAL(15,2) DEFAULT 0,
  xml_original TEXT,
  status_classificacao VARCHAR(20) DEFAULT 'pendente',
  periodo_competencia VARCHAR(7),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_periodo ON documentos(periodo_competencia);
CREATE INDEX IF NOT EXISTS idx_documentos_direcao ON documentos(direcao);

-- ============================================================
-- 4.4  ITENS DOCUMENTO
-- ============================================================
CREATE TABLE IF NOT EXISTS itens_documento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  documento_id UUID REFERENCES documentos(id) ON DELETE CASCADE,
  numero_item INT NOT NULL,
  codigo_produto VARCHAR(60),
  descricao VARCHAR(300) NOT NULL,
  ncm VARCHAR(8),
  cfop VARCHAR(4),
  unidade VARCHAR(10),
  quantidade DECIMAL(15,4),
  valor_unitario DECIMAL(15,4),
  valor_total DECIMAL(15,2),
  cst_icms VARCHAR(3),
  valor_icms DECIMAL(15,2) DEFAULT 0,
  aliquota_icms DECIMAL(8,4) DEFAULT 0,
  cst_ipi VARCHAR(2),
  valor_ipi DECIMAL(15,2) DEFAULT 0,
  cst_pis VARCHAR(2),
  valor_pis DECIMAL(15,2) DEFAULT 0,
  aliquota_pis DECIMAL(8,4) DEFAULT 0,
  cst_cofins VARCHAR(2),
  valor_cofins DECIMAL(15,2) DEFAULT 0,
  aliquota_cofins DECIMAL(8,4) DEFAULT 0,
  cst_cbs VARCHAR(2),
  cst_ibs VARCHAR(2),
  aliquota_cbs DECIMAL(8,4) DEFAULT 0,
  aliquota_ibs_estadual DECIMAL(8,4) DEFAULT 0,
  aliquota_ibs_municipal DECIMAL(8,4) DEFAULT 0,
  valor_cbs_ofertado DECIMAL(15,2) DEFAULT 0,
  valor_ibs_est_ofertado DECIMAL(15,2) DEFAULT 0,
  valor_ibs_mun_ofertado DECIMAL(15,2) DEFAULT 0,
  valor_credito_cbs DECIMAL(15,2) DEFAULT 0,
  valor_credito_ibs_est DECIMAL(15,2) DEFAULT 0,
  valor_credito_ibs_mun DECIMAL(15,2) DEFAULT 0,
  base_calculo_cbs DECIMAL(15,2) DEFAULT 0,
  base_calculo_ibs DECIMAL(15,2) DEFAULT 0,
  tipo_calculo_credito VARCHAR(20) DEFAULT 'destacado',
  aliquota_presumida_cbs DECIMAL(8,4) DEFAULT 0,
  aliquota_presumida_ibs DECIMAL(8,4) DEFAULT 0,
  natureza_operacao VARCHAR(50),
  gera_credito BOOLEAN DEFAULT FALSE,
  motivo_vedacao_credito VARCHAR(200),
  classificado_por VARCHAR(20),
  regra_aplicada_id UUID,
  status_item VARCHAR(20) DEFAULT 'pendente',
  observacao_credito TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itens_documento ON itens_documento(documento_id);
CREATE INDEX IF NOT EXISTS idx_itens_status ON itens_documento(status_item);

-- ============================================================
-- 4.5  REGRAS DE CLASSIFICAÇÃO
-- ============================================================
CREATE TABLE IF NOT EXISTS regras_classificacao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  descricao VARCHAR(200),
  ncm_prefixo VARCHAR(8),
  cfop VARCHAR(4),
  uf_emitente VARCHAR(2),
  cnpj_emitente VARCHAR(18),
  direcao VARCHAR(10),
  crt_emitente VARCHAR(1),
  regime_tributario_emitente VARCHAR(30),
  natureza_contem VARCHAR(100),
  cst_cbs_destino VARCHAR(2),
  cst_ibs_destino VARCHAR(2),
  natureza_destino VARCHAR(50),
  tipo_uso_destino VARCHAR(30),
  gera_credito BOOLEAN,
  motivo_vedacao VARCHAR(200),
  origem VARCHAR(20) DEFAULT 'manual',
  prioridade INT DEFAULT 100,
  ativa BOOLEAN DEFAULT TRUE,
  aplicacoes INT DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4.6  APURAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS apuracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  periodo VARCHAR(7) NOT NULL,
  status VARCHAR(20) DEFAULT 'aberta',
  cbs_debitos DECIMAL(15,2) DEFAULT 0,
  cbs_creditos DECIMAL(15,2) DEFAULT 0,
  cbs_ajustes DECIMAL(15,2) DEFAULT 0,
  cbs_saldo_anterior DECIMAL(15,2) DEFAULT 0,
  cbs_saldo_pagar DECIMAL(15,2) DEFAULT 0,
  cbs_saldo_credor DECIMAL(15,2) DEFAULT 0,
  ibs_est_debitos DECIMAL(15,2) DEFAULT 0,
  ibs_est_creditos DECIMAL(15,2) DEFAULT 0,
  ibs_est_saldo_pagar DECIMAL(15,2) DEFAULT 0,
  ibs_est_saldo_credor DECIMAL(15,2) DEFAULT 0,
  ibs_mun_debitos DECIMAL(15,2) DEFAULT 0,
  ibs_mun_creditos DECIMAL(15,2) DEFAULT 0,
  ibs_mun_saldo_pagar DECIMAL(15,2) DEFAULT 0,
  ibs_mun_saldo_credor DECIMAL(15,2) DEFAULT 0,
  total_docs_entrada INT DEFAULT 0,
  total_docs_saida INT DEFAULT 0,
  total_itens_classificados INT DEFAULT 0,
  total_itens_pendentes INT DEFAULT 0,
  percentual_cbs DECIMAL(8,6) DEFAULT 0.009,
  percentual_ibs DECIMAL(8,6) DEFAULT 0.001,
  fase_transicao VARCHAR(40) DEFAULT 'teste_sem_recolhimento',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, periodo)
);

-- ============================================================
-- 4.7  APURAÇÃO POR ENTE
-- ============================================================
CREATE TABLE IF NOT EXISTS apuracao_por_ente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apuracao_id UUID REFERENCES apuracoes(id) ON DELETE CASCADE,
  tipo_ente VARCHAR(10) CHECK (tipo_ente IN ('ESTADO','MUNICIPIO')),
  uf VARCHAR(2),
  cod_municipio_ibge VARCHAR(7),
  nome_ente VARCHAR(100),
  aliquota DECIMAL(8,4),
  base_calculo DECIMAL(15,2),
  debitos DECIMAL(15,2),
  creditos DECIMAL(15,2),
  saldo_pagar DECIMAL(15,2),
  saldo_credor DECIMAL(15,2)
);

-- ============================================================
-- 4.8  ARQUIVOS SPED
-- ============================================================
CREATE TABLE IF NOT EXISTS arquivos_sped (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  apuracao_id UUID REFERENCES apuracoes(id) ON DELETE CASCADE,
  periodo VARCHAR(7) NOT NULL,
  tipo_sped VARCHAR(20) DEFAULT 'EFD_ICMS_IPI',
  versao_layout VARCHAR(10) DEFAULT '018',
  conteudo_txt TEXT,
  hash_md5 VARCHAR(32),
  status VARCHAR(20) DEFAULT 'gerado',
  gerado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4.9  OBRIGAÇÕES ACESSÓRIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS obrigacoes_acessorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  periodo VARCHAR(7),
  data_vencimento DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_venc ON obrigacoes_acessorias(data_vencimento);

-- ============================================================
-- ConciliaAI — 4.10 PARTICIPANTES (clientes/fornecedores)
-- ============================================================
CREATE TABLE IF NOT EXISTS participantes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  cnpj VARCHAR(18) NOT NULL,
  cpf VARCHAR(14),
  razao_social VARCHAR(150),
  nome_fantasia VARCHAR(100),
  inscricao_estadual VARCHAR(30),
  inscricao_municipal VARCHAR(30),
  uf VARCHAR(2),
  municipio VARCHAR(100),
  cod_municipio_ibge VARCHAR(7),
  endereco VARCHAR(200),
  bairro VARCHAR(80),
  cep VARCHAR(10),
  telefone VARCHAR(30),
  email VARCHAR(150),
  tipo VARCHAR(20) DEFAULT 'fornecedor' CHECK (tipo IN ('cliente','fornecedor','ambos')),
  regime_tributario VARCHAR(30),
  crt VARCHAR(1),
  ativo BOOLEAN DEFAULT TRUE,
  origem VARCHAR(20) DEFAULT 'auto_xml',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, cnpj)
);
CREATE INDEX IF NOT EXISTS idx_participantes_empresa ON participantes(empresa_id);

-- ============================================================
-- ConciliaAI — 4.11 PRODUTOS (catálogo NCM)
-- ============================================================
CREATE TABLE IF NOT EXISTS produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  codigo VARCHAR(60) NOT NULL,
  descricao VARCHAR(300) NOT NULL,
  ncm VARCHAR(8),
  cest VARCHAR(8),
  unidade VARCHAR(10),
  tipo_uso VARCHAR(30) DEFAULT 'REVENDA',
  cfop_padrao_entrada VARCHAR(4),
  cfop_padrao_saida VARCHAR(4),
  aliquota_cbs_padrao DECIMAL(8,4) DEFAULT 8.8000,
  aliquota_ibs_estadual_padrao DECIMAL(8,4) DEFAULT 17.7000,
  aliquota_ibs_municipal_padrao DECIMAL(8,4) DEFAULT 8.8000,
  cst_cbs_padrao VARCHAR(2),
  cst_ibs_padrao VARCHAR(2),
  gera_credito_padrao BOOLEAN DEFAULT TRUE,
  origem VARCHAR(20) DEFAULT 'auto_xml',
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_ncm ON produtos(ncm);

-- ============================================================
-- ConciliaAI — 4.12 DIVERGÊNCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS divergencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES documentos(id) ON DELETE CASCADE,
  item_id UUID REFERENCES itens_documento(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  severidade VARCHAR(10) NOT NULL CHECK (severidade IN ('OK','ATENCAO','CRITICO')),
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT NOT NULL,
  sugestao TEXT,
  status VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('aberta','resolvida','ignorada')),
  resolucao_decisao TEXT,
  resolucao_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_divergencias_empresa ON divergencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_divergencias_status ON divergencias(status);

-- ============================================================
-- ConciliaAI — 4.13 CAPTURA SEFAZ (config)
-- ============================================================
CREATE TABLE IF NOT EXISTS captura_sefaz_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE UNIQUE,
  certificado_a1_nome VARCHAR(150),
  certificado_a1_validade DATE,
  certificado_a1_carregado BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,
  webhook_ativo BOOLEAN DEFAULT FALSE,
  pooling_ativo BOOLEAN DEFAULT FALSE,
  pooling_intervalo_min INT DEFAULT 60,
  ultima_execucao TIMESTAMPTZ,
  ultimo_status VARCHAR(20),
  ultimo_erro TEXT,
  total_capturados INT DEFAULT 0,
  modo VARCHAR(20) DEFAULT 'POOLING',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ConciliaAI — 4.14 ASSISTENTE IA (histórico)
-- ============================================================
CREATE TABLE IF NOT EXISTS assistente_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresa(id) ON DELETE CASCADE,
  pergunta TEXT NOT NULL,
  resposta_resumo TEXT,
  intent VARCHAR(50),
  resultado_json JSONB,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assistente_empresa ON assistente_historico(empresa_id);

-- ============================================================
-- SEED — Alíquotas base por UF (2026)
-- ============================================================
INSERT INTO aliquotas_ibs (uf, ano, aliquota_estadual, aliquota_municipal, vigencia_inicio)
VALUES
  ('AC',2026,17.7000,8.8000,'2026-01-01'),('AL',2026,17.7000,8.8000,'2026-01-01'),
  ('AP',2026,17.7000,8.8000,'2026-01-01'),('AM',2026,17.7000,8.8000,'2026-01-01'),
  ('BA',2026,17.7000,8.8000,'2026-01-01'),('CE',2026,17.7000,8.8000,'2026-01-01'),
  ('DF',2026,17.7000,8.8000,'2026-01-01'),('ES',2026,17.7000,8.8000,'2026-01-01'),
  ('GO',2026,17.7000,8.8000,'2026-01-01'),('MA',2026,17.7000,8.8000,'2026-01-01'),
  ('MT',2026,17.7000,8.8000,'2026-01-01'),('MS',2026,17.7000,8.8000,'2026-01-01'),
  ('MG',2026,17.7000,8.8000,'2026-01-01'),('PA',2026,17.7000,8.8000,'2026-01-01'),
  ('PB',2026,17.7000,8.8000,'2026-01-01'),('PR',2026,17.7000,8.8000,'2026-01-01'),
  ('PE',2026,17.7000,8.8000,'2026-01-01'),('PI',2026,17.7000,8.8000,'2026-01-01'),
  ('RJ',2026,17.7000,8.8000,'2026-01-01'),('RN',2026,17.7000,8.8000,'2026-01-01'),
  ('RS',2026,17.7000,8.8000,'2026-01-01'),('RO',2026,17.7000,8.8000,'2026-01-01'),
  ('RR',2026,17.7000,8.8000,'2026-01-01'),('SC',2026,17.7000,8.8000,'2026-01-01'),
  ('SP',2026,17.7000,8.8000,'2026-01-01'),('SE',2026,17.7000,8.8000,'2026-01-01'),
  ('TO',2026,17.7000,8.8000,'2026-01-01')
ON CONFLICT DO NOTHING;

-- ============================================================
-- RLS (Row Level Security) — abre tudo para anon (uso interno)
-- Em produção, configurar policies por empresa_id/usuário.
-- ============================================================
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE escritorio_contabil ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_classificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE apuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE apuracao_por_ente ENABLE ROW LEVEL SECURITY;
ALTER TABLE arquivos_sped ENABLE ROW LEVEL SECURITY;
ALTER TABLE obrigacoes_acessorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE aliquotas_ibs ENABLE ROW LEVEL SECURITY;
ALTER TABLE participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE divergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE captura_sefaz_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistente_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_empresa ON empresa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_escritorio ON escritorio_contabil FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_doc ON documentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_itens ON itens_documento FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_regras ON regras_classificacao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_apur ON apuracoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_apur_ente ON apuracao_por_ente FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_sped ON arquivos_sped FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_obrig ON obrigacoes_acessorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_aliq ON aliquotas_ibs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_participantes ON participantes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_produtos ON produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_divergencias ON divergencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_captura ON captura_sefaz_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_assistente ON assistente_historico FOR ALL USING (true) WITH CHECK (true);
