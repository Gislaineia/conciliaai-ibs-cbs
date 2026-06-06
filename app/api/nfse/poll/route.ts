/**
 * /api/nfse/poll
 *
 * Consulta NFS-e RECEBIDAS no Sistema Nacional NFS-e (SNNFS-e) — Portal RFB.
 * Endpoints oficiais ADN (Ambiente de Dados Nacional):
 *   - producao:    https://adn.nfse.gov.br/contribuinte/v1
 *   - homologacao: https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1
 *
 * Body:
 *   { empresa_id, cnpj, pfx_base64, pfx_senha, data_inicio, data_fim, ambiente }
 *
 * Importante:
 *   - O Portal Nacional NFS-e exige Certificado Digital A1 (mTLS).
 *   - Nem todos os municipios estao aderidos; municipios proprios usam ABRASF
 *     (ver /api/nfse/abrasf).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import tls from "tls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let _sb: any = null;
function supabase() {
  if (_sb) return _sb;
  _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  return _sb;
}

const BASE_URL = {
  producao:    "https://adn.nfse.gov.br/contribuinte/v1",
  homologacao: "https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1",
};

// Valida o PFX via OpenSSL — mais robusto que node-forge para certs ICP-Brasil com SHA-256 MAC.
function validarPfx(pfxBase64: string, senha: string): Buffer {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  try {
    tls.createSecureContext({ pfx: pfxBuf, passphrase: senha });
  } catch (e: any) {
    throw new Error(`Senha incorreta ou certificado inválido: ${e.message}`);
  }
  return pfxBuf;
}

// Usa node:https em vez de fetch() — fetch nativo não propaga o agent mTLS.
function httpsGet(url: string, agent: https.Agent): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || "443"),
        path: parsed.pathname + (parsed.search ?? ""),
        method: "GET",
        agent,
        headers: { Accept: "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}


export async function POST(req: NextRequest) {
  const inicio = Date.now();
  try {
    const body = await req.json();
    let {
      empresa_id,
      cnpj,
      pfx_base64,
      pfx_senha,
      data_inicio,
      data_fim,
      ambiente = "homologacao",
    } = body;

    if (!cnpj || !data_inicio || !data_fim) {
      return NextResponse.json(
        { status: "erro", mensagem: "cnpj, data_inicio e data_fim sao obrigatorios" },
        { status: 400 }
      );
    }

    // Fallback: busca cert do Supabase se não veio no body
    if (!pfx_base64 || !pfx_senha) {
      if (empresa_id) {
        const { data: cfg } = await supabase()
          .from("captura_sefaz_config")
          .select("pfx_base64, pfx_senha")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        if (cfg?.pfx_base64) pfx_base64 = cfg.pfx_base64;
        if (cfg?.pfx_senha) pfx_senha = cfg.pfx_senha;
      }
      if (!pfx_base64 || !pfx_senha) {
        return NextResponse.json(
          { status: "erro", mensagem: "Certificado A1 nao encontrado. Carregue o .pfx em /captura-sefaz e salve a configuracao." },
          { status: 400 }
        );
      }
    }

    // Valida via OpenSSL (suporta SHA-256 MAC e PBES2 — mais robusto que node-forge)
    let pfxBuf: Buffer;
    try {
      pfxBuf = validarPfx(pfx_base64, pfx_senha);
    } catch (e: any) {
      return NextResponse.json(
        { status: "erro", mensagem: `Certificado A1 invalido: ${e.message}. Verifique a senha e recarregue o .pfx em /captura-sefaz.` },
        { status: 400 }
      );
    }

    const base  = BASE_URL[ambiente as keyof typeof BASE_URL];
    const agent = new https.Agent({
      pfx: pfxBuf,
      passphrase: pfx_senha,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ciphers: [
        "ECDHE-RSA-AES256-GCM-SHA384",
        "ECDHE-RSA-AES128-GCM-SHA256",
        "ECDHE-RSA-AES256-SHA384",
        "ECDHE-RSA-AES128-SHA256",
        "AES256-GCM-SHA384",
        "AES128-GCM-SHA256",
      ].join(":"),
    });

    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const listUrl = `${base}/NFSe?cnpjTomador=${cnpjLimpo}&dataInicio=${data_inicio}&dataFim=${data_fim}&pagina=1`;

    // Usa httpsGet com agent mTLS — fetch nativo do Node 18+ não envia o certificado client
    // causando HTTP 496 (SSL Certificate Required) no portal da RFB
    let listStatus: number;
    let listBody: string;
    try {
      const resp = await httpsGet(listUrl, agent);
      listStatus = resp.status;
      listBody = resp.body;
    } catch (e: any) {
      const msg = String(e?.cause?.code ?? e?.code ?? e?.message ?? e);
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Falha de rede ao chamar ${listUrl}: ${msg}. Verifique se o certificado A1 está válido, o ambiente (homologacao/producao) e a conectividade com adn.nfse.gov.br.`,
          url_consultada: listUrl,
          ambiente,
          duracao_ms: Date.now() - inicio,
        },
        { status: 502 }
      );
    }

    if (listStatus < 200 || listStatus >= 300) {
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Portal Nacional NFS-e respondeu HTTP ${listStatus}`,
          detalhe: listBody.substring(0, 1000),
          url_consultada: listUrl,
          ambiente,
        },
        { status: 502 }
      );
    }

    let lista: any;
    try { lista = JSON.parse(listBody); } catch { lista = {}; }
    const nfses: any[] = lista?.nfse ?? lista?.dados ?? lista?.NFSe ?? lista?.lista ?? [];
    const salvos: string[] = [];
    const erros: string[] = [];

    for (const nfse of nfses) {
      const chave = nfse.chaveAcesso ?? nfse.chaveNFSe ?? nfse.numero ?? String(Math.random());
      try {
        const xmlUrl = `${base}/NFSe/${chave}/xml`;
        const xmlRes = await httpsGet(xmlUrl, agent);
        if (xmlRes.status < 200 || xmlRes.status >= 300) {
          erros.push(`${chave}: HTTP ${xmlRes.status}`);
          continue;
        }
        const xml = xmlRes.body;

        await supabase().from("documentos_fiscais").upsert(
          {
            empresa_id: empresa_id ?? null,
            chave_acesso: `RFB-${chave}`,
            xml,
            schema: "nfse",
            nsu: "",
            sim: "nfse_nacional_poll",
            importado_em: new Date().toISOString(),
          },
          { onConflict: "chave_acesso" }
        );
        salvos.push(chave);
      } catch (e: any) {
        erros.push(`${chave}: ${e.message}`);
      }
    }

    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "NFSE_RFB",
        chave_acesso: `${data_inicio}/${data_fim}`,
        origem: "nfse_nacional_poll",
        status: erros.length ? "ERRO" : "OK",
        mensagem: `${salvos.length} salva(s), ${erros.length} erro(s)`,
        payload_resposta: { salvos: salvos.slice(0, 50), erros: erros.slice(0, 50) },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: "OK",
      total: salvos.length,
      chaves: salvos,
      erros: erros.slice(0, 50),
      ambiente,
      url_consultada: listUrl,
      duracao_ms: Date.now() - inicio,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "erro", mensagem: String((e as Error).message), stack: (e as Error).stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    descricao: "Polling Portal Nacional NFS-e (Sistema Nacional NFS-e RFB)",
    endpoints: BASE_URL,
    metodo: "POST",
    body: {
      empresa_id: "uuid (opcional)",
      cnpj: "14 digitos",
      pfx_base64: "base64 do .pfx",
      pfx_senha: "senha do .pfx",
      data_inicio: "YYYY-MM-DD",
      data_fim: "YYYY-MM-DD",
      ambiente: "producao | homologacao",
    },
  });
}
