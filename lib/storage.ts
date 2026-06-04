/**
 * Camada de storage com fallback inteligente:
 * - Se Supabase está configurado, usa Supabase.
 * - Caso contrário, usa localStorage (modo demonstração).
 *
 * Multi-empresa (ConciliaAI): cada escritório contábil cadastra várias empresas.
 * A empresa "ativa" é mantida em localStorage e usada por todas as telas.
 */
import { isSupabaseConfigured, getSupabase } from "./supabase";
import type {
  Empresa,
  Documento,
  ItemDocumento,
  Apuracao,
  ApuracaoPorEnte,
  ArquivoSped,
  ObrigacaoAcessoria,
  RegraClassificacao,
  EscritorioContabil,
  Participante,
  Produto,
  Divergencia,
  CapturaSefazConfig,
  AssistenteHistorico,
} from "@/types";

const KEY_PREFIX = "ibscbs:";
function lsKey(name: string) { return `${KEY_PREFIX}${name}`; }
const KEY_EMPRESA_ATIVA = "empresa_ativa_id";

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(lsKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(key), JSON.stringify(value));
  } catch {}
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "uuid-" + Math.random().toString(36).slice(2) + "-" + Date.now();
}

// ============== EMPRESA ATIVA (multi-tenant) ==============
export function getEmpresaAtivaId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(lsKey(KEY_EMPRESA_ATIVA));
}

export function setEmpresaAtivaId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(lsKey(KEY_EMPRESA_ATIVA), id);
  else window.localStorage.removeItem(lsKey(KEY_EMPRESA_ATIVA));
}

// ============== ESCRITÓRIO CONTÁBIL ==============
export async function getEscritorio(): Promise<EscritorioContabil | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb.from("escritorio_contabil").select("*").limit(1).maybeSingle();
    return (data as EscritorioContabil) ?? null;
  }
  return readLS<EscritorioContabil | null>("escritorio", null);
}

export async function saveEscritorio(e: EscritorioContabil): Promise<EscritorioContabil> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("escritorio_contabil").upsert(e).select().single();
    if (error) throw new Error(error.message);
    return data as EscritorioContabil;
  }
  const toSave = { ...e, id: e.id || uuid() };
  writeLS("escritorio", toSave);
  return toSave;
}

// ============== EMPRESAS (multi) ==============
export async function listEmpresas(): Promise<Empresa[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb.from("empresa").select("*").order("razao_social", { ascending: true });
    return (data as Empresa[]) ?? [];
  }
  return readLS<Empresa[]>("empresas", []);
}

/**
 * Retorna a empresa ATIVA (compatibilidade com código antigo).
 * Se nenhuma estiver ativa, retorna a primeira disponível.
 */
export async function getEmpresa(): Promise<Empresa | null> {
  const empresas = await listEmpresas();
  if (empresas.length === 0) return null;
  const ativa = getEmpresaAtivaId();
  const found = ativa ? empresas.find((e) => e.id === ativa) : null;
  return found ?? empresas[0];
}

export async function getEmpresaById(id: string): Promise<Empresa | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb.from("empresa").select("*").eq("id", id).maybeSingle();
    return (data as Empresa) ?? null;
  }
  return readLS<Empresa[]>("empresas", []).find((e) => e.id === id) ?? null;
}

export async function saveEmpresa(emp: Empresa): Promise<Empresa> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("empresa").upsert(emp).select().single();
    if (error) throw new Error(error.message);
    if (!getEmpresaAtivaId()) setEmpresaAtivaId(data.id);
    return data as Empresa;
  }
  const empresas = readLS<Empresa[]>("empresas", []);
  const toSave: Empresa = { ...emp, id: emp.id || uuid() };
  const idx = empresas.findIndex((e) => e.id === toSave.id);
  if (idx >= 0) empresas[idx] = toSave;
  else empresas.push(toSave);
  writeLS("empresas", empresas);
  if (!getEmpresaAtivaId()) setEmpresaAtivaId(toSave.id);
  return toSave;
}

