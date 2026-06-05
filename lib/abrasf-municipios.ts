/**
 * lib/abrasf-municipios.ts
 *
 * Mapa codigo IBGE -> URL WebService ABRASF (e variantes).
 *
 * Tipos especiais de versao:
 *  - "2.02" / "2.03" / "2.04": padrao ABRASF
 *  - "1.00": ABRASF v1 (Rio de Janeiro/Nota Carioca, Salvador antiga)
 *  - "PROPRIO_SP": Sao Paulo capital (NFe-SP, schema proprio - nao ABRASF)
 *  - "PROPRIO_DF": Brasilia (Nota Legal DF)
 *  - "PROPRIO_BSB_NFSE": SNNFSe DF
 */
export interface MunicipioWS {
  nome: string;
  url: string;
  versao: string;
  obs?: string;
}

export const MUNICIPIOS_ABRASF: Record<string, MunicipioWS> = {
  // ─── SAO PAULO ────────────────────────────────────────────────────────
  "3550308": {
    nome: "São Paulo (capital)",
    url: "https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx",
    versao: "PROPRIO_SP",
    obs: "Sistema NFe-SP (não-ABRASF). Use /api/nfse/sp.",
  },
  "3509502": { nome: "Campinas - SP",      url: "https://nfse.campinas.sp.gov.br/NFSE.asmx?wsdl", versao: "2.02" },
  "3543402": { nome: "Ribeirão Preto - SP", url: "https://nfse.ribeiraopreto.sp.gov.br/ws/nfsews.asmx?wsdl", versao: "2.02" },
  "3548708": { nome: "São José dos Campos - SP", url: "https://servicos.sjc.sp.gov.br/nfse/NfseV2.asmx?wsdl", versao: "2.02" },
  "3518800": { nome: "Guarulhos - SP",     url: "https://nfse.guarulhos.sp.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3534401": { nome: "Osasco - SP",        url: "https://www.osasco.sp.gov.br/portalnfsews/nfse.asmx?wsdl", versao: "2.02" },
  "3547809": { nome: "São Bernardo do Campo - SP", url: "https://nfse.saobernardo.sp.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3547007": { nome: "Santo André - SP",   url: "https://nfe.santoandre.sp.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3552205": { nome: "Sorocaba - SP",      url: "https://nfse.sorocaba.sp.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3549904": { nome: "Santos - SP",        url: "https://nfse.santos.sp.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── RIO DE JANEIRO ───────────────────────────────────────────────────
  "3304557": {
    nome: "Rio de Janeiro (Nota Carioca)",
    url: "https://notacarioca.rio.gov.br/WSNacional/nfse.asmx",
    versao: "1.00",
    obs: "Nota Carioca - ABRASF v1.00 (schema diferente da v2)",
  },
  "3303302": { nome: "Niterói - RJ",       url: "https://nfse.niteroi.rj.gov.br/Niteroi/Services/Nfse.asmx?wsdl", versao: "2.02" },
  "3301702": { nome: "Duque de Caxias - RJ", url: "https://nfse.duquedecaxias.rj.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3304904": { nome: "São Gonçalo - RJ",   url: "https://nfse.saogoncalo.rj.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3304144": { nome: "Petrópolis - RJ",    url: "https://nfse.petropolis.rj.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── DISTRITO FEDERAL ─────────────────────────────────────────────────
  "5300108": {
    nome: "Brasília (Nota Legal DF)",
    url: "https://notalegal.df.gov.br/services/nfse-ws.asmx",
    versao: "PROPRIO_DF",
    obs: "Nota Legal DF / SISNFSe DF. Pode requerer integrador municipal.",
  },

  // ─── MINAS GERAIS ─────────────────────────────────────────────────────
  "3106200": { nome: "Belo Horizonte - MG", url: "https://bhissweb.pbh.gov.br/bhiss-ws/nfse?wsdl", versao: "2.02" },
  "3170206": { nome: "Uberlândia - MG",    url: "https://nfse.uberlandia.mg.gov.br/publica/ws/nfse.wsdl", versao: "2.02" },
  "3118601": { nome: "Contagem - MG",      url: "https://nfse.contagem.mg.gov.br/nfse-ws/NfseWS?wsdl", versao: "2.02" },
  "3149309": { nome: "Juiz de Fora - MG",  url: "https://nfe.juizdefora.mg.gov.br/nfse/ws/nfse.wsdl", versao: "2.02" },
  "3136702": { nome: "Ipatinga - MG",      url: "https://nfse.ipatinga.mg.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3171303": { nome: "Uberaba - MG",       url: "https://nfse.uberaba.mg.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── PARANÁ ───────────────────────────────────────────────────────────
  "4106902": { nome: "Curitiba - PR",      url: "https://tributario.curitiba.pr.gov.br/nfse/WS/NFSeWS.asmx?wsdl", versao: "2.02" },
  "4113700": { nome: "Londrina - PR",      url: "https://nfse.londrina.pr.gov.br/nfse-ws/nfse.wsdl", versao: "2.02" },
  "4115200": { nome: "Maringá - PR",       url: "https://nfse.maringa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4119905": { nome: "Ponta Grossa - PR",  url: "https://nfse.pontagrossa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4108304": { nome: "Foz do Iguaçu - PR", url: "https://nfse.foz.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4128104": { nome: "São José dos Pinhais - PR", url: "https://nfse.sjp.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── SANTA CATARINA ───────────────────────────────────────────────────
  "4205407": { nome: "Florianópolis - SC", url: "https://nfse.pmf.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4202404": { nome: "Blumenau - SC",      url: "https://nfse.blumenau.sc.gov.br/NFSe.asmx?wsdl", versao: "2.02" },
  "4209102": { nome: "Joinville - SC",     url: "https://nfse.joinville.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4214805": { nome: "São José - SC",      url: "https://nfse.saojose.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4209300": { nome: "Lages - SC",         url: "https://nfse.lages.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4204202": { nome: "Chapecó - SC",       url: "https://nfse.chapeco.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── RIO GRANDE DO SUL ────────────────────────────────────────────────
  "4314902": { nome: "Porto Alegre - RS",  url: "https://nfse.portoalegre.rs.gov.br/smarapd/ws/nfse.wsdl", versao: "2.02" },
  "4304606": { nome: "Caxias do Sul - RS", url: "https://nfse.caxias.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4316907": { nome: "Santa Maria - RS",   url: "https://nfse.santamaria.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4309209": { nome: "Gravataí - RS",      url: "https://nfse.gravatai.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4318705": { nome: "Pelotas - RS",       url: "https://nfse.pelotas.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── GOIÁS ────────────────────────────────────────────────────────────
  "5208707": { nome: "Goiânia - GO",       url: "https://nfse.goiania.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "5201405": { nome: "Anápolis - GO",      url: "https://nfse.anapolis.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "5208004": { nome: "Aparecida de Goiânia - GO", url: "https://nfse.aparecida.go.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── MATO GROSSO DO SUL ───────────────────────────────────────────────
  "5002704": { nome: "Campo Grande - MS",  url: "https://nfse.campogrande.ms.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "5006606": { nome: "Dourados - MS",      url: "https://nfse.dourados.ms.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── BAHIA ────────────────────────────────────────────────────────────
  "2927408": { nome: "Salvador - BA",      url: "https://nfse.salvador.ba.gov.br/ws/lotenfe.asmx?wsdl", versao: "2.02" },
  "2918407": { nome: "Feira de Santana - BA", url: "https://nfse.feiradesantana.ba.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2910800": { nome: "Camaçari - BA",      url: "https://nfse.camacari.ba.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── PERNAMBUCO ───────────────────────────────────────────────────────
  "2611606": { nome: "Recife - PE",        url: "https://nfse.recife.pe.gov.br/NFSEserv/services/NFSEserv?wsdl", versao: "2.02" },
  "2607901": { nome: "Jaboatão dos Guararapes - PE", url: "https://nfse.jaboatao.pe.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2609600": { nome: "Olinda - PE",        url: "https://nfse.olinda.pe.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2606200": { nome: "Caruaru - PE",       url: "https://nfse.caruaru.pe.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── CEARÁ ────────────────────────────────────────────────────────────
  "2304400": { nome: "Fortaleza - CE",     url: "https://nfse.fortaleza.ce.gov.br/NFSEService/services/NFSEService?wsdl", versao: "2.02" },
  "2307650": { nome: "Caucaia - CE",       url: "https://nfse.caucaia.ce.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2304202": { nome: "Maracanaú - CE",     url: "https://nfse.maracanau.ce.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── AMAZONAS ─────────────────────────────────────────────────────────
  "1302603": { nome: "Manaus - AM",        url: "https://nfse.manaus.am.gov.br/WSNFSe/services/NFSe?wsdl", versao: "2.02" },

  // ─── PARÁ ─────────────────────────────────────────────────────────────
  "1501402": { nome: "Belém - PA",         url: "https://nfse.belem.pa.gov.br/nfse-web/ws/NFSeSOAP?wsdl", versao: "2.02" },
  "1502400": { nome: "Castanhal - PA",     url: "https://nfse.castanhal.pa.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "1500800": { nome: "Ananindeua - PA",    url: "https://nfse.ananindeua.pa.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── MARANHÃO ─────────────────────────────────────────────────────────
  "2111300": { nome: "São Luís - MA",      url: "https://nfse.saoluis.ma.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2103000": { nome: "Imperatriz - MA",    url: "https://nfse.imperatriz.ma.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── MATO GROSSO ──────────────────────────────────────────────────────
  "5103403": { nome: "Cuiabá - MT",        url: "https://nfse.cuiaba.mt.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "5108402": { nome: "Várzea Grande - MT", url: "https://nfse.varzeagrande.mt.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── ESPÍRITO SANTO ───────────────────────────────────────────────────
  "3205309": { nome: "Vitória - ES",       url: "https://nfse.vitoria.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3201308": { nome: "Cariacica - ES",     url: "https://nfse.cariacica.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3205002": { nome: "Vila Velha - ES",    url: "https://nfse.vilavelha.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3205200": { nome: "Serra - ES",         url: "https://nfse.serra.es.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── RONDÔNIA ─────────────────────────────────────────────────────────
  "1100205": { nome: "Porto Velho - RO",   url: "https://nfse.portovelho.ro.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "1100122": { nome: "Ji-Paraná - RO",     url: "https://nfse.ji-parana.ro.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── TOCANTINS ────────────────────────────────────────────────────────
  "1721000": { nome: "Palmas - TO",        url: "https://nfse.palmas.to.gov.br/ws/nfse.wsdl", versao: "2.02" },

  // ─── ALAGOAS / RN / PB / PI / SE / AC / AP / RR ───────────────────────
  "2704302": { nome: "Maceió - AL",        url: "https://nfse.maceio.al.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2408102": { nome: "Natal - RN",         url: "https://nfse.natal.rn.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2403103": { nome: "Mossoró - RN",       url: "https://nfse.mossoro.rn.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2507507": { nome: "João Pessoa - PB",   url: "https://nfse.joaopessoa.pb.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2211001": { nome: "Teresina - PI",      url: "https://nfse.teresina.pi.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "2800308": { nome: "Aracaju - SE",       url: "https://nfse.aracaju.se.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "1200401": { nome: "Rio Branco - AC",    url: "https://nfse.riobranco.ac.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "1600303": { nome: "Macapá - AP",        url: "https://nfse.macapa.ap.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "1400100": { nome: "Boa Vista - RR",     url: "https://nfse.boavista.rr.gov.br/ws/nfse.wsdl", versao: "2.02" },
};

/**
 * Helpers
 */
export function isMunicipioPadraoSP(ibge: string): boolean {
  return ibge === "3550308";
}

export function isMunicipioNaoAbrasf(ibge: string): boolean {
  const m = MUNICIPIOS_ABRASF[ibge];
  return !!m && m.versao.startsWith("PROPRIO_");
}
