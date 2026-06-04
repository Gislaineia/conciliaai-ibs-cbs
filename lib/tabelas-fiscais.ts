/**
 * Tabelas fiscais — ICMS / IPI / NCM / CEST / CFOP
 * Base oficial RFB / Confaz, simplificada para o MVP.
 * Atualizações futuras via API ou carga periódica.
 */

// ============== CSTs ICMS (Tabela B Confaz) ==============
export interface CstIcms {
  cst: string;
  descricao: string;
  origem?: string;     // tributação | isenta | nao_incidente | suspensao | substituicao_tributaria
  gera_credito_entrada: boolean;
  gera_debito_saida: boolean;
}

export const CSTS_ICMS_NORMAL: CstIcms[] = [
  { cst: "00", descricao: "Tributada integralmente", origem: "tributacao", gera_credito_entrada: true, gera_debito_saida: true },
  { cst: "10", descricao: "Tributada e com cobrança do ICMS por ST", origem: "tributacao", gera_credito_entrada: true, gera_debito_saida: true },
  { cst: "20", descricao: "Com redução de base de cálculo", origem: "tributacao", gera_credito_entrada: true, gera_debito_saida: true },
  { cst: "30", descricao: "Isenta/não tributada com cobrança do ICMS por ST", origem: "isenta", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "40", descricao: "Isenta", origem: "isenta", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "41", descricao: "Não tributada", origem: "nao_incidente", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "50", descricao: "Suspensão", origem: "suspensao", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "51", descricao: "Diferimento", origem: "diferimento", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "60", descricao: "ICMS cobrado anteriormente por ST", origem: "substituicao_tributaria", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "70", descricao: "Com redução de base de cálculo e cobrança do ICMS por ST", origem: "tributacao", gera_credito_entrada: true, gera_debito_saida: true },
  { cst: "90", descricao: "Outras", origem: "outras", gera_credito_entrada: true, gera_debito_saida: true },
];

// CSOSN — Simples Nacional (Tabela C)
export const CSOSN_SN: CstIcms[] = [
  { cst: "101", descricao: "Tributada pelo Simples com permissão de crédito", gera_credito_entrada: true, gera_debito_saida: false },
  { cst: "102", descricao: "Tributada pelo Simples sem permissão de crédito", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "103", descricao: "Isenção do ICMS no Simples para faixa de receita bruta", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "201", descricao: "Tributada pelo Simples com permissão de crédito e ST", gera_credito_entrada: true, gera_debito_saida: false },
  { cst: "202", descricao: "Tributada pelo Simples sem permissão de crédito e com ST", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "203", descricao: "Isenção do ICMS no Simples para faixa de receita e ST", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "300", descricao: "Imune", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "400", descricao: "Não tributada pelo Simples Nacional", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "500", descricao: "ICMS cobrado anteriormente por ST ou por antecipação", gera_credito_entrada: false, gera_debito_saida: false },
  { cst: "900", descricao: "Outros", gera_credito_entrada: false, gera_debito_saida: false },
];

// ============== CSTs IPI ==============
export interface CstIpi {
  cst: string;
  descricao: string;
  tipo: "entrada" | "saida";
  gera_credito: boolean;
  gera_debito: boolean;
}

export const CSTS_IPI: CstIpi[] = [
  // Entradas
  { cst: "00", descricao: "Entrada com recuperação de imposto", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "01", descricao: "Entrada tributada com alíquota zero", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "02", descricao: "Entrada isenta", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "03", descricao: "Entrada não tributada", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "04", descricao: "Entrada imune", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "05", descricao: "Entrada com suspensão", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "49", descricao: "Outras entradas", tipo: "entrada", gera_credito: false, gera_debito: false },
  // Saídas
  { cst: "50", descricao: "Saída tributada", tipo: "saida", gera_credito: false, gera_debito: true },
  { cst: "51", descricao: "Saída tributada com alíquota zero", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "52", descricao: "Saída isenta", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "53", descricao: "Saída não tributada", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "54", descricao: "Saída imune", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "55", descricao: "Saída com suspensão", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "99", descricao: "Outras saídas", tipo: "saida", gera_credito: false, gera_debito: false },
];

// ============== CSTs PIS/COFINS ==============
export interface CstPisCofins {
  cst: string;
  descricao: string;
  tipo: "entrada" | "saida" | "ambos";
  gera_credito: boolean;
  gera_debito: boolean;
}

