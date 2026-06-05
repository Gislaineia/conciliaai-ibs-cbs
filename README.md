# IBS/CBS Fiscal — Reforma Tributária

Sistema completo para apuração de **IBS** e **CBS** (Lei Complementar 214/2025) com geração de
**SPED EFD ICMS/IPI** incluindo o novo **Bloco N**, controle de obrigações acessórias, motor de
classificação por regras e regime tributário, parser de NF-e/CT-e/NFS-e e cálculo paralelo
PIS/COFINS durante a transição.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + componentes próprios estilo shadcn/ui
- **Supabase** (PostgreSQL) — opcional, com fallback automático para `localStorage`
- **fast-xml-parser** — parsing client-side de XMLs
- **Recharts** — gráficos
- **Lucide-react** — ícones
- Deploy nativo no **Vercel**

## Modos de execução

O sistema funciona em dois modos:

1. **Com Supabase configurado** — persistência em PostgreSQL (recomendado para produção).
2. **Sem Supabase** — fallback automático em `localStorage` do navegador (modo demonstração).
   Útil para testar imediatamente sem configurar backend.

## Estrutura

```
/app                       # rotas Next.js (App Router)
  page.tsx                 # Dashboard
  /empresa                 # Cadastro
  /captura                 # Upload e parser XML
  /documentos              # Lista + detalhe
  /classificacao           # Painel de classificação IBS/CBS
  /apuracao                # Apurações mensais (lista + detalhe)
  /sped                    # Arquivos SPED gerados
  /obrigacoes              # Calendário fiscal
  /regras                  # Motor de regras
  /relatorios              # Livros e demonstrativos
  /api/health              # Endpoint de saúde
/lib
  supabase.ts              # Cliente Supabase
  storage.ts               # Camada com fallback localStorage
  xml-parser.ts            # NF-e / CT-e / NFS-e
  classificador.ts         # Motor de classificação por regras
  apuracao-engine.ts       # Cálculo da apuração mensal
  sped-generator.ts        # Gerador SPED com Bloco N
  transicao.ts             # Tabela de transição 2026–2033
  aliquotas.ts             # Alíquotas por UF + CSTs + naturezas
  utils.ts                 # Formatadores BRL, MD5, helpers
/components
  /ui                      # Botão, Card, Input, Select, Tabs, Dialog, Table, Toast, Badge, Label
  Sidebar.tsx              # Navegação lateral
/types/index.ts            # Tipos globais
/supabase/schema.sql       # Schema completo PostgreSQL com RLS e seed
```

## Instalação local

```bash
# 1) Dependências
npm install

# 2) Variáveis de ambiente (opcional — sem isso usa localStorage)
cp .env.example .env.local
# edite NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3) Schema no Supabase (apenas se for usar Supabase)
# acesse o SQL Editor do Supabase e execute /supabase/schema.sql

# 4) Dev server
npm run dev
# http://localhost:3000
```

## Deploy no Vercel

1. Push do código para um repositório GitHub.
2. **Vercel → Import Project** e selecione o repositório.
3. Em *Environment Variables*, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

## Fluxo de uso

1. **Cadastrar empresa** (`/empresa`) — CNPJ, regime, UF, alíquotas.
2. **Importar XMLs** (`/captura`) — parsing 100% client-side. Ao importar, o sistema
   já aplica classificação automática e calcula CBS/IBS por item conforme a fase de transição.
3. **Classificar pendentes** (`/classificacao`) — itens não decididos automaticamente.
   Crie regras a partir das decisões para automatizar futuros itens.
4. **Gerar/atualizar apuração** (`/apuracao`) — escolha o período e clique em *Gerar*.
5. **Detalhe da apuração** (`/apuracao/[mes]`) — revise débitos, créditos, IBS por ente,
   PIS/COFINS paralelo. Feche o período e gere o SPED.
6. **Baixar SPED** (`/sped/[id]`) — preview com syntax highlighting por bloco e download `.txt`.
7. **Obrigações** (`/obrigacoes`) — calendário fiscal por regime tributário.
8. **Relatórios** (`/relatorios`) — livros entrada/saída, demonstrativo de créditos,
   PIS/COFINS paralelo. Exportação CSV e impressão PDF.

## Regras de negócio implementadas

- **Regime tributário**: LR / LP / SN / MEI — afeta crédito, CST e SPED.
- **CRT do fornecedor**: SN sem destaque → crédito presumido (~3% CBS, ~1,2% IBS).
- **Lucro Presumido novo direito a crédito integral** (alerta visual).
- **Tabela de transição 2026–2033**: percentuais efetivos aplicados sobre alíquotas plenas.
- **CSTs IBS/CBS**: 01/02/03/04/05/06/07/40/41/42/43/44/70/71/72/99.
- **Bloco N completo**: N001/N100/N110/N120/N130/N140/N150/N160/N170/N190.
- **Classificação automática 4 passos**: regime → CRT → regras cadastradas → CFOP fallback.

## Limitações da v1.0

- 1 empresa cadastrada (escalável via futuras alterações de schema).
- Volume sugerido: até 100 NFs/mês (free tier Supabase).
- Upload manual de XMLs (sem integração SEFAZ).
- Alíquotas IBS por município com tabela base — a tabela oficial será publicada pelo Comitê Gestor.
- Crédito presumido SN: percentuais provisórios (~3% / 1,2%) sujeitos a regulamentação.
- SPED com Bloco N: layout final sujeito a publicação oficial RFB.

## Base legal

- **LC 214/2025** — Reforma Tributária (IBS, CBS, IS).
- **EC 132/2023** — Emenda Constitucional.
- **Guia Prático EFD ICMS/IPI** versão 3.1.8 (Receita Federal).

## Comandos úteis

```bash
npm run dev          # dev server
npm run build        # build produção
npm run start        # serve build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```


<!-- Deploy trigger: 2026-06-05 - fix node-forge serverExternalPackages -->
