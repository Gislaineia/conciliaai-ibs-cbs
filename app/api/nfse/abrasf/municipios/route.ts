/**
 * /api/nfse/abrasf/municipios
 * Lista todos os municipios mapeados com suporte ABRASF
 * GET /api/nfse/abrasf/municipios
 * GET /api/nfse/abrasf/municipios?ibge=3106200
 * GET /api/nfse/abrasf/municipios?uf=MG
 */
import { NextRequest, NextResponse } from "next/server";
import { MUNICIPIOS_ABRASF } from "../route";

// Mapa IBGE -> UF para filtro
const IBGE_UF: Record<string, string> = {
    "12": "AC", "27": "AL", "16": "AP", "13": "AM", "29": "BA",
    "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA",
    "51": "MT", "50": "MS", "31": "MG", "15": "PA", "25": "PB",
    "41": "PR", "26": "PE", "22": "PI", "33": "RJ", "24": "RN",
    "43": "RS", "11": "RO", "14": "RR", "42": "SC", "35": "SP",
    "28": "SE", "17": "TO",
  };

function getUF(ibge: string): string {
    const cod = ibge.substring(0, 2);
    return IBGE_UF[cod] ?? "?";
  }

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ibgeFiltro = searchParams.get("ibge");
    const ufFiltro   = searchParams.get("uf")?.toUpperCase();

    let lista = Object.entries(MUNICIPIOS_ABRASF).map(([ibge, info]) => ({
          ibge,
          nome:   info.nome,
          uf:     getUF(ibge),
          versao: info.versao,
          url:    info.url,
        }));

    if (ibgeFiltro) {
          lista = lista.filter(m => m.ibge === ibgeFiltro);
        }
    if (ufFiltro) {
          lista = lista.filter(m => m.uf === ufFiltro);
        }

    // Ordena por UF e nome
    lista.sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome));

    return NextResponse.json({
          total: lista.length,
          municipios: lista,
          nota: "Para adicionar novos municipios, edite MUNICIPIOS_ABRASF em app/api/nfse/abrasf/route.ts",
        });
  }
