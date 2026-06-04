/**
 * Assistente de IA local — analisa a base fiscal sem depender de modelos externos.
 * Usa intent matching por palavras-chave + consultas estruturadas.
 */
import type {
  Empresa,
  Documento,
  ItemDocumento,
  Apuracao,
  Participante,
  Produto,
  Divergencia,
} from "@/types";
import { formatBRL, periodoToLabel } from "./utils";

export type Intent =
  | "TOTAL_NCM"
  | "APURACAO_PERIODO"
  | "TOP_FORNECEDORES"
  | "TOP_PRODUTOS"
  | "DOCS_PERIODO"
  | "DIVERGENCIAS_RESUMO"
  | "CREDITO_TOTAL"
  | "DEBITO_TOTAL"
  | "FAQ"
  | "DESCONHECIDO";

export interface AssistenteContexto {
  empresa: Empresa;
  documentos: Documento[];
  itens: ItemDocumento[];
  apuracoes: Apuracao[];
  participantes: Participante[];
  produtos: Produto[];
  divergencias: Divergencia[];
}

export interface AssistenteResposta {
  intent: Intent;
  textoResumo: string;
  tabela?: { header: string[]; rows: (string | number)[][] };
  destaque?: string;
  exportavel?: boolean;
  csv?: string;
}

function detectIntent(pergunta: string): { intent: Intent; matches: string[] } {
  const p = pergunta.toLowerCase();
  const ncmMatch = p.match(/ncm\s*(\d{2,8})/);
  const periodoMatch = p.match(/(\d{4})[\/\-](\d{1,2})|(\d{1,2})[\/\-](\d{4})/);

  if (ncmMatch) return { intent: "TOTAL_NCM", matches: [ncmMatch[1]] };
  if (/(qual|valor|total).*(apura|recolher|pagar)/.test(p) || /apura/.test(p)) {
    if (periodoMatch) return { intent: "APURACAO_PERIODO", matches: [periodoMatch[0]] };
    return { intent: "APURACAO_PERIODO", matches: [] };
  }
  if (/(maiores|principais|top).*fornecedor/.test(p) || /quem.*comprei/.test(p)) {
    return { intent: "TOP_FORNECEDORES", matches: [] };
  }
  if (/(maiores|principais|top|mais comprado|mais vendido).*produto/.test(p)) {
    return { intent: "TOP_PRODUTOS", matches: [] };
  }
  if (/(quantos|total).*(documentos|notas|nfs|nfes)/.test(p)) {
    return { intent: "DOCS_PERIODO", matches: periodoMatch ? [periodoMatch[0]] : [] };
  }
  if (/(diverg|problema|alerta|cr[ií]tico)/.test(p)) {
    return { intent: "DIVERGENCIAS_RESUMO", matches: [] };
  }
  if (/cr[eé]dito/.test(p)) return { intent: "CREDITO_TOTAL", matches: [] };
  if (/d[eé]bito/.test(p)) return { intent: "DEBITO_TOTAL", matches: [] };
  if (/(o que|como|ajuda|funciona|tutorial)/.test(p)) return { intent: "FAQ", matches: [] };
  return { intent: "DESCONHECIDO", matches: [] };
}