export async function deleteEmpresa(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("empresa").delete().eq("id", id);
    if (getEmpresaAtivaId() === id) setEmpresaAtivaId(null);
    return;
  }
  const empresas = readLS<Empresa[]>("empresas", []);
  writeLS("empresas", empresas.filter((e) => e.id !== id));
  if (getEmpresaAtivaId() === id) setEmpresaAtivaId(null);
}

// ============== DOCUMENTOS ==============
export async function listDocumentos(filters?: {
  empresa_id?: string;
  periodo?: string;
  direcao?: "ENTRADA" | "SAIDA";
}): Promise<Documento[]> {
  const empresa_id = filters?.empresa_id ?? getEmpresaAtivaId() ?? undefined;
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    let q = sb.from("documentos").select("*").order("data_emissao", { ascending: false });
    if (empresa_id) q = q.eq("empresa_id", empresa_id);
    if (filters?.periodo) q = q.eq("periodo_competencia", filters.periodo);
    if (filters?.direcao) q = q.eq("direcao", filters.direcao);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data as Documento[]) ?? [];
  }
  let docs = readLS<Documento[]>("documentos", []);
  if (empresa_id) docs = docs.filter((d) => d.empresa_id === empresa_id);
  if (filters?.periodo) docs = docs.filter((d) => d.periodo_competencia === filters.periodo);
  if (filters?.direcao) docs = docs.filter((d) => d.direcao === filters.direcao);
  return docs.sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : -1));
}

export async function getDocumento(id: string): Promise<Documento | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb.from("documentos").select("*").eq("id", id).maybeSingle();
    return (data as Documento) ?? null;
  }
  const docs = readLS<Documento[]>("documentos", []);
  return docs.find((d) => d.id === id) ?? null;
}

export async function saveDocumentoComItens(
  doc: Omit<Documento, "id" | "criado_em">,
  itens: Array<Omit<ItemDocumento, "id" | "documento_id" | "criado_em">>
): Promise<{ documento: Documento; itens: ItemDocumento[] }> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data: docRow, error: docErr } = await sb
      .from("documentos")
      .insert(doc)
      .select()
      .single();
    if (docErr) throw new Error(docErr.message);
    const itensRows = itens.map((i) => ({ ...i, documento_id: docRow.id }));
    const { data: itensSaved, error: itErr } = await sb
      .from("itens_documento")
      .insert(itensRows)
      .select();
    if (itErr) throw new Error(itErr.message);
    return { documento: docRow as Documento, itens: (itensSaved as ItemDocumento[]) ?? [] };
  }
  const docs = readLS<Documento[]>("documentos", []);
  if (docs.some((d) => d.chave_acesso === doc.chave_acesso)) {
    throw new Error(`Documento já importado: ${doc.chave_acesso}`);
  }
  const docId = uuid();
  const newDoc: Documento = { ...doc, id: docId };
  const allItens = readLS<ItemDocumento[]>("itens_documento", []);
  const newItens: ItemDocumento[] = itens.map((i) => ({
    ...i,
    id: uuid(),
    documento_id: docId,
  }));
  writeLS("documentos", [...docs, newDoc]);
  writeLS("itens_documento", [...allItens, ...newItens]);
  return { documento: newDoc, itens: newItens };
}

export async function deleteDocumento(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("documentos").delete().eq("id", id);
    return;
  }
  const docs = readLS<Documento[]>("documentos", []);
  const itens = readLS<ItemDocumento[]>("itens_documento", []);
  writeLS("documentos", docs.filter((d) => d.id !== id));
  writeLS("itens_documento", itens.filter((i) => i.documento_id !== id));
}

// ============== ITENS ==============
export async function listItensByDocumento(documento_id: string): Promise<ItemDocumento[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("itens_documento")
      .select("*")
      .eq("documento_id", documento_id)
      .order("numero_item", { ascending: true });
    return (data as ItemDocumento[]) ?? [];
  }
  const items = readLS<ItemDocumento[]>("itens_documento", []);
  return items.filter((i) => i.documento_id === documento_id).sort((a, b) => a.numero_item - b.numero_item);
}