export const CSTS_PIS_COFINS: CstPisCofins[] = [
  { cst: "01", descricao: "Operação Tributável (alíquota normal — cumulativo/não cumulativo)", tipo: "saida", gera_credito: false, gera_debito: true },
  { cst: "02", descricao: "Operação Tributável (alíquota diferenciada)", tipo: "saida", gera_credito: false, gera_debito: true },
  { cst: "03", descricao: "Operação Tributável (qtde vendida × alíquota por unidade)", tipo: "saida", gera_credito: false, gera_debito: true },
  { cst: "04", descricao: "Operação Tributável Monofásica — Revenda a Alíquota Zero", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "05", descricao: "Operação Tributável por Substituição Tributária", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "06", descricao: "Operação Tributável a Alíquota Zero", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "07", descricao: "Operação Isenta da Contribuição", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "08", descricao: "Operação sem Incidência da Contribuição", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "09", descricao: "Operação com Suspensão da Contribuição", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "49", descricao: "Outras Operações de Saída", tipo: "saida", gera_credito: false, gera_debito: false },
  { cst: "50", descricao: "Op. com Direito a Crédito — Vinculada a Receita Tributada no Mercado Interno", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "51", descricao: "Op. com Direito a Crédito — Vinculada a Receita Não Tributada", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "52", descricao: "Op. com Direito a Crédito — Vinculada a Receita de Exportação", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "53", descricao: "Op. com Direito a Crédito — Vinculada a Receitas Tributadas e Não Tributadas", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "54", descricao: "Op. com Direito a Crédito — Vinculada a Receitas Tributadas e Exportação", tipo: "entrada", gera_credito: true, gera_debito: false },
  { cst: "70", descricao: "Operação de Aquisição sem Direito a Crédito", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "73", descricao: "Operação de Aquisição com Suspensão", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "74", descricao: "Operação de Aquisição a Alíquota Zero", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "75", descricao: "Operação de Aquisição por Substituição Tributária", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "98", descricao: "Outras Operações de Entrada", tipo: "entrada", gera_credito: false, gera_debito: false },
  { cst: "99", descricao: "Outras Operações", tipo: "ambos", gera_credito: false, gera_debito: false },
];

// ============== Alíquotas ICMS interestaduais ==============
// Origem -> Destino: 7% (Sul/Sudeste -> N/NE/CO/ES) | 12% (demais) | 4% (importados)
export function aliquotaIcmsInterestadual(ufOrigem: string, ufDestino: string, importado = false): number {
  if (importado) return 4;
  const sulSudeste = ["SP", "RJ", "MG", "ES", "PR", "SC", "RS"];
  const norteNordesteCoEs = ["AC", "AL", "AP", "AM", "BA", "CE", "ES", "GO", "MA", "MT", "MS", "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO", "DF"];
  if (sulSudeste.includes(ufOrigem) && norteNordesteCoEs.includes(ufDestino)) return 7;
  return 12;
}

// Alíquotas internas padrão por UF (mais comuns — varia por produto)
export const ALIQ_ICMS_INTERNA_UF: Record<string, number> = {
  AC: 19, AL: 18, AP: 18, AM: 18, BA: 19, CE: 18, DF: 18, ES: 17, GO: 17,
  MA: 18, MT: 17, MS: 17, MG: 18, PA: 19, PB: 18, PR: 19, PE: 18, PI: 18,
  RJ: 20, RN: 18, RS: 17, RO: 17.5, RR: 17, SC: 17, SP: 18, SE: 18, TO: 18,
};

// ============== TIPI (Tabela de Incidência IPI) — amostra por capítulo NCM ==============
// Estrutura: 2 primeiros dígitos do NCM = capítulo
export interface TipiEntry {
  ncm_prefix: string;
  descricao_capitulo: string;
  aliquota_padrao: number;     // % (-1 = NT, 0 = alíquota zero)
  observacao?: string;
}

