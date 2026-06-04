// Tipos globais do sistema IBS/CBS Fiscal — ConciliaAI

export type RegimeTributario =
  | "LUCRO_REAL"
  | "LUCRO_PRESUMIDO"
  | "SIMPLES_NACIONAL"
  | "MEI";

export type DirecaoDoc = "ENTRADA" | "SAIDA";
export type TipoDoc = "NFe" | "CTe" | "NFSe";
export type CRT = "1" | "2" | "3";

export type NaturezaOperacao =
  | "REVENDA"
  | "INSUMO"
  | "ATIVO_IMOB"
  | "USO_CONSUMO"
  | "FRETE"
  | "SERVICO"
  | "USO_PESSOAL"
  | "BENEFICIO_RH";

export type StatusItem = "pendente" | "classificado" | "critico" | "parcial";
export type StatusApuracao = "aberta" | "fechada" | "transmitida";
export type StatusObrigacao = "pendente" | "em_preparo" | "entregue" | "atrasada";
export type StatusSped = "gerado" | "validado" | "transmitido" | "rejeitado";
export type TipoSped = "EFD_ICMS_IPI" | "EFD_CONTRIBUICOES";
export type TipoEstabelecimento = "INDUSTRIAL" | "EQUIPARADO" | "COMERCIAL" | "PRESTADOR_SERVICO";

export type FaseTransicao =
  | "teste_sem_recolhimento"
  | "inicio_recolhimento"
  | "pis_cofins_reduzido_25"
  | "pis_cofins_reduzido_50"
  | "pis_cofins_reduzido_75"
  | "icms_iss_reduzido_10"
  | "icms_iss_reduzido_40"
  | "aliquota_plena";

export interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  uf: string;
  municipio: string;
  cod_municipio_ibge: string;
  regime_tributario: RegimeTributario;
  regime_pis_cofins: "cumulativo" | "nao_cumulativo";
  crt: CRT;
  regime_ibs_cbs: string;
  setor_diferenciado?: string | null;
  simples_opta_destaque_ibs: boolean;
  is_mei: boolean;
  faturamento_anual_estimado?: number | null;
  aliquota_cbs: number;
  aliquota_ibs_estadual: number;
  aliquota_ibs_municipal: number;
  ano_vigencia_aliquota: number;
  // ICMS/IPI (v4)
  tipo_estabelecimento?: TipoEstabelecimento | null;
  contribuinte_ipi?: boolean;
  contribuinte_icms?: boolean;
  inscricao_estadual?: string | null;
  certificado_a1_path?: string | null;
  certificado_vencimento?: string | null;
  criado_em?: string;
}

export interface Filial {
  id: string;
  empresa_id: string;
  cnpj: string;
  razao_social?: string | null;
  uf: string;
  municipio?: string | null;
  cod_municipio_ibge?: string | null;
  inscricao_estadual?: string | null;
  ativa: boolean;
  criado_em?: string;
}

export interface Documento {
  id: string;
  empresa_id: string;
  tipo: TipoDoc;
  chave_acesso: string;
  numero_doc?: string | null;
  serie?: string | null;
  data_emissao: string;
  data_entrada_saida?: string | null;
  cnpj_emitente: string;
  razao_emitente?: string | null;
  cnpj_destinatario?: string | null;
  uf_emitente?: string | null;
  uf_destinatario?: string | null;
  municipio_emitente?: string | null;
  municipio_destinatario?: string | null;
  cfop_principal?: string | null;
  direcao: DirecaoDoc;
  crt_emitente?: CRT | null;
  tipo_credito_fornecedor?:
    | "integral"
    | "presumido_sn"
    | "sem_credito_mei"
    | "nao_aplicavel"
    | null;
  valor_total: number;
  valor_produtos: number;
  valor_frete: number;
  valor_ipi: number;
  valor_icms: number;
  valor_pis: number;
  valor_cofins: number;
  valor_cbs_documento: number;
  valor_ibs_documento: number;
  xml_original?: string | null;
  status_classificacao: "pendente" | "parcial" | "classificado" | "critico";
  periodo_competencia: string; // YYYY-MM
  criado_em?: string;
}

