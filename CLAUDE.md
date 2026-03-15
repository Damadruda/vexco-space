# Vex&Co Lab — Master System Protocol (V4 Final)

## 1. Misión y Rol (10x Engineer)
Actúas como un Staff Software Engineer (10x) y Arquitecto de IA. Tu objetivo es construir un ecosistema multi-agente robusto, asíncrono y de alta estética. Escribe código modular, DRY, y estrictamente tipado en TypeScript. Piensa en sistemas completos, no en parches aislados.

---

## 2. Tech Stack Core

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI/Styling | Tailwind CSS + Shadcn UI (sin bordes) + Radix UI |
| DB/ORM | Neon PostgreSQL + Prisma 6.x |
| Auth | NextAuth.js 4 (Google OAuth — solo @vexandco.com) |
| Storage | AWS S3 |
| AI | Gemini Flash (triage/supervisor), Claude Sonnet (revenue/redteam), Perplexity Sonar (research skill) |
| Package Manager | Yarn (nunca npm) |
| Estado | Zustand (ProjectMemory), SWR (fetch cache) |

---

## 3. Quiet Luxury Design System

### Paleta estricta
- Fondo: `#F9F8F6` (off-white)
- Texto principal: `#1A1A1A` (charcoal)
- Micro-etiquetas / muted: `#5E5E5E`

### Tipografía
- Headings: `Cormorant Garamond` (serif)
- Body: `Inter` (sans-serif)

### Reglas Zero-UI
- Prohibidos: `border` grises, `shadow-md`, fondos de input con color
- Ghost Inputs: `bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none`
- Estados async: Toasts (Sonner) o punto pulsante `bg-green-500 animate-pulse` — nunca spinners bloqueantes
- Clases utilitarias con prefijo `ql-*` para el design system

---

## 4. El Tono Anti-IA (Método Ruben Hassid)

Todo output de agentes pasa por este filtro antes de renderizarse:

- **Regla de 29 palabras:** Oraciones cortas. Voz activa. Tono C-Level.
- **Palabras prohibidas:** sumérgete, tapiz, crucial, descubre, imperativo, revolucionario, sinergias
- **Prohibido:** Renderizar Markdown crudo (`**`, `##`) en la UI final. Mapear siempre a componentes React (Structured Outputs).

---

## 5. Arquitectura Multi-Agente — Patrón Supervisor

### Flujo
```
POST /api/projects/[id]/session
  → supervisorAnalyze() [Gemini Flash — lee ProjectMemory]
  → Checkpoint (Human-in-the-Loop)
  → POST /api/projects/[id]/session/respond {action: "approve"}
  → routeToAgent() [agente especializado]
  → StructuredOutput → UI
```

### Los 8 agentes

| ID | Nombre | Rol | LLM |
|---|---|---|---|
| `strategist` | Autonomous Strategist | Supervisor · Routing inteligente | Gemini Flash |
| `revenue` | B2B Revenue Hunter | Ventas alto ticket · Unit economics | Claude Sonnet |
| `redteam` | Stress-Test Optimizer | Red Team · Rigurosidad extrema | Claude Sonnet |
| `navigator` | Cross-Border Navigator | Internacionalización · España-Latam | Gemini Flash |
| `innovation` | UX/UI Architect | Design thinking · Conversión | Gemini Flash |
| `workflow` | Growth Hacker | Experimentos · Loops virales | Gemini Flash |
| `infrastructure` | Tech Stack Advisor | Arquitectura · Bootstrapping | Gemini Flash |
| `narrative` | Content Strategist | Content-led growth · Thought leadership | Gemini Flash |

### Fallbacks
- Claude Sonnet sin `ANTHROPIC_API_KEY` → Gemini Flash (warn, no crash)
- Perplexity Sonar sin `PERPLEXITY_API_KEY` → Gemini Flash (warn, no crash)
- Gemini sin `GEMINI_API_KEY` → Error fatal (requerida)

---

## 6. Engine Modules (`lib/engine/`)

| Archivo | Responsabilidad |
|---|---|
| `llm.ts` | Cliente centralizado LLM. Timeouts (30s Gemini, 25s Perplexity). Fallbacks automáticos. |
| `supervisor.ts` | Supervisor: lee ProjectMemory via Prisma, genera SupervisorPlan. FALLBACK_PLAN si proyecto vacío. |
| `router.ts` | Enruta plan a agente especializado. Ejecuta skills. Retry con Gemini Flash si falla LLM primario. |
| `state-machine.ts` | Máquina de estados para sesiones War Room. Dual-store: Map (hot) + DB (persist, fire-and-forget). |
| `skills.ts` | Skills transversales: research (Perplexity), inspiration (Raindrop), cross-validation. Try/catch en cada skill. |
| `agents.ts` | Configuración de los 8 agentes: LLM asignado, skills, DNA de consultoría. |
| `debate.ts` | Full Debate 3 fases (async). Promise.allSettled en fases 1 y 2 — un agente fallando no mata el debate. |
| `prompts.ts` | Prompts centralizados para Supervisor y agentes. |

---

## 7. Los 22 Modelos Prisma

**Auth (4):** `User`, `Account`, `Session`, `VerificationToken`

**Core (9):** `Project`, `Idea`, `Note`, `Link`, `Image`, `ChatMessage`, `ConceptInsight`, `PatternCard`, `Milestone`

**V4 Strategic PM Lab (9):** `AgileTask`, `InboxItem`, `AnalysisResult`, `KnowledgeBase`, `RoadmapTimeline`, `AutomationLog`, `UserPreferences`, `DecisionLog`, `WarRoomSession`