export const TIPI_AMOSTRA: TipiEntry[] = [
  { ncm_prefix: "01", descricao_capitulo: "Animais vivos", aliquota_padrao: -1, observacao: "NT" },
  { ncm_prefix: "02", descricao_capitulo: "Carnes e miudezas", aliquota_padrao: 0 },
  { ncm_prefix: "03", descricao_capitulo: "Peixes e crustáceos", aliquota_padrao: 0 },
  { ncm_prefix: "04", descricao_capitulo: "Leite e laticínios", aliquota_padrao: 0 },
  { ncm_prefix: "10", descricao_capitulo: "Cereais", aliquota_padrao: -1, observacao: "NT" },
  { ncm_prefix: "11", descricao_capitulo: "Produtos da indústria de moagem", aliquota_padrao: 0 },
  { ncm_prefix: "15", descricao_capitulo: "Gorduras e óleos animais e vegetais", aliquota_padrao: 0 },
  { ncm_prefix: "17", descricao_capitulo: "Açúcares e produtos de confeitaria", aliquota_padrao: 5 },
  { ncm_prefix: "19", descricao_capitulo: "Preparações à base de cereais", aliquota_padrao: 0 },
  { ncm_prefix: "20", descricao_capitulo: "Preparações de produtos hortícolas", aliquota_padrao: 0 },
  { ncm_prefix: "22", descricao_capitulo: "Bebidas, líquidos alcoólicos e vinagres", aliquota_padrao: 10 },
  { ncm_prefix: "24", descricao_capitulo: "Tabaco e seus sucedâneos", aliquota_padrao: 30 },
  { ncm_prefix: "27", descricao_capitulo: "Combustíveis minerais, óleos minerais", aliquota_padrao: 0 },
  { ncm_prefix: "28", descricao_capitulo: "Produtos químicos inorgânicos", aliquota_padrao: 0 },
  { ncm_prefix: "29", descricao_capitulo: "Produtos químicos orgânicos", aliquota_padrao: 0 },
  { ncm_prefix: "30", descricao_capitulo: "Produtos farmacêuticos", aliquota_padrao: 0 },
  { ncm_prefix: "33", descricao_capitulo: "Óleos essenciais e perfumaria", aliquota_padrao: 22 },
  { ncm_prefix: "39", descricao_capitulo: "Plásticos e suas obras", aliquota_padrao: 5 },
  { ncm_prefix: "40", descricao_capitulo: "Borracha e suas obras", aliquota_padrao: 8 },
  { ncm_prefix: "44", descricao_capitulo: "Madeira e obras", aliquota_padrao: 0 },
  { ncm_prefix: "48", descricao_capitulo: "Papel e cartão", aliquota_padrao: 0 },
  { ncm_prefix: "61", descricao_capitulo: "Vestuário de malha", aliquota_padrao: 0 },
  { ncm_prefix: "62", descricao_capitulo: "Vestuário não malha", aliquota_padrao: 0 },
  { ncm_prefix: "64", descricao_capitulo: "Calçados", aliquota_padrao: 5 },
  { ncm_prefix: "70", descricao_capitulo: "Vidro e suas obras", aliquota_padrao: 5 },
  { ncm_prefix: "72", descricao_capitulo: "Ferro fundido, ferro e aço", aliquota_padrao: 5 },
  { ncm_prefix: "73", descricao_capitulo: "Obras de ferro ou aço", aliquota_padrao: 5 },
  { ncm_prefix: "84", descricao_capitulo: "Reatores nucleares, máquinas e aparelhos mecânicos", aliquota_padrao: 5 },
  { ncm_prefix: "85", descricao_capitulo: "Máquinas e aparelhos elétricos", aliquota_padrao: 10 },
  { ncm_prefix: "87", descricao_capitulo: "Veículos automóveis", aliquota_padrao: 13 },
  { ncm_prefix: "8703", descricao_capitulo: "Automóveis de passageiros", aliquota_padrao: 25 },
  { ncm_prefix: "94", descricao_capitulo: "Móveis", aliquota_padrao: 5 },
  { ncm_prefix: "9504", descricao_capitulo: "Jogos e brinquedos", aliquota_padrao: 30 },
];

export function buscarAliquotaIPI(ncm?: string | null): number {
  if (!ncm) return 0;
  const sorted = [...TIPI_AMOSTRA].sort((a, b) => b.ncm_prefix.length - a.ncm_prefix.length);
  const found = sorted.find((t) => ncm.startsWith(t.ncm_prefix));
  return found?.aliquota_padrao ?? 0;
}

// ============== CEST (Código Especificador da Substituição Tributária) — amostra ==============
export interface CestEntry {
  cest: string;
  ncm_prefix: string;
  descricao: string;
  segmento: string;
}

