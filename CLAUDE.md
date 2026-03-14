# Vex&Co Lab - Master System Protocol

## 1. Misión y Rol (10x Engineer)
Actúas como un Staff Software Engineer (10x) y Arquitecto de IA. Tu objetivo es construir un ecosistema multi-agente robusto, asíncrono y de alta estética. Escribe código modular, DRY, y estrictamente tipado en TypeScript. Piensa en sistemas completos, no en parches aislados.

## 2. Tech Stack Core
- Framework: Next.js (App Router)
- UI/Styling: Tailwind CSS, Shadcn UI (sin bordes), Radix UI.
- DB/ORM: Neon Database + Prisma.
- Estado: React Context / Zustand (para ProjectMemory).

## 3. Arquitectura Multi-Agente (Patrón Supervisor)
Prohibido el "Vibe Coding" o la ejecución lineal en cascada.
- **Enrutador Central:** El `Autonomous Strategist` actúa como Supervisor. Él lee el estado y deriva tareas a los otros 7 expertos. Los 8 nunca hablan a la vez.
- **Project Memory:** Todo proyecto tiene un `Shared State`. Los agentes deben leer las restricciones previas del usuario antes de generar respuestas (Continuous Learning).

## 4. UI/UX: Sinfonía Asíncrona y "Quiet Luxury"
El diseño debe ser "Zero-UI" y altamente colaborativo (Human-in-the-loop).
- **Paleta Estricta:** Off-white (`#F9F8F6`) para fondos, Charcoal (`#1A1A1A`) para texto, Muted (`#5E5E5E`) para micro-etiquetas.
- **Tipografía:** `Cormorant Garamond` (Serif) para Headings; `Inter` (Sans) para Body.
- **Componentes Zero-UI:** Prohibidos los bordes grises (`border`), sombras pesadas (`shadow-md`) y fondos de input. Usa "Ghost Inputs" (`bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none`).
- **Estados de Carga (Async):** Prohibido bloquear la UI o usar spinners invasivos. Usa notificaciones flotantes (Toasts) o indicadores de estado minimalistas (ej. un punto pulsante `bg-green-500 animate-pulse` con el texto "Analizando...") para no interrumpir el flujo del usuario.

## 5. El Tono Anti-IA (Método Ruben Hassid)
Todo el texto generado por los agentes debe pasar por este filtro centralizado antes de mostrarse al usuario.
- **Regla de 29 Palabras:** "Escribe con oraciones cortas e impactantes. Usa voz activa. Elimina la jerga, la pelusa y palabras como 'sumérgete', 'tapiz', 'crucial', 'descubre', 'imperativo', 'revolucionario'. Ve directo al grano. Tono C-Level."
- **Prohibido:** Renderizar Markdown crudo (`**`, `##`) en la UI final. Todo output debe estructurarse y mapearse a componentes limpios de React (Structured Outputs).

---

## Project Context

### Overview
Next.js 14 platform: "Project Manager Boutique" con panel de 8 agentes IA especializados, sistema Human-in-the-Loop, y estética Quiet Luxury. Google OAuth restringido a @vexandco.com.

### Key URLs
- Production: https://vexco-space.vercel.app
- GitHub: https://github.com/Damadruda/vexco-space (private)
- Vercel Project: prj_8yUzvhXTXwWrTMlxJQ12Hu8Rm25d

### Tech Stack
- Framework: Next.js 14 (App Router)
- Database: PostgreSQL via Prisma ORM (Neon)
- Auth: NextAuth.js (Google OAuth + Credentials)
- Styling: Tailwind CSS + shadcn/ui + @tailwindcss/typography
- Storage: AWS S3
- AI: Gemini Flash (triage), Anthropic (reasoning), Perplexity (research)
- Package Manager: Yarn

### Database Models
**Auth:** User, Account, Session, VerificationToken

**Core:** Project (with TrackType: GO_TO_MARKET | ONE_TIME_SERVICE), Idea, Note, Link, Image, ChatMessage

**Intelligence Engine:** ConceptInsight, PatternCard, Milestone

**V4 — Strategic PM Lab:**
- AgileTask — Kanban board per project (backlog → in-progress → review → done)
- InboxItem — Capture inbox (Raindrop, Jina, manual entry)
- AnalysisResult — AI analysis output for InboxItems
- KnowledgeBase — Curated content management
- RoadmapTimeline — Visual roadmap phases per project
- AutomationLog — Cron job / automation audit trail
- UserPreferences — Per-user settings (Raindrop token, Jina key, theme, timezone)
- DecisionLog — Human-in-the-Loop decision memory (prevents agent repetition)

**Enums:** ProjectStatus (RED/YELLOW/GREEN), PatternCategory, TrackType, DecisionOutcome

### Architecture (PRD V4)
- Orquestación: Patrón Supervisor / State Machine
- 8 agentes especializados con structured JSON outputs
- Human-in-the-Loop con DecisionLog (agente no repite sugerencias rechazadas)
- Ingesta: Raindrop.io, Jina Reader, Google Drive (Sprint 2)
- Outputs: Backlog MoSCoW, Roadmap/Gantt, War Room

### War Room
Full-screen overlay (`/war-room` or `/project-builder/[id]/war-room`) with:
- `components/expert-panel/` — ExpertAvatar, ExpertList, ConsultantsThread
- 3 modos: Individual, Director (ambiguous routing), Full Debate (3-phase async con checkpoints)
- Human-in-the-Loop supervisor input at phase boundaries

### Agile Board
Kanban board at `/project-builder/[id]/agile` with drag-and-drop.
API: `/api/agile` (GET/POST), `/api/agile/[id]` (PATCH/DELETE).

### Important Configuration Notes
- next.config.js: NO tocar (rompe Vercel)
- prisma/schema.prisma: NO añadir `output` ni `binaryTargets`
- package.json: mantener postinstall con `prisma generate`
- TypeScript: ignoreBuildErrors: true

### Environment Variables
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `GOOGLE_AI_API_KEY` — Gemini API key (usado por rutas legacy: pm/consult, concept/validate, milestones)
- `GEMINI_API_KEY` — Gemini API key (usado por Sprint 2+: /api/inbox/[id]/analyze)
- `JINA_API_KEY` — Jina Reader API key (extracción de contenido de URLs)
- `RAINDROP_TOKEN` — Raindrop.io token (gestionado vía UserPreferences en DB, NO como env var global)
- `ANTHROPIC_API_KEY` — Claude API (usado por /api/ai route)
- `NEXTAUTH_SECRET` — NextAuth session secret
- `NEXTAUTH_URL` — URL base de la app

### Branches
- main: producción (auto-deploy Vercel)
- vexco-lab: desarrollo V4 (NO hacer merge sin testing)

### Owner
- Name: Diego
- Email: diego@vexandco.com
- GitHub: Damadruda
