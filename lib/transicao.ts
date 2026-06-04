import type { FaseTransicao } from "@/types";

export interface PercentualTransicao {
  cbs: number; // fração 0..1 (ex: 0.009 = 0,9%)
  ibs: number;
  fase: FaseTransicao;
  descricao: string;
}

const TABELA: Record<number, PercentualTransicao> = {
  2026: { cbs: 0.009, ibs: 0.001, fase: "teste_sem_recolhimento", descricao: "Fase de teste — sem recolhimento efetivo" },
  2027: { cbs: 0.009, ibs: 0.001, fase: "inicio_recolhimento", descricao: "Início do recolhimento efetivo" },
  2028: { cbs: 0.009, ibs: 0.001, fase: "pis_cofins_reduzido_25", descricao: "PIS/COFINS reduzido 25%" },
  2029: { cbs: 0.022, ibs: 0.003, fase: "pis_cofins_reduzido_50", descricao: "PIS/COFINS reduzido 50%" },
  2030: { cbs: 0.044, ibs: 0.006, fase: "pis_cofins_reduzido_75", descricao: "PIS/COFINS reduzido 75%" },
  2031: { cbs: 0.066, ibs: 0.009, fase: "icms_iss_reduzido_10", descricao: "ICMS/ISS reduzido 10%" },
  2032: { cbs: 0.088, ibs: 0.178, fase: "icms_iss_reduzido_40", descricao: "ICMS/ISS reduzido 40%" },
  2033: { cbs: 0.088, ibs: 0.178, fase: "aliquota_plena", descricao: "Alíquota plena — extinção ICMS/ISS/PIS/COFINS" },
};

export function getPercentualTransicao(ano: number): PercentualTransicao {
  if (ano < 2026) return TABELA[2026];
  return TABELA[ano] ?? TABELA[2033];
}

export function tabelaTransicaoCompleta(): Array<{ ano: number } & PercentualTransicao> {
  return Object.entries(TABELA).map(([ano, p]) => ({ ano: Number(ano), ...p }));
}
