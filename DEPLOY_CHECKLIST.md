# Deploy Checklist — Vex&Co Lab V4

## Variables de entorno requeridas en Vercel

### Ya configuradas (verificar que siguen activas)
- `DATABASE_URL` — PostgreSQL Neon connection string (pooled)
- `NEXTAUTH_SECRET` — Secret para NextAuth sessions
- `NEXTAUTH_URL` — https://vexco-space.vercel.app
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth secret
- `AWS_PROFILE` — AWS profile para S3
- `AWS_REGION` — AWS region (e.g. eu-west-1)
- `AWS_BUCKET_NAME` — S3 bucket name
- `AWS_FOLDER_PREFIX` — S3 folder prefix

### Nuevas — añadir antes del deploy
- `GEMINI_API_KEY` — **REQUERIDA**. Google Gemini API key. Sin esta, el Supervisor y el triage fallan.
- `ANTHROPIC_API_KEY` — Opcional. Anthropic Claude API key (revenue + redteam agents). Fallback: Gemini Flash.
- `PERPLEXITY_API_KEY` — Opcional. Perplexity Sonar API key (research skill). Fallback: Gemini Flash.
- `JINA_API_KEY` — Opcional. Jina Reader API key para extracción de URLs. Funciona en tier free sin key.
- `GOOGLE_AI_API_KEY` — Requerida si se usan rutas legacy (/api/pm/consult, /api/concept/validate). Puede ser la misma que GEMINI_API_KEY.

### Variables que NO son env vars globales
- `RAINDROP_TOKEN` — Se configura por usuario desde /preferences, se guarda en DB (UserPreferences). NO va en Vercel.

## Pasos para deploy

1. [ ] Añadir las variables nuevas en Vercel → Settings → Environment Variables (Production + Preview)
2. [ ] Verificar que las variables existentes siguen configuradas
3. [ ] Ejecutar merge: `git checkout main && git merge vexco-lab --no-ff -m "🎉 Merge vexco-lab: Vex&Co Lab V4 completo" && git push origin main`
4. [ ] Esperar que el build de Vercel pase (2-3 min)
5. [ ] Verificar en https://vexco-space.vercel.app que la app carga
6. [ ] Verificar que el login con Google funciona (solo @vexandco.com)
7. [ ] Crear un proyecto de prueba
8. [ ] Abrir War Room → iniciar sesión → verificar que el Supervisor responde
9. [ ] Verificar que el Checkpoint aparece y se puede aprobar
10. [ ] Verificar que el agente genera análisis estructurado

## Arquitectura V4 en producción

```
Usuario → War Room → Supervisor (Gemini Flash)
                   → Checkpoint (Human-in-the-Loop)
                   → Agente especializado (Gemini/Claude/Perplexity)
                   → StructuredOutput → UI
```

## Notas críticas
- `next.config.js`: NO modificar (rompe Vercel)
- `prisma/schema.prisma`: NO añadir `output` ni `binaryTargets`
- `package.json` postinstall: debe ser SOLO `prisma generate` (sin `db push`)
- La DB usa Neon PostgreSQL con connection pooling — `DATABASE_URL` debe ser la URL pooled
- TypeScript: `ignoreBuildErrors: true` en next.config.js (legado, no modificar)
