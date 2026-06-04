// Tabela base de alíquotas IBS por UF (estimadas — sujeitas a regulamentação do Comitê Gestor)
export interface AliquotaUF {
  uf: string;
  nome: string;
  estadual: number;
  municipal_padrao: number;
}

export const ALIQUOTAS_BASE_UF: AliquotaUF[] = [
  { uf: "AC", nome: "Acre", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "AL", nome: "Alagoas", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "AP", nome: "Amapá", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "AM", nome: "Amazonas", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "BA", nome: "Bahia", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "CE", nome: "Ceará", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "DF", nome: "Distrito Federal", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "ES", nome: "Espírito Santo", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "GO", nome: "Goiás", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "MA", nome: "Maranhão", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "MT", nome: "Mato Grosso", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "MS", nome: "Mato Grosso do Sul", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "MG", nome: "Minas Gerais", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "PA", nome: "Pará", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "PB", nome: "Paraíba", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "PR", nome: "Paraná", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "PE", nome: "Pernambuco", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "PI", nome: "Piauí", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "RJ", nome: "Rio de Janeiro", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "RN", nome: "Rio Grande do Norte", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "RS", nome: "Rio Grande do Sul", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "RO", nome: "Rondônia", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "RR", nome: "Roraima", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "SC", nome: "Santa Catarina", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "SP", nome: "São Paulo", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "SE", nome: "Sergipe", estadual: 17.7, municipal_padrao: 8.8 },
  { uf: "TO", nome: "Tocantins", estadual: 17.7, municipal_padrao: 8.8 },
];

export const ALIQUOTA_CBS_PADRAO = 8.8;

// Crédito presumido para fornecedor SN sem destaque
export const ALIQ_PRESUMIDA_CBS_SN = 3.0;
export const ALIQ_PRESUMIDA_IBS_SN = 1.2;

export function buscarAliquotaUF(uf: string): AliquotaUF | undefined {
  return ALIQUOTAS_BASE_UF.find((a) => a.uf === uf);
}

// CSTs IBS/CBS conforme escopo
export const CSTS_CBS_SAIDA = [
  { cst: "01", desc: "Tributado — alíquota padrão", gera_debito: true },
  { cst: "02", desc: "Tributado — alíquota reduzida (básicos)", gera_debito: true },
  { cst: "03", desc: "Tributado — alíquota reduzida (educação/saúde)", gera_debito: true },
  { cst: "04", desc: "Isenta", gera_debito: false },
  { cst: "05", desc: "Suspensão", gera_debito: false },
  { cst: "06", desc: "Imune", gera_debito: false },
  { cst: "07", desc: "Não incidente", gera_debito: false },
  { cst: "40", desc: "Simples Nacional (DAS)", gera_debito: false },
  { cst: "99", desc: "Regime diferenciado específico", gera_debito: true },
] as const;

export const CSTS_ENTRADA = [
  { cst: "40", desc: "Crédito presumido — Simples Nacional", credito: "parcial" },
  { cst: "41", desc: "Crédito integral — entrada para revenda", credito: "integral" },
  { cst: "42", desc: "Crédito integral — entrada como insumo", credito: "integral" },
  { cst: "43", desc: "Crédito proporcional — uso misto", credito: "proporcional" },
  { cst: "44", desc: "Crédito diferido — ativo imobilizado", credito: "integral_imediato" },
  { cst: "70", desc: "Sem crédito — uso pessoal", credito: "zero" },
  { cst: "71", desc: "Sem crédito — benefício a empregado", credito: "zero" },
  { cst: "72", desc: "Sem crédito — operação isenta/imune", credito: "zero" },
] as const;

export const NATUREZAS_OPERACAO = [
  { codigo: "REVENDA", desc: "Revenda", cst_entrada: "41", credito: true },
  { codigo: "INSUMO", desc: "Insumo (matéria-prima/embalagem)", cst_entrada: "42", credito: true },
  { codigo: "ATIVO_IMOB", desc: "Ativo imobilizado", cst_entrada: "44", credito: true },
  { codigo: "USO_CONSUMO", desc: "Uso e consumo", cst_entrada: "42", credito: true },
  { codigo: "FRETE", desc: "Frete vinculado à atividade-fim", cst_entrada: "42", credito: true },
  { codigo: "SERVICO", desc: "Serviço como insumo", cst_entrada: "42", credito: true },
  { codigo: "USO_PESSOAL", desc: "Uso pessoal", cst_entrada: "70", credito: false },
  { codigo: "BENEFICIO_RH", desc: "Benefício a empregado", cst_entrada: "71", credito: false },
] as const;