function parsePeriodo(s: string): string | null {
  const m1 = s.match(/(\d{4})[\/\-](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}`;
  const m2 = s.match(/(\d{1,2})[\/\-](\d{4})/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;
  return null;
}

function toCSV(header: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\ufeff" + [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
}

export function processarPergunta(pergunta: string, ctx: AssistenteContexto): AssistenteResposta {
  const { intent, matches } = detectIntent(pergunta);

  switch (intent) {
    case "TOTAL_NCM": {
      const ncmPrefix = matches[0];
      const itens = ctx.itens.filter((i) => (i.ncm ?? "").startsWith(ncmPrefix));
      if (itens.length === 0) {
        return { intent, textoResumo: `Nenhum item encontrado com NCM ${ncmPrefix}.` };
      }
      // Agrupa por direção
      const compras = itens.filter((i) => {
        const d = ctx.documentos.find((x) => x.id === i.documento_id);
        return d?.direcao === "ENTRADA";
      });
      const vendas = itens.filter((i) => {
        const d = ctx.documentos.find((x) => x.id === i.documento_id);
        return d?.direcao === "SAIDA";
      });
      const sumC = compras.reduce((s, i) => s + i.valor_total, 0);
      const sumV = vendas.reduce((s, i) => s + i.valor_total, 0);
      const credCBS = compras.reduce((s, i) => s + i.valor_credito_cbs, 0);
      const debCBS = vendas.reduce((s, i) => s + i.valor_cbs_ofertado, 0);

      const rows = [
        ["Compras", compras.length, formatBRL(sumC), formatBRL(credCBS)],
        ["Vendas", vendas.length, formatBRL(sumV), formatBRL(debCBS)],
      ];
      const resumo = `NCM ${ncmPrefix}: ${itens.length} item(ns), compras ${formatBRL(sumC)} (crédito CBS ${formatBRL(credCBS)}), vendas ${formatBRL(sumV)} (débito CBS ${formatBRL(debCBS)}).`;
      const header = ["Operação", "Itens", "Valor total", "CBS"];
      return {
        intent,
        textoResumo: resumo,
        destaque: `${itens.length} itens · NCM ${ncmPrefix}`,
        tabela: { header, rows },
        exportavel: true,
        csv: toCSV(header, rows),
      };
    }

    case "APURACAO_PERIODO": {
      let periodo: string | null = matches[0] ? parsePeriodo(matches[0]) : null;
      if (!periodo && ctx.apuracoes.length > 0) {
        periodo = ctx.apuracoes[0].periodo;
      }
      if (!periodo) {
        return { intent, textoResumo: "Não há apurações geradas. Acesse Apuração e gere uma." };
      }
      const a = ctx.apuracoes.find((x) => x.periodo === periodo);
      if (!a) {
        return { intent, textoResumo: `Não há apuração para ${periodoToLabel(periodo)}.` };
      }
      const totalRecolher = a.cbs_saldo_pagar + a.ibs_est_saldo_pagar + a.ibs_mun_saldo_pagar;
      const header = ["Tributo", "Débitos", "Créditos", "A pagar"];
      const rows = [
        ["CBS", formatBRL(a.cbs_debitos), formatBRL(a.cbs_creditos), formatBRL(a.cbs_saldo_pagar)],
        ["IBS Estadual", formatBRL(a.ibs_est_debitos), formatBRL(a.ibs_est_creditos), formatBRL(a.ibs_est_saldo_pagar)],
        ["IBS Municipal", formatBRL(a.ibs_mun_debitos), formatBRL(a.ibs_mun_creditos), formatBRL(a.ibs_mun_saldo_pagar)],
      ];
      return {
        intent,
        textoResumo: `Apuração ${periodoToLabel(periodo)}: total a recolher ${formatBRL(totalRecolher)} (status: ${a.status}, fase: ${a.fase_transicao}).`,
        destaque: formatBRL(totalRecolher),
        tabela: { header, rows },
        exportavel: true,
        csv: toCSV(header, rows),
      };
    }

    case "TOP_FORNECEDORES": {
      const grouped = new Map<string, { nome: string; cnpj: string; total: number; docs: number }>();
      const entradas = ctx.documentos.filter((d) => d.direcao === "ENTRADA");
      for (const d of entradas) {
        const key = d.cnpj_emitente;
        const cur = grouped.get(key) ?? { nome: d.razao_emitente ?? d.cnpj_emitente, cnpj: d.cnpj_emitente, total: 0, docs: 0 };
        cur.total += d.valor_total;
        cur.docs += 1;
        grouped.set(key, cur);
      }
      const top = Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      if (top.length === 0) {
        return { intent, textoResumo: "Sem documentos de entrada." };
      }
      const header = ["Fornecedor", "CNPJ", "Notas", "Total"];
      const rows = top.map((f) => [f.nome, f.cnpj, f.docs, formatBRL(f.total)]);
      return {
        intent,
        textoResumo: `Top ${top.length} fornecedores. Maior: ${top[0].nome} com ${formatBRL(top[0].total)}.`,
        destaque: top[0].nome,
        tabela: { header, rows },
        exportavel: true,
        csv: toCSV(header, rows),
      };
    }

    case "TOP_PRODUTOS": {
      const grouped = new Map<string, { desc: string; ncm: string; total: number; qtd: number }>();
      for (const i of ctx.itens) {
        const key = (i.codigo_produto ?? i.descricao).slice(0, 40);
        const cur = grouped.get(key) ?? { desc: i.descricao, ncm: i.ncm ?? "", total: 0, qtd: 0 };
        cur.total += i.valor_total;
        cur.qtd += 1;
        grouped.set(key, cur);
      }
      const top = Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      if (top.length === 0) {
        return { intent, textoResumo: "Sem itens cadastrados." };
      }
      const header = ["Produto", "NCM", "Itens", "Total"];
      const rows = top.map((p) => [p.desc.substring(0, 60), p.ncm, p.qtd, formatBRL(p.total)]);
      return {
        intent,
        textoResumo: `Top ${top.length} produtos. Mais movimentado: ${top[0].desc.substring(0, 60)}.`,
        destaque: formatBRL(top[0].total),
        tabela: { header, rows },
        exportavel: true,
        csv: toCSV(header, rows),
      };
    }

    case "DOCS_PERIODO": {
      const periodo = matches[0] ? parsePeriodo(matches[0]) : null;
      const docs = periodo
        ? ctx.documentos.filter((d) => d.periodo_competencia === periodo)
        : ctx.documentos;
      const ent = docs.filter((d) => d.direcao === "ENTRADA").length;
      const sai = docs.filter((d) => d.direcao === "SAIDA").length;
      return {
        intent,
        textoResumo: `${docs.length} documento(s) ${periodo ? "em " + periodoToLabel(periodo) : "no total"}: ${ent} entradas, ${sai} saídas.`,
        destaque: String(docs.length),
      };
    }

    case "DIVERGENCIAS_RESUMO": {
      const abertas = ctx.divergencias.filter((d) => d.status === "aberta");
      const criticas = abertas.filter((d) => d.severidade === "CRITICO");
      const atencao = abertas.filter((d) => d.severidade === "ATENCAO");
      const header = ["Severidade", "Quantidade"];
      const rows = [
        ["CRÍTICO", criticas.length],
        ["ATENÇÃO", atencao.length],
        ["TOTAL ABERTAS", abertas.length],
      ];
      return {
        intent,
        textoResumo: `${abertas.length} divergência(s) aberta(s). ${criticas.length} crítica(s) bloqueiam SPED, ${atencao.length} atenção.`,
        destaque: criticas.length > 0 ? `${criticas.length} crítica(s)` : "OK",
        tabela: { header, rows },
        exportavel: true,
        csv: toCSV(header, rows),
      };
    }

    case "CREDITO_TOTAL": {
      const itens = ctx.itens.filter((i) => i.gera_credito);
      const cbs = itens.reduce((s, i) => s + i.valor_credito_cbs, 0);
      const ibs = itens.reduce((s, i) => s + i.valor_credito_ibs_est + i.valor_credito_ibs_mun, 0);
      return {
        intent,
        textoResumo: `Crédito acumulado: CBS ${formatBRL(cbs)} + IBS ${formatBRL(ibs)} = ${formatBRL(cbs + ibs)}.`,
        destaque: formatBRL(cbs + ibs),
      };
    }

    case "DEBITO_TOTAL": {
      const docsSaida = ctx.documentos.filter((d) => d.direcao === "SAIDA");
      const docIds = new Set(docsSaida.map((d) => d.id));
      const itens = ctx.itens.filter((i) => docIds.has(i.documento_id));
      const cbs = itens.reduce((s, i) => s + i.valor_cbs_ofertado, 0);
      const ibs = itens.reduce((s, i) => s + i.valor_ibs_est_ofertado + i.valor_ibs_mun_ofertado, 0);
      return {
        intent,
        textoResumo: `Débito acumulado (saídas): CBS ${formatBRL(cbs)} + IBS ${formatBRL(ibs)} = ${formatBRL(cbs + ibs)}.`,
        destaque: formatBRL(cbs + ibs),
      };
    }

    case "FAQ": {
      return {
        intent,
        textoResumo: [
          "Eu posso responder consultas como:",
          "• Quanto comprei do NCM 2710?",
          "• Qual minha apuração de 2026/05?",
          "• Quem são os top fornecedores?",
          "• Quantas divergências estão abertas?",
          "• Qual o crédito acumulado?",
          "• Quantas notas tenho em 2026-04?",
        ].join("\n"),
      };
    }

    default:
      return {
        intent,
        textoResumo:
          "Não entendi sua pergunta. Tente: \"Qual a apuração de 2026/05?\", \"Quanto comprei do NCM 8501?\", \"Top fornecedores\", \"Resumo de divergências\".",
      };
  }
}