export async function listAllItens(empresa_id?: string): Promise<ItemDocumento[]> {
  const empId = empresa_id ?? getEmpresaAtivaId() ?? undefined;
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    if (empId) {
      // join via documentos
      const { data: docs } = await sb.from("documentos").select("id").eq("empresa_id", empId);
      const ids = (docs ?? []).map((d: { id: string }) => d.id);
      if (ids.length === 0) return [];
      const { data } = await sb.from("itens_documento").select("*").in("documento_id", ids);
      return (data as ItemDocumento[]) ?? [];
    }
    const { data } = await sb.from("itens_documento").select("*");
    return (data as ItemDocumento[]) ?? [];
  }
  const allItens = readLS<ItemDocumento[]>("itens_documento", []);
  if (!empId) return allItens;
  const docs = readLS<Documento[]>("documentos", []).filter((d) => d.empresa_id === empId);
  const docIds = new Set(docs.map((d) => d.id));
  return allItens.filter((i) => docIds.has(i.documento_id));
}

export async function updateItem(id: string, patch: Partial<ItemDocumento>): Promise<ItemDocumento> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("itens_documento")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ItemDocumento;
  }
  const items = readLS<ItemDocumento[]>("itens_documento", []);
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) throw new Error("Item não encontrado");
  items[idx] = { ...items[idx], ...patch };
  writeLS("itens_documento", items);
  return items[idx];
}

// ============== REGRAS ==============
export async function listRegras(empresa_id: string): Promise<RegraClassificacao[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("regras_classificacao")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("prioridade", { ascending: true });
    return (data as RegraClassificacao[]) ?? [];
  }
  const all = readLS<RegraClassificacao[]>("regras", []);
  return all.filter((r) => r.empresa_id === empresa_id).sort((a, b) => a.prioridade - b.prioridade);
}

export async function saveRegra(regra: Omit<RegraClassificacao, "id" | "criado_em">): Promise<RegraClassificacao> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("regras_classificacao").insert(regra).select().single();
    if (error) throw new Error(error.message);
    return data as RegraClassificacao;
  }
  const all = readLS<RegraClassificacao[]>("regras", []);
  const novo: RegraClassificacao = { ...regra, id: uuid(), criado_em: new Date().toISOString() };
  writeLS("regras", [...all, novo]);
  return novo;
}

export async function updateRegra(id: string, patch: Partial<RegraClassificacao>): Promise<RegraClassificacao> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("regras_classificacao")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as RegraClassificacao;
  }
  const all = readLS<RegraClassificacao[]>("regras", []);
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Regra não encontrada");
  all[idx] = { ...all[idx], ...patch };
  writeLS("regras", all);
  return all[idx];
}

export async function deleteRegra(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("regras_classificacao").delete().eq("id", id);
    return;
  }
  const all = readLS<RegraClassificacao[]>("regras", []);
  writeLS("regras", all.filter((r) => r.id !== id));
}

// ============== APURAÇÕES ==============
export async function listApuracoes(empresa_id: string): Promise<Apuracao[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("apuracoes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("periodo", { ascending: false });
    return (data as Apuracao[]) ?? [];
  }
  return readLS<Apuracao[]>("apuracoes", []).filter((a) => a.empresa_id === empresa_id);
}

export async function getApuracao(empresa_id: string, periodo: string): Promise<Apuracao | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("apuracoes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("periodo", periodo)
      .maybeSingle();
    return (data as Apuracao) ?? null;
  }
  return (
    readLS<Apuracao[]>("apuracoes", []).find(
      (a) => a.empresa_id === empresa_id && a.periodo === periodo
    ) ?? null
  );
}