export const CEST_AMOSTRA: CestEntry[] = [
  { cest: "01.001.00", ncm_prefix: "8703", descricao: "Automóveis de passageiros", segmento: "Autopeças/Veículos" },
  { cest: "01.002.00", ncm_prefix: "8704", descricao: "Veículos para transporte de mercadorias", segmento: "Autopeças/Veículos" },
  { cest: "03.001.00", ncm_prefix: "2202", descricao: "Refrigerantes e bebidas energéticas", segmento: "Bebidas" },
  { cest: "03.002.00", ncm_prefix: "2203", descricao: "Cervejas e chopes", segmento: "Bebidas" },
  { cest: "07.001.00", ncm_prefix: "2402", descricao: "Cigarros, cigarrilhas, charutos", segmento: "Tabaco" },
  { cest: "10.001.00", ncm_prefix: "2710", descricao: "Combustíveis e lubrificantes", segmento: "Combustíveis" },
  { cest: "11.001.00", ncm_prefix: "3304", descricao: "Cosméticos e produtos de higiene pessoal", segmento: "Cosméticos" },
  { cest: "12.001.00", ncm_prefix: "1905", descricao: "Produtos alimentícios — bolos, biscoitos", segmento: "Alimentos" },
  { cest: "17.001.00", ncm_prefix: "8516", descricao: "Aparelhos eletrodomésticos", segmento: "Eletrodomésticos" },
  { cest: "21.001.00", ncm_prefix: "8517", descricao: "Equipamentos de telefonia", segmento: "Telecom" },
];

export function buscarCEST(ncm?: string | null): CestEntry | undefined {
  if (!ncm) return undefined;
  const sorted = [...CEST_AMOSTRA].sort((a, b) => b.ncm_prefix.length - a.ncm_prefix.length);
  return sorted.find((c) => ncm.startsWith(c.ncm_prefix));
}

// ============== CFOP — descrições mais comuns ==============
export const CFOP_DESCRICOES: Record<string, string> = {
  "1101": "Compra para industrialização ou produção rural",
  "1102": "Compra para comercialização",
  "1124": "Industrialização efetuada por outra empresa",
  "1551": "Compra de bem para o ativo imobilizado",
  "1556": "Compra de material para uso ou consumo",
  "1933": "Aquisição de serviço tributado pelo ISS",
  "1949": "Outra entrada de mercadoria ou prestação de serviço não especificada",
  "2101": "Compra para industrialização ou produção rural (interestadual)",
  "2102": "Compra para comercialização (interestadual)",
  "2551": "Compra de bem para o ativo imobilizado (interestadual)",
  "2556": "Compra de material para uso ou consumo (interestadual)",
  "5101": "Venda de produção do estabelecimento",
  "5102": "Venda de mercadoria adquirida ou recebida de terceiros",
  "5405": "Venda com substituição tributária — ICMS retido",
  "5910": "Remessa em bonificação, doação ou brinde",
  "5933": "Prestação de serviço tributado pelo ISSQN",
  "6101": "Venda de produção do estabelecimento (interestadual)",
  "6102": "Venda de mercadoria adquirida ou recebida de terceiros (interestadual)",
  "6108": "Venda destinada a não contribuinte (interestadual — DIFAL)",
  "6404": "Venda de mercadoria sujeita ao regime de ST",
  "7101": "Venda de produção do estabelecimento — exterior",
  "7102": "Venda de mercadoria — exterior",
};

// MVA (Margem de Valor Agregado) base — usado para cálculo ICMS-ST
// Valores estimados, devem ser atualizados conforme convênio ICMS por UF/segmento.
export interface MvaEntry {
  ncm_prefix: string;
  segmento: string;
  mva_original: number;     // % MVA original
  mva_ajustada_4?: number;  // MVA ajustada para alíquota interestadual 4%
  mva_ajustada_7?: number;
  mva_ajustada_12?: number;
}

export const MVA_AMOSTRA: MvaEntry[] = [
  { ncm_prefix: "2202", segmento: "Refrigerantes", mva_original: 70, mva_ajustada_7: 80, mva_ajustada_12: 73 },
  { ncm_prefix: "2203", segmento: "Cervejas", mva_original: 140, mva_ajustada_7: 156, mva_ajustada_12: 145 },
  { ncm_prefix: "2402", segmento: "Cigarros", mva_original: 50, mva_ajustada_7: 58, mva_ajustada_12: 52 },
  { ncm_prefix: "2710", segmento: "Combustíveis", mva_original: 30, mva_ajustada_7: 35, mva_ajustada_12: 31 },
  { ncm_prefix: "3304", segmento: "Cosméticos", mva_original: 50, mva_ajustada_7: 58, mva_ajustada_12: 52 },
  { ncm_prefix: "8516", segmento: "Eletrodomésticos", mva_original: 40, mva_ajustada_7: 47, mva_ajustada_12: 42 },
];
