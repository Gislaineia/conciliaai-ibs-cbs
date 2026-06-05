/**
 * lib/abrasf-municipios.ts
 *
 * Mapa codigo IBGE -> URL WebService ABRASF.
 * Foi movido para esta lib porque o Next.js App Router proíbe
 * exports adicionais em route.ts.
 */
export const MUNICIPIOS_ABRASF: Record<string, { nome: string; url: string; versao: string }> = {
  // Minas Gerais
  "3106200": { nome: "Belo Horizonte", url: "https://bhissweb.pbh.gov.br/bhiss-ws/nfse?wsdl", versao: "2.02" },
  "3170206": { nome: "Uberlandia",     url: "https://nfse.uberlandia.mg.gov.br/publica/ws/nfse.wsdl", versao: "2.02" },
  "3118601": { nome: "Contagem",       url: "https://nfse.contagem.mg.gov.br/nfse-ws/NfseWS?wsdl", versao: "2.02" },
  "3149309": { nome: "Juiz de Fora",   url: "https://nfe.juizdefora.mg.gov.br/nfse/ws/nfse.wsdl", versao: "2.02" },
  // Parana
  "4106902": { nome: "Curitiba",       url: "https://tributario.curitiba.pr.gov.br/nfse/WS/NFSeWS.asmx?wsdl", versao: "2.02" },
  "4113700": { nome: "Londrina",       url: "https://nfse.londrina.pr.gov.br/nfse-ws/nfse.wsdl", versao: "2.02" },
  "4115200": { nome: "Maringa",        url: "https://nfse.maringa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4119905": { nome: "Ponta Grossa",   url: "https://nfse.pontagrossa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Santa Catarina
  "4205407": { nome: "Florianopolis",  url: "https://nfse.pmf.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4202404": { nome: "Blumenau",       url: "https://nfse.blumenau.sc.gov.br/NFSe.asmx?wsdl", versao: "2.02" },
  "4209102": { nome: "Joinville",      url: "https://nfse.joinville.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4214805": { nome: "Sao Jose",       url: "https://nfse.saojose.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Rio Grande do Sul
  "4314902": { nome: "Porto Alegre",   url: "https://nfse.portoalegre.rs.gov.br/smarapd/ws/nfse.wsdl", versao: "2.02" },
  "4304606": { nome: "Caxias do Sul",  url: "https://nfse.caxias.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "4316907": { nome: "Santa Maria",    url: "https://nfse.santamaria.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Goias
  "5208707": { nome: "Goiania",        url: "https://nfse.goiania.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "5201405": { nome: "Anapolis",       url: "https://nfse.anapolis.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Mato Grosso do Sul
  "5002704": { nome: "Campo Grande",   url: "https://nfse.campogrande.ms.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Bahia
  "2927408": { nome: "Salvador",       url: "https://nfse.salvador.ba.gov.br/ws/lotenfe.asmx?wsdl", versao: "2.02" },
  // Pernambuco
  "2611606": { nome: "Recife",         url: "https://nfse.recife.pe.gov.br/NFSEserv/services/NFSEserv?wsdl", versao: "2.02" },
  // Ceara
  "2304400": { nome: "Fortaleza",      url: "https://nfse.fortaleza.ce.gov.br/NFSEService/services/NFSEService?wsdl", versao: "2.02" },
  // Amazonas
  "1302603": { nome: "Manaus",         url: "https://nfse.manaus.am.gov.br/WSNFSe/services/NFSe?wsdl", versao: "2.02" },
  // Para
  "1501402": { nome: "Belem",          url: "https://nfse.belem.pa.gov.br/nfse-web/ws/NFSeSOAP?wsdl", versao: "2.02" },
  // Maranhao
  "2111300": { nome: "Sao Luis",       url: "https://nfse.saoluis.ma.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Mato Grosso
  "5103403": { nome: "Cuiaba",         url: "https://nfse.cuiaba.mt.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Espirito Santo
  "3205309": { nome: "Vitoria",        url: "https://nfse.vitoria.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
  "3201308": { nome: "Cariacica",      url: "https://nfse.cariacica.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Rondonia
  "1100205": { nome: "Porto Velho",    url: "https://nfse.portovelho.ro.gov.br/ws/nfse.wsdl", versao: "2.02" },
  // Tocantins
  "1721000": { nome: "Palmas",         url: "https://nfse.palmas.to.gov.br/ws/nfse.wsdl", versao: "2.02" },
};