export async function upsertApuracao(apur: Apuracao): Promise<Apuracao> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("apuracoes")
      .upsert(apur, { onConflict: "empresa_id,periodo" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Apuracao;
  }
  const all = readLS<Apuracao[]>("apuracoes", []);
  const idx = all.findIndex((a) => a.empresa_id === apur.empresa_id && a.periodo === apur.periodo);
  const toSave = { ...apur, id: apur.id || uuid() };
  if (idx >= 0) all[idx] = toSave;
  else all.push(toSave);
  writeLS("apuracoes", all);
  return toSave;
}

export async function listApuracaoPorEnte(apuracao_id: string): Promise<ApuracaoPorEnte[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("apuracao_por_ente")
      .select("*")
      .eq("apuracao_id", apuracao_id);
    return (data as ApuracaoPorEnte[]) ?? [];
  }
  return readLS<ApuracaoPorEnte[]>("apuracao_por_ente", []).filter(
    (e) => e.apuracao_id === apuracao_id
  );
}

export async function replaceApuracaoPorEnte(
  apuracao_id: string,
  entes: Array<Omit<ApuracaoPorEnte, "id" | "apuracao_id">>
): Promise<ApuracaoPorEnte[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("apuracao_por_ente").delete().eq("apuracao_id", apuracao_id);
    if (entes.length === 0) return [];
    const { data, error } = await sb
      .from("apuracao_por_ente")
      .insert(entes.map((e) => ({ ...e, apuracao_id })))
      .select();
    if (error) throw new Error(error.message);
    return (data as ApuracaoPorEnte[]) ?? [];
  }
  const all = readLS<ApuracaoPorEnte[]>("apuracao_por_ente", []);
  const filtered = all.filter((e) => e.apuracao_id !== apuracao_id);
  const novos: ApuracaoPorEnte[] = entes.map((e) => ({ ...e, id: uuid(), apuracao_id }));
  writeLS("apuracao_por_ente", [...filtered, ...novos]);
  return novos;
}

// ============== SPED ==============
export async function listArquivosSped(empresa_id: string): Promise<ArquivoSped[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("arquivos_sped")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("gerado_em", { ascending: false });
    return (data as ArquivoSped[]) ?? [];
  }
  return readLS<ArquivoSped[]>("arquivos_sped", []).filter((a) => a.empresa_id === empresa_id);
}

export async function getArquivoSped(id: string): Promise<ArquivoSped | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb.from("arquivos_sped").select("*").eq("id", id).maybeSingle();
    return (data as ArquivoSped) ?? null;
  }
  return readLS<ArquivoSped[]>("arquivos_sped", []).find((a) => a.id === id) ?? null;
}

export async function saveArquivoSped(arq: Omit<ArquivoSped, "id" | "gerado_em">): Promise<ArquivoSped> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("arquivos_sped").insert(arq).select().single();
    if (error) throw new Error(error.message);
    return data as ArquivoSped;
  }
  const all = readLS<ArquivoSped[]>("arquivos_sped", []);
  const novo: ArquivoSped = { ...arq, id: uuid(), gerado_em: new Date().toISOString() };
  writeLS("arquivos_sped", [...all, novo]);
  return novo;
}

// ============== OBRIGAÇÕES ==============
export async function listObrigacoes(empresa_id: string): Promise<ObrigacaoAcessoria[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("obrigacoes_acessorias")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("data_vencimento", { ascending: true });
    return (data as ObrigacaoAcessoria[]) ?? [];
  }
  return readLS<ObrigacaoAcessoria[]>("obrigacoes", [])
    .filter((o) => o.empresa_id === empresa_id)
    .sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1));
}

export async function saveObrigacao(obr: Omit<ObrigacaoAcessoria, "id" | "criado_em">): Promise<ObrigacaoAcessoria> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("obrigacoes_acessorias").insert(obr).select().single();
    if (error) throw new Error(error.message);
    return data as ObrigacaoAcessoria;
  }
  const all = readLS<ObrigacaoAcessoria[]>("obrigacoes", []);
  const novo: ObrigacaoAcessoria = { ...obr, id: uuid(), criado_em: new Date().toISOString() };
  writeLS("obrigacoes", [...all, novo]);
  return novo;
}