**Enums:** `ProjectStatus` (RED/YELLOW/GREEN), `PatternCategory`, `TrackType` (GO_TO_MARKET/ONE_TIME_SERVICE), `DecisionOutcome`

---

## 8. API Endpoints

### Auth & Core
- `GET/POST /api/projects` — listar y crear proyectos
- `GET/PUT/DELETE /api/projects/[id]` — detalle, actualizar, eliminar

### Engine V4
- `GET/POST /api/projects/[id]/memory` — ProjectMemory (shared state)
- `GET/POST /api/projects/[id]/session` — sesión War Room (Supervisor)
- `POST /api/projects/[id]/session/respond` — Human-in-the-Loop (approve/reject/redirect/modify)
- `GET/POST /api/projects/[id]/debate` — Full Debate (iniciar / consultar)
- `POST /api/projects/[id]/debate/respond` — responder fases del debate

### Inbox & Knowledge
- `GET/POST /api/inbox` — items de inbox
- `GET/PATCH/DELETE /api/inbox/[id]` — item individual
- `POST /api/inbox/[id]/analyze` — análisis AI (Gemini + Jina)
- `POST /api/inbox/sync-raindrop` — sync desde Raindrop.io
- `GET/POST /api/knowledge` — base de conocimiento
- `GET/PATCH/DELETE /api/knowledge/[id]` — artículo individual

### Decisiones & Preferences
- `GET/POST /api/decisions` — DecisionLog
- `PATCH/DELETE /api/decisions/[id]` — actualizar/eliminar decisión
- `GET/PATCH /api/preferences` — UserPreferences (Raindrop token, Jina key, etc.)

### Kanban
- `GET/POST /api/agile` — AgileTask (Kanban)
- `PATCH/DELETE /api/agile/[id]` — tarea individual

### Legacy (Sprint 0-1)
- `POST /api/pm/consult` — consulta PM legacy (GOOGLE_AI_API_KEY)
- `POST /api/pm/validate-field` — validación campos (GOOGLE_AI_API_KEY)
- `POST /api/concept/validate` — validación INVEST (GOOGLE_AI_API_KEY)
- `POST /api/milestones/generate` — generar hitos
- `POST /api/milestones/certify` — certificar hitos

---

## 9. War Room — 3 Modos

| Modo | Descripción | Endpoint |
|---|---|---|
| **Consulta** | Un agente, checkpoint único | `/session` + `/session/respond` |
| **Estrategia** | Supervisor elige agente, 2 checkpoints | `/session` + `/session/respond` |
| **Full Debate** | 3 fases async (análisis → confrontación → síntesis), checkpoints por fase | `/debate` + `/debate/respond` |

Componentes UI en `components/expert-panel/`: `ExpertAvatar`, `ExpertList`, `ConsultantsThread`.

---

## 10. Variables de Entorno

```
DATABASE_URL          # Neon PostgreSQL pooled connection string — REQUERIDA
NEXTAUTH_SECRET       # NextAuth session secret — REQUERIDA
NEXTAUTH_URL          # https://vexco-space.vercel.app — REQUERIDA
GOOGLE_CLIENT_ID      # Google OAuth — REQUERIDA
GOOGLE_CLIENT_SECRET  # Google OAuth — REQUERIDA
GEMINI_API_KEY        # Gemini Flash — REQUERIDA (Supervisor + triage + inbox)
GOOGLE_AI_API_KEY     # Gemini legacy routes (pm/consult, concept/validate) — misma key que GEMINI_API_KEY
ANTHROPIC_API_KEY     # Claude Sonnet (revenue, redteam) — opcional, fallback Gemini
PERPLEXITY_API_KEY    # Perplexity Sonar (research skill) — opcional, fallback Gemini
JINA_API_KEY          # Jina Reader extracción URLs — opcional, funciona sin key en tier free
AWS_BUCKET_NAME       # S3 bucket
AWS_REGION            # S3 region
AWS_FOLDER_PREFIX     # S3 prefix
```

`RAINDROP_TOKEN` NO es env var global — se guarda en `UserPreferences` DB por usuario.

---

## 11. Estrategia de Branches

- `main` — producción, auto-deploy en Vercel. NO pushear directamente.
- `vexco-lab` — desarrollo V4. Merge a main solo tras testing completo.

Comando de merge final:
```bash
git checkout main && git merge vexco-lab --no-ff -m "🎉 Merge vexco-lab: Vex&Co Lab V4 completo" && git push origin main
```

---

## 12. Reglas Inviolables de Configuración

1. **NUNCA** modificar `next.config.js` — rompe el build en Vercel
2. **NUNCA** añadir `output` ni `binaryTargets` a `prisma/schema.prisma`
3. `package.json` `postinstall` debe ser SOLO `"prisma generate"` (sin `db push`)
4. **NUNCA** usar npm — solo `yarn add`
5. **SIEMPRE** leer un archivo antes de modificarlo
6. **NUNCA** hardcodear valores de `.env` en código — solo `process.env.VARIABLE`
7. TypeScript `ignoreBuildErrors: true` en `next.config.js` es legado — no modificar

---

## 13. Owner

- **Nombre:** Diego
- **Email:** diego@vexandco.com
- **GitHub:** Damadruda
- **Dominio permitido para auth:** @vexandco.com

---

## 14. Key URLs

- **Production:** https://vexco-space.vercel.app
- **GitHub:** https://github.com/Damadruda/vexco-space (private)
- **Vercel Project:** prj_8yUzvhXTXwWrTMlxJQ12Hu8Rm25d
