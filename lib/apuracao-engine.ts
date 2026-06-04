/**
 * Recalcula a apuração de um período a partir de documentos+itens.
 * Não persiste nada — chame `upsertApuracao` para salvar.
 */
import type {
  Empresa, Documento, ItemDocumento, Apuracao, ApuracaoPorEnte, FaseTransicao,
} from "@/types";
import { getPercentualTransicao } from "./transicao";

export interface ApuracaoCalculada {
  apuracao: Apuracao;
  por_ente: Array<Omit<ApuracaoPorEnte, "id" | "apuracao_id">>;
}

export function calcularApuracao(
  empresa: Empresa,
  periodo: string,
  documentos: Documento[],
  itensPorDoc: Map<string, ItemDocumento[]>,
  saldoAnterior: { cbs: number } = { cbs: 0 }
): ApuracaoCalculada {
  const fase = getPercentualTransicao(empresa.ano_vigencia_aliquota);

  let cbsDeb = 0, cbsCred = 0;
  let ibsEstDeb = 0, ibsEstCred = 0;
  let ibsMunDeb = 0, ibsMunCred = 0;
  let docsEntrada = 0, docsSaida = 0;
  let itensClass = 0, itensPend = 0;

  // Por ente: por UF (estadual) + por município (municipal)
  const enteEstado = new Map<string, {
    base: number; deb: number; cred: number; aliq: number;
  }>();
  const enteMunicipio = new Map<string, {
    base: number; deb: number; cred: number; aliq: number; nome: string;
  }>();

  for (const d of documentos) {
    if (d.periodo_competencia !== periodo) continue;
    if (d.direcao === "ENTRADA") docsEntrada++; else docsSaida++;
    const itens = itensPorDoc.get(d.id) ?? [];

    for (const i of itens) {
      if (i.status_item === "classificado") itensClass++;
      else itensPend++;

      if (d.direcao === "SAIDA") {
        cbsDeb += i.valor_cbs_ofertado;
        ibsEstDeb += i.valor_ibs_est_ofertado;
        ibsMunDeb += i.valor_ibs_mun_ofertado;
        // ente débito (saída) — UF da empresa (uf_emitente do documento de saída)
        const ufKey = d.uf_emitente ?? empresa.uf;
        const munKey = `${ufKey}-${d.municipio_emitente ?? empresa.municipio}`;
        const muncode = empresa.cod_municipio_ibge;

        const e = enteEstado.get(ufKey) ?? { base: 0, deb: 0, cred: 0, aliq: i.aliquota_ibs_estadual };
        e.base += i.base_calculo_ibs || i.valor_total;
        e.deb += i.valor_ibs_est_ofertado;
        enteEstado.set(ufKey, e);

        const m = enteMunicipio.get(muncode) ?? { base: 0, deb: 0, cred: 0, aliq: i.aliquota_ibs_municipal, nome: d.municipio_emitente ?? empresa.municipio };
        m.base += i.base_calculo_ibs || i.valor_total;
        m.deb += i.valor_ibs_mun_ofertado;
        enteMunicipio.set(muncode, m);
      } else {
        if (i.gera_credito) {
          cbsCred += i.valor_credito_cbs;
          ibsEstCred += i.valor_credito_ibs_est;
          ibsMunCred += i.valor_credito_ibs_mun;

          const ufKey = empresa.uf; // crédito creditado na UF de destino do comprador
          const e = enteEstado.get(ufKey) ?? { base: 0, deb: 0, cred: 0, aliq: i.aliquota_ibs_estadual };
          e.cred += i.valor_credito_ibs_est;
          enteEstado.set(ufKey, e);

          const muncode = empresa.cod_municipio_ibge;
          const m = enteMunicipio.get(muncode) ?? { base: 0, deb: 0, cred: 0, aliq: i.aliquota_ibs_municipal, nome: empresa.municipio };
          m.cred += i.valor_credito_ibs_mun;
          enteMunicipio.set(muncode, m);
        }
      }
    }
  }

  const cbsSaldoPagar = Math.max(0, cbsDeb - cbsCred - saldoAnterior.cbs);
  const cbsSaldoCredor = Math.max(0, cbsCred - cbsDeb + saldoAnterior.cbs);

  const ibsEstSaldoPagar = Math.max(0, ibsEstDeb - ibsEstCred);
  const ibsEstSaldoCredor = Math.max(0, ibsEstCred - ibsEstDeb);
  const ibsMunSaldoPagar = Math.max(0, ibsMunDeb - ibsMunCred);
  const ibsMunSaldoCredor = Math.max(0, ibsMunCred - ibsMunDeb);

  const por_ente: Array<Omit<ApuracaoPorEnte, "id" | "apuracao_id">> = [];
  for (const [uf, v] of enteEstado.entries()) {
    por_ente.push({
      tipo_ente: "ESTADO",
      uf,
      cod_municipio_ibge: null,
      nome_ente: uf,
      aliquota: v.aliq,
      base_calculo: round2(v.base),
      debitos: round2(v.deb),
      creditos: round2(v.cred),
      saldo_pagar: round2(Math.max(0, v.deb - v.cred)),
      saldo_credor: round2(Math.max(0, v.cred - v.deb)),
    });
  }
  for (const [cod, v] of enteMunicipio.entries()) {
    por_ente.push({
      tipo_ente: "MUNICIPIO",
      uf: empresa.uf,
      cod_municipio_ibge: cod,
      nome_ente: v.nome,
      aliquota: v.aliq,
      base_calculo: round2(v.base),
      debitos: round2(v.deb),
      creditos: round2(v.cred),
      saldo_pagar: round2(Math.max(0, v.deb - v.cred)),
      saldo_credor: round2(Math.max(0, v.cred - v.deb)),
    });
  }

  const apuracao: Apuracao = {
    id: "",
    empresa_id: empresa.id,
    periodo,
    status: "aberta",
    cbs_debitos: round2(cbsDeb),
    cbs_creditos: round2(cbsCred),
    cbs_ajustes: 0,
    cbs_saldo_anterior: round2(saldoAnterior.cbs),
    cbs_saldo_pagar: round2(cbsSaldoPagar),
    cbs_saldo_credor: round2(cbsSaldoCredor),
    ibs_est_debitos: round2(ibsEstDeb),
    ibs_est_creditos: round2(ibsEstCred),
    ibs_est_saldo_pagar: round2(ibsEstSaldoPagar),
    ibs_est_saldo_credor: round2(ibsEstSaldoCredor),
    ibs_mun_debitos: round2(ibsMunDeb),
    ibs_mun_creditos: round2(ibsMunCred),
    ibs_mun_saldo_pagar: round2(ibsMunSaldoPagar),
    ibs_mun_saldo_credor: round2(ibsMunSaldoCredor),
    total_docs_entrada: docsEntrada,
    total_docs_saida: docsSaida,
    total_itens_classificados: itensClass,
    total_itens_pendentes: itensPend,
    percentual_cbs: fase.cbs,
    percentual_ibs: fase.ibs,
    fase_transicao: fase.fase as FaseTransicao,
  };

  return { apuracao, por_ente };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