export async function updateObrigacao(id: string, patch: Partial<ObrigacaoAcessoria>): Promise<ObrigacaoAcessoria> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("obrigacoes_acessorias")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ObrigacaoAcessoria;
  }
  const all = readLS<ObrigacaoAcessoria[]>("obrigacoes", []);
  const idx = all.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Obrigação não encontrada");
  all[idx] = { ...all[idx], ...patch };
  writeLS("obrigacoes", all);
  return all[idx];
}

// ============== PARTICIPANTES (clientes/fornecedores) ==============
export async function listParticipantes(empresa_id: string): Promise<Participante[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("participantes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("razao_social", { ascending: true });
    return (data as Participante[]) ?? [];
  }
  return readLS<Participante[]>("participantes", []).filter((p) => p.empresa_id === empresa_id);
}

export async function getParticipanteByCnpj(empresa_id: string, cnpj: string): Promise<Participante | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("participantes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("cnpj", cnpj)
      .maybeSingle();
    return (data as Participante) ?? null;
  }
  return readLS<Participante[]>("participantes", []).find(
    (p) => p.empresa_id === empresa_id && p.cnpj === cnpj
  ) ?? null;
}

export async function upsertParticipante(p: Omit<Participante, "id" | "criado_em"> & { id?: string }): Promise<Participante> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("participantes")
      .upsert(p, { onConflict: "empresa_id,cnpj" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Participante;
  }
  const all = readLS<Participante[]>("participantes", []);
  const idx = all.findIndex((x) => x.empresa_id === p.empresa_id && x.cnpj === p.cnpj);
  const toSave: Participante = {
    ...p,
    id: p.id || (idx >= 0 ? all[idx].id : uuid()),
    criado_em: idx >= 0 ? all[idx].criado_em : new Date().toISOString(),
  };
  if (idx >= 0) all[idx] = toSave;
  else all.push(toSave);
  writeLS("participantes", all);
  return toSave;
}

export async function deleteParticipante(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("participantes").delete().eq("id", id);
    return;
  }
  const all = readLS<Participante[]>("participantes", []);
  writeLS("participantes", all.filter((p) => p.id !== id));
}

// ============== PRODUTOS ==============
export async function listProdutos(empresa_id: string): Promise<Produto[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("produtos")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("descricao", { ascending: true });
    return (data as Produto[]) ?? [];
  }
  return readLS<Produto[]>("produtos", []).filter((p) => p.empresa_id === empresa_id);
}

export async function getProdutoByCodigo(empresa_id: string, codigo: string): Promise<Produto | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("produtos")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("codigo", codigo)
      .maybeSingle();
    return (data as Produto) ?? null;
  }
  return readLS<Produto[]>("produtos", []).find(
    (p) => p.empresa_id === empresa_id && p.codigo === codigo
  ) ?? null;
}

export async function upsertProduto(p: Omit<Produto, "id" | "criado_em"> & { id?: string }): Promise<Produto> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("produtos")
      .upsert(p, { onConflict: "empresa_id,codigo" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Produto;
  }
  const all = readLS<Produto[]>("produtos", []);
  const idx = all.findIndex((x) => x.empresa_id === p.empresa_id && x.codigo === p.codigo);
  const toSave: Produto = {
    ...p,
    id: p.id || (idx >= 0 ? all[idx].id : uuid()),
    criado_em: idx >= 0 ? all[idx].criado_em : new Date().toISOString(),
  };
  if (idx >= 0) all[idx] = toSave;
  else all.push(toSave);
  writeLS("produtos", all);
  return toSave;
}

export async function updateProduto(id: string, patch: Partial<Produto>): Promise<Produto> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("produtos").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as Produto;
  }
  const all = readLS<Produto[]>("produtos", []);
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Produto não encontrado");
  all[idx] = { ...all[idx], ...patch };
  writeLS("produtos", all);
  return all[idx];
}

