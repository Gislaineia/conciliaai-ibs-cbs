"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/lib/app-context";
import {
  listDocumentos, listAllItens, listApuracoes,
  listParticipantes, listProdutos, listDivergencias,
  listAssistenteHistorico, saveAssistente,
} from "@/lib/storage";
import { processarPergunta, type AssistenteResposta, type AssistenteContexto } from "@/lib/assistente";
import { Sparkles, Send, Download, Bot, User } from "lucide-react";

interface Msg {
  role: "user" | "bot";
  text: string;
  resposta?: AssistenteResposta;
}

const SUGESTOES = [
  "Qual a apuração de 2026/05?",
  "Quanto comprei do NCM 8501?",
  "Top fornecedores",
  "Quantas notas tenho?",
  "Resumo de divergências",
  "Qual o crédito acumulado?",
];

export default function AssistentePage() {
  const { toast } = useToast();
  const { empresa } = useApp();
  const [pergunta, setPergunta] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ctx, setCtx] = useState<AssistenteContexto | null>(null);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!empresa) return;
    (async () => {
      const [docs, itens, apur, part, prod, div, hist] = await Promise.all([
        listDocumentos({ empresa_id: empresa.id }),
        listAllItens(empresa.id),
        listApuracoes(empresa.id),
        listParticipantes(empresa.id),
        listProdutos(empresa.id),
        listDivergencias(empresa.id),
        listAssistenteHistorico(empresa.id, 20),
      ]);
      setCtx({ empresa, documentos: docs, itens, apuracoes: apur, participantes: part, produtos: prod, divergencias: div });
      // Carregar histórico recente
      setMsgs(
        hist.reverse().flatMap((h) => [
          { role: "user" as const, text: h.pergunta },
          { role: "bot" as const, text: h.resposta_resumo, resposta: undefined },
        ])
      );
    })();
  }, [empresa?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  async function enviar(p?: string) {
    const txt = (p ?? pergunta).trim();
    if (!txt || !ctx || !empresa) return;
    setMsgs((m) => [...m, { role: "user", text: txt }]);
    setPergunta("");
    setThinking(true);
    // pequeno delay para sensação
    await new Promise((r) => setTimeout(r, 300));
    const resposta = processarPergunta(txt, ctx);
    setMsgs((m) => [...m, { role: "bot", text: resposta.textoResumo, resposta }]);
    setThinking(false);
    // Persistir
    saveAssistente({
      empresa_id: empresa.id,
      pergunta: txt,
      resposta_resumo: resposta.textoResumo,
      intent: resposta.intent,
      resultado_json: resposta.tabela ?? null,
    }).catch(() => {});
  }

  function exportarCSV(r: AssistenteResposta) {
    if (!r.csv) return;
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `assistente-${r.intent.toLowerCase()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!empresa) return <div>Selecione uma empresa primeiro.</div>;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Assistente Fiscal
        </h1>
        <p className="text-sm text-muted-foreground">
          Consultas inteligentes à base de dados — apurações, NCM, fornecedores, divergências.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresa: {empresa.razao_social}</CardTitle>
          <CardDescription>{empresa.cnpj} · {empresa.regime_tributario.replace(/_/g, " ")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => enviar(s)}
                className="text-xs rounded-full border bg-background hover:bg-accent px-3 py-1.5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="bg-muted/20 rounded-md border max-h-[500px] min-h-[300px] overflow-y-auto p-4 space-y-3">
            {msgs.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <div>Olá! Posso te ajudar com consultas sobre a base fiscal.</div>
                <div className="text-xs mt-1">Use uma das sugestões acima ou pergunte algo.</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "bot" && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                  <div className="whitespace-pre-line">{m.text}</div>
                  {m.resposta?.destaque && (
                    <div className="mt-2">
                      <Badge variant="info">{m.resposta.destaque}</Badge>
                    </div>
                  )}
                  {m.resposta?.tabela && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead className="bg-muted/40">
                          <tr>
                            {m.resposta.tabela.header.map((h) => <th key={h} className="text-left p-1.5 font-semibold">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {m.resposta.tabela.rows.map((row, ri) => (
                            <tr key={ri} className="border-t">
                              {row.map((c, ci) => <td key={ci} className="p-1.5">{c}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {m.resposta?.exportavel && m.resposta.csv && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => exportarCSV(m.resposta!)}>
                      <Download className="h-3 w-3" /> Exportar CSV
                    </Button>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="flex gap-2 items-center">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="bg-background border rounded-lg px-3 py-2 text-sm text-muted-foreground">Analisando...</div>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder="Faça uma pergunta sobre a base fiscal..."
            />
            <Button onClick={() => enviar()} disabled={!pergunta.trim() || thinking}>
              <Send className="h-4 w-4" /> Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