export interface ItemDocumento {
  id: string;
  documento_id: string;
  numero_item: number;
  codigo_produto?: string | null;
  descricao: string;
  ncm?: string | null;
  cfop?: string | null;
  unidade?: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  // tradicionais
  cst_icms?: string | null;
  valor_icms: number;
  aliquota_icms: number;
  cst_ipi?: string | null;
  valor_ipi: number;
  cst_pis?: string | null;
  valor_pis: number;
  aliquota_pis: number;
  cst_cofins?: string | null;
  valor_cofins: number;
  aliquota_cofins: number;
  // IBS/CBS
  cst_cbs?: string | null;
  cst_ibs?: string | null;
  aliquota_cbs: number;
  aliquota_ibs_estadual: number;
  aliquota_ibs_municipal: number;
  valor_cbs_ofertado: number;
  valor_ibs_est_ofertado: number;
  valor_ibs_mun_ofertado: number;
  valor_credito_cbs: number;
  valor_credito_ibs_est: number;
  valor_credito_ibs_mun: number;
  base_calculo_cbs: number;
  base_calculo_ibs: number;
  tipo_calculo_credito: "destacado" | "presumido" | "zero";
  aliquota_presumida_cbs: number;
  aliquota_presumida_ibs: number;
  // Classificação
  natureza_operacao?: NaturezaOperacao | null;
  gera_credito: boolean;
  motivo_vedacao_credito?: string | null;
  classificado_por?: "auto" | "manual" | "regra" | null;
  regra_aplicada_id?: string | null;
  status_item: StatusItem;
  observacao_credito?: string | null;
  criado_em?: string;
}

export interface RegraClassificacao {
  id: string;
  empresa_id: string;
  descricao?: string | null;
  ncm_prefixo?: string | null;
  cfop?: string | null;
  uf_emitente?: string | null;
  cnpj_emitente?: string | null;
  direcao?: DirecaoDoc | null;
  crt_emitente?: CRT | null;
  regime_tributario_emitente?: RegimeTributario | null;
  natureza_contem?: string | null;
  cst_cbs_destino?: string | null;
  cst_ibs_destino?: string | null;
  natureza_destino?: NaturezaOperacao | null;
  tipo_uso_destino?: TipoUsoProduto | null;
  gera_credito?: boolean | null;
  motivo_vedacao?: string | null;
  origem: "manual" | "auto_aprendida";
  prioridade: number;
  ativa: boolean;
  aplicacoes: number;
  criado_em?: string;
}

export interface Apuracao {
  id: string;
  empresa_id: string;
  periodo: string; // YYYY-MM
  status: StatusApuracao;
  cbs_debitos: number;
  cbs_creditos: number;
  cbs_ajustes: number;
  cbs_saldo_anterior: number;
  cbs_saldo_pagar: number;
  cbs_saldo_credor: number;
  ibs_est_debitos: number;
  ibs_est_creditos: number;
  ibs_est_saldo_pagar: number;
  ibs_est_saldo_credor: number;
  ibs_mun_debitos: number;
  ibs_mun_creditos: number;
  ibs_mun_saldo_pagar: number;
  ibs_mun_saldo_credor: number;
  total_docs_entrada: number;
  total_docs_saida: number;
  total_itens_classificados: number;
  total_itens_pendentes: number;
  percentual_cbs: number;
  percentual_ibs: number;
  fase_transicao: FaseTransicao;
}

export interface ApuracaoPorEnte {
  id: string;
  apuracao_id: string;
  tipo_ente: "ESTADO" | "MUNICIPIO";
  uf?: string | null;
  cod_municipio_ibge?: string | null;
  nome_ente?: string | null;
  aliquota: number;
  base_calculo: number;
  debitos: number;
  creditos: number;
  saldo_pagar: number;
  saldo_credor: number;
}

export interface ArquivoSped {
  id: string;
  empresa_id: string;
  apuracao_id: string;
  periodo: string;
  tipo_sped: string;
  versao_layout: string;
  conteudo_txt: string;
  hash_md5?: string | null;
  status: StatusSped;
  gerado_em?: string;
}