export async function deleteProduto(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    await sb.from("produtos").delete().eq("id", id);
    return;
  }
  const all = readLS<Produto[]>("produtos", []);
  writeLS("produtos", all.filter((p) => p.id !== id));
}

// ============== DIVERGÊNCIAS ==============
export async function listDivergencias(empresa_id: string, status?: "aberta" | "resolvida" | "ignorada"): Promise<Divergencia[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    let q = sb.from("divergencias").select("*").eq("empresa_id", empresa_id).order("criado_em", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return (data as Divergencia[]) ?? [];
  }
  let all = readLS<Divergencia[]>("divergencias", []).filter((d) => d.empresa_id === empresa_id);
  if (status) all = all.filter((d) => d.status === status);
  return all.sort((a, b) => (a.criado_em! < b.criado_em! ? 1 : -1));
}

export async function saveDivergencia(d: Omit<Divergencia, "id" | "criado_em">): Promise<Divergencia> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("divergencias").insert(d).select().single();
    if (error) throw new Error(error.message);
    return data as Divergencia;
  }
  const all = readLS<Divergencia[]>("divergencias", []);
  const novo: Divergencia = { ...d, id: uuid(), criado_em: new Date().toISOString() };
  writeLS("divergencias", [...all, novo]);
  return novo;
}

export async function updateDivergencia(id: string, patch: Partial<Divergencia>): Promise<Divergencia> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("divergencias").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as Divergencia;
  }
  const all = readLS<Divergencia[]>("divergencias", []);
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Divergência não encontrada");
  all[idx] = { ...all[idx], ...patch };
  writeLS("divergencias", all);
  return all[idx];
}

// ============== CAPTURA SEFAZ ==============
export async function getCapturaSefaz(empresa_id: string): Promise<CapturaSefazConfig | null> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("captura_sefaz_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    return (data as CapturaSefazConfig) ?? null;
  }
  return readLS<CapturaSefazConfig[]>("captura_sefaz", []).find((c) => c.empresa_id === empresa_id) ?? null;
}

export async function saveCapturaSefaz(c: CapturaSefazConfig): Promise<CapturaSefazConfig> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("captura_sefaz_config")
      .upsert(c, { onConflict: "empresa_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CapturaSefazConfig;
  }
  const all = readLS<CapturaSefazConfig[]>("captura_sefaz", []);
  const idx = all.findIndex((x) => x.empresa_id === c.empresa_id);
  const toSave = { ...c, id: c.id || (idx >= 0 ? all[idx].id : uuid()) };
  if (idx >= 0) all[idx] = toSave;
  else all.push(toSave);
  writeLS("captura_sefaz", all);
  return toSave;
}

// ============== ASSISTENTE IA HISTÓRICO ==============
export async function listAssistenteHistorico(empresa_id: string, limit = 50): Promise<AssistenteHistorico[]> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data } = await sb
      .from("assistente_historico")
      .select("*")
      .eq("empresa_id", empresa_id)
      .order("criado_em", { ascending: false })
      .limit(limit);
    return (data as AssistenteHistorico[]) ?? [];
  }
  return readLS<AssistenteHistorico[]>("assistente", [])
    .filter((a) => a.empresa_id === empresa_id)
    .sort((a, b) => (a.criado_em! < b.criado_em! ? 1 : -1))
    .slice(0, limit);
}

export async function saveAssistente(a: Omit<AssistenteHistorico, "id" | "criado_em">): Promise<AssistenteHistorico> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("assistente_historico").insert(a).select().single();
    if (error) throw new Error(error.message);
    return data as AssistenteHistorico;
  }
  const all = readLS<AssistenteHistorico[]>("assistente", []);
  const novo: AssistenteHistorico = { ...a, id: uuid(), criado_em: new Date().toISOString() };
  writeLS("assistente", [...all, novo]);
  return novo;
}
