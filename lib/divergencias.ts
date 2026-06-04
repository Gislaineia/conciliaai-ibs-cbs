/**
 * Detector automático de divergências.
 * Roda após classificação para sinalizar problemas que o contador deve resolver.
 */
import type {
  Empresa,
  Documento,
  ItemDocumento,
  Participante,
  Produto,
  Divergencia,
  SeveridadeDivergencia,
} from "@/types";

export interface DivergenciaDetectada {
  documento_id: string;
  item_id?: string | null;
  tipo: Divergencia["tipo"];
  severidade: SeveridadeDivergencia;
  titulo: string;
  descricao: string;
  sugestao: string;
}

export function detectarDivergencias(
  empresa: Empresa,
  documento: Documento,
  itens: ItemDocumento[],
  participantes: Participante[],
  produtos: Produto[]
): DivergenciaDetectada[] {
  const out: DivergenciaDetectada[] = [];

  // 1) Fornecedor desconhecido (não no cadastro local — para empresa de entrada)
  if (documento.direcao === "ENTRADA") {
    const conhecido = participantes.find((p) => p.cnpj === documento.cnpj_emitente);
    if (!conhecido) {
      out.push({
        documento_id: documento.id,
        tipo: "FORNECEDOR_DESCONHECIDO",
        severidade: "ATENCAO",
        titulo: `Fornecedor novo: ${documento.razao_emitente ?? documento.cnpj_emitente}`,
        descricao: `O CNPJ ${documento.cnpj_emitente} ainda não está no cadastro de participantes da empresa.`,
        sugestao:
          "O sistema cadastrou automaticamente. Confirme regime tributário e CRT para garantir o cálculo correto de crédito IBS/CBS.",
      });
    } else if (!conhecido.regime_tributario) {
      out.push({
        documento_id: documento.id,
        tipo: "FORNECEDOR_DESCONHECIDO",
        severidade: "ATENCAO",
        titulo: `Regime do fornecedor não definido`,
        descricao: `O fornecedor ${conhecido.razao_social ?? conhecido.cnpj} está cadastrado, mas o regime tributário não foi definido.`,
        sugestao:
          "Defina o regime (LR/LP/SN/MEI). Isso afeta o crédito presumido aplicado em compras desse fornecedor.",
      });
    }
  }

  // 2) Documentos duplicados (mesma chave de acesso)
  // (verificação delegada à camada de storage por unique constraint)

  // 3) Documento fora do período de competência (data emissão muito antiga ou futura)
  const hoje = new Date();
  const dataEmissao = new Date(documento.data_emissao);
  const diffDias = (hoje.getTime() - dataEmissao.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDias > 365) {
    out.push({
      documento_id: documento.id,
      tipo: "DOC_FORA_PERIODO",
      severidade: "ATENCAO",
      titulo: "Documento com mais de 1 ano",
      descricao: `Emitido em ${documento.data_emissao}, há ${Math.floor(diffDias)} dias.`,
      sugestao: "Verifique se ainda é válido para crédito ou se já foi processado em períodos anteriores.",
    });
  } else if (diffDias < -3) {
    out.push({
      documento_id: documento.id,
      tipo: "DOC_FORA_PERIODO",
      severidade: "CRITICO",
      titulo: "Documento com data futura",
      descricao: `Data de emissão ${documento.data_emissao} é posterior a hoje.`,
      sugestao: "Erro de digitação ou XML inválido — verifique a origem.",
    });
  }

  // 4) Análise por item
  for (const item of itens) {
    // 4a) NCM ausente (apenas NF-e/CT-e)
    if (documento.tipo === "NFe" && !item.ncm) {
      out.push({
        documento_id: documento.id,
        item_id: item.id,
        tipo: "NCM_INEXISTENTE",
        severidade: "CRITICO",
        titulo: `Item ${item.numero_item} sem NCM`,
        descricao: `Produto "${item.descricao}" não tem NCM informado.`,
        sugestao: "NCM é obrigatório para classificação fiscal e geração do bloco 0200 do SPED.",
      });
    }

    // 4b) Item sem classificação após processo automático
    if (item.status_item === "pendente") {
      out.push({
        documento_id: documento.id,
        item_id: item.id,
        tipo: "ITEM_SEM_CLASSIFICACAO",
        severidade: "ATENCAO",
        titulo: `Item ${item.numero_item} pendente de classificação`,
        descricao: `O motor automático não conseguiu classificar com confiança suficiente: "${item.descricao}".`,
        sugestao:
          "Acesse a tela de Classificação e defina natureza, CST e crédito. Crie regra para automatizar próximos itens com mesmo NCM/CFOP.",
      });
    }

    // 4c) CST vedado mas com crédito ativado (inconsistência)
    if (item.gera_credito && (item.cst_cbs === "70" || item.cst_cbs === "71" || item.cst_cbs === "72")) {
      out.push({
        documento_id: documento.id,
        item_id: item.id,
        tipo: "CST_VEDADO_COM_CREDITO",
        severidade: "CRITICO",
        titulo: `CST ${item.cst_cbs} vedado com crédito ativado`,
        descricao: `O CST ${item.cst_cbs} indica vedação ao crédito (uso pessoal/benefício RH/isento), mas o item está marcado como gerador de crédito.`,
        sugestao: "Desabilite o crédito ou altere o CST. Inconsistência rejeita o SPED.",
      });
    }

    // 4d) Alíquota IBS/CBS divergente da empresa
    if (
      empresa.regime_tributario !== "SIMPLES_NACIONAL" &&
      empresa.regime_tributario !== "MEI" &&
      item.aliquota_cbs > 0 &&
      Math.abs(item.aliquota_cbs - empresa.aliquota_cbs) > 0.5
    ) {
      out.push({
        documento_id: documento.id,
        item_id: item.id,
        tipo: "ALIQUOTA_DIVERGENTE",
        severidade: "ATENCAO",
        titulo: `Alíquota CBS divergente`,
        descricao: `Item usa ${item.aliquota_cbs}% mas a empresa tem ${empresa.aliquota_cbs}% padrão.`,
        sugestao: "Pode ser regime diferenciado (saúde/educação) — confirme.",
      });
    }

    // 4e) Valor destacado divergente do calculado (se houver vCBS no XML)
    if (item.valor_cbs_ofertado > 0 && item.aliquota_cbs > 0 && item.valor_total > 0) {
      const calculado = item.valor_total * (item.aliquota_cbs / 100);
      const dif = Math.abs(calculado - item.valor_cbs_ofertado) / Math.max(calculado, 0.01);
      if (dif > 0.05) {
        out.push({
          documento_id: documento.id,
          item_id: item.id,
          tipo: "VALOR_DESTACADO_DIVERGENTE",
          severidade: "ATENCAO",
          titulo: `Valor CBS destacado diverge do calculado`,
          descricao: `Destacado ${item.valor_cbs_ofertado.toFixed(2)} ≠ calculado ${calculado.toFixed(2)} (alíquota ${item.aliquota_cbs}%).`,
          sugestao: "Pode ser fase de transição (% reduzido). Confirme se o XML já considera o percentual da fase.",
        });
      }
    }

    // 4f) CFOP inconsistente com direção do documento
    if (item.cfop) {
      const inicio = item.cfop.charAt(0);
      if (documento.direcao === "ENTRADA" && !["1", "2", "3"].includes(inicio)) {
        out.push({
          documento_id: documento.id,
          item_id: item.id,
          tipo: "CFOP_INCONSISTENTE",
          severidade: "CRITICO",
          titulo: `CFOP ${item.cfop} inconsistente com ENTRADA`,
          descricao: `CFOPs de entrada começam com 1, 2 ou 3.`,
          sugestao: "Verifique se a direção do documento (entrada/saída) está correta.",
        });
      } else if (documento.direcao === "SAIDA" && !["5", "6", "7"].includes(inicio)) {
        out.push({
          documento_id: documento.id,
          item_id: item.id,
          tipo: "CFOP_INCONSISTENTE",
          severidade: "CRITICO",
          titulo: `CFOP ${item.cfop} inconsistente com SAÍDA`,
          descricao: `CFOPs de saída começam com 5, 6 ou 7.`,
          sugestao: "Verifique se a direção do documento (entrada/saída) está correta.",
        });
      }
    }
  }

  return out;
}

export function severidadeMaxima(divs: DivergenciaDetectada[]): SeveridadeDivergencia {
  if (divs.some((d) => d.severidade === "CRITICO")) return "CRITICO";
  if (divs.some((d) => d.severidade === "ATENCAO")) return "ATENCAO";
  return "OK";
}