export interface ObrigacaoAcessoria {
  id: string;
  empresa_id: string;
  tipo: string;
  periodo?: string | null;
  data_vencimento: string;
  status: StatusObrigacao;
  observacao?: string | null;
  criado_em?: string;
}

export interface AliquotaIbs {
  id: string;
  uf: string;
  cod_municipio_ibge?: string | null;
  ano: number;
  aliquota_estadual: number;
  aliquota_municipal: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
}

// ============== ConciliaAI — novas entidades ==============

export interface EscritorioContabil {
  id: string;
  nome: string;
  cnpj: string;
  responsavel?: string | null;
  email?: string | null;
  telefone?: string | null;
  // White label
  logo_url?: string | null;
  cor_primaria: string;       // ex: #2563eb
  cor_secundaria?: string | null;
  slug?: string | null;       // subdomínio sugerido
  criado_em?: string;
}

export type TipoParticipante = "cliente" | "fornecedor" | "ambos";

export interface Participante {
  id: string;
  empresa_id: string;          // empresa (cliente do escritório) à qual pertence
  cnpj: string;                // ou CPF
  cpf?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  uf?: string | null;
  municipio?: string | null;
  cod_municipio_ibge?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
  tipo: TipoParticipante;
  regime_tributario?: RegimeTributario | null;
  crt?: CRT | null;
  ativo: boolean;
  origem: "auto_xml" | "manual";
  criado_em?: string;
}

export type TipoUsoProduto =
  | "REVENDA"
  | "INSUMO"            // matéria-prima
  | "USO_CONSUMO"
  | "ATIVO_IMOB"
  | "USO_PESSOAL"
  | "BENEFICIO_RH"
  | "SERVICO";

export interface Produto {
  id: string;
  empresa_id: string;
  codigo: string;          // cProd da NF-e
  descricao: string;
  ncm?: string | null;
  cest?: string | null;
  unidade?: string | null;
  tipo_uso: TipoUsoProduto;
  cfop_padrao_entrada?: string | null;
  cfop_padrao_saida?: string | null;
  aliquota_cbs_padrao: number;
  aliquota_ibs_estadual_padrao: number;
  aliquota_ibs_municipal_padrao: number;
  cst_cbs_padrao?: string | null;
  cst_ibs_padrao?: string | null;
  gera_credito_padrao: boolean;
  origem: "auto_xml" | "manual";
  ativo: boolean;
  criado_em?: string;
}

export type SeveridadeDivergencia = "OK" | "ATENCAO" | "CRITICO";

export interface Divergencia {
  id: string;
  empresa_id: string;
  documento_id?: string | null;
  item_id?: string | null;
  tipo:
    | "ITEM_SEM_CLASSIFICACAO"
    | "NCM_INEXISTENTE"
    | "FORNECEDOR_DESCONHECIDO"
    | "CFOP_INCONSISTENTE"
    | "CST_VEDADO_COM_CREDITO"
    | "ALIQUOTA_DIVERGENTE"
    | "VALOR_DESTACADO_DIVERGENTE"
    | "DOC_DUPLICADO"
    | "DOC_FORA_PERIODO"
    | "OUTROS";
  severidade: SeveridadeDivergencia;
  titulo: string;
  descricao: string;
  sugestao?: string | null;
  status: "aberta" | "resolvida" | "ignorada";
  resolucao_decisao?: string | null;  // o que o contador decidiu
  resolucao_em?: string | null;
  criado_em?: string;
}

export interface CapturaSefazConfig {
  id: string;
  empresa_id: string;
  certificado_a1_nome?: string | null;
  certificado_a1_validade?: string | null;
  certificado_a1_carregado: boolean;
  webhook_url?: string | null;
  webhook_ativo: boolean;
  pooling_ativo: boolean;
  pooling_intervalo_min: number;     // em minutos
  ultima_execucao?: string | null;
  ultimo_status?: string | null;     // ok | erro
  ultimo_erro?: string | null;
  total_capturados: number;
  modo: "WEBHOOK" | "POOLING" | "AMBOS";
  criado_em?: string;
}

export interface AssistenteHistorico {
  id: string;
  empresa_id: string;
  pergunta: string;
  resposta_resumo: string;
  intent: string;
  resultado_json?: any;
  criado_em?: string;
}
