# Incidents Log — Vex&Co Lab

Registro de incidentes de produccion. Una entrada por incidente, formato fijo, mantenido en orden cronologico inverso (mas reciente arriba).

---

## 2026-05-03 — DB de produccion borrada por prisma migrate dev en sesion local

### Causa

El archivo .env.local apuntaba al host de produccion de Neon (ep-steep-unit-agd4kb5l-pooler.c-2.eu-central-1.aws.neon.tech). Durante una sesion de Claude Code para validar una migracion nueva (20260503123219_add_naics_sector_reasoning), se ejecuto un comando destructivo de Prisma (probable: prisma migrate dev con drift detection y reset interactivo, o prisma db push --accept-data-loss). El comando interpreto la branch como dev y reseteo las tablas mas _prisma_migrations.

### Sintomas

- Deploy fa31d72 fallo en build con P3018: relation "Project" does not exist al intentar aplicar la primera migracion del repo (Feb 2026).
- Probe local mostro _prisma_migrations con UNA entrada sin finished_at (la primera migracion del repo, abortada) y cero tablas del schema.
- Los datos de los 17 proyectos, 32 FirmInsights y demas tablas no eran accesibles desde el endpoint steep-unit.

### Recovery

1. Diagnostico via Vercel build logs y probe local con Prisma Client contra DATABASE_URL actual.
2. Confirmado por screenshot del Branch Overview en Neon: el endpoint steep-unit estaba asociado a la branch production y la branch tenia 49 MB de storage.
3. Neon Point-in-Time Recovery: restore in-place de la branch production a las 13:00 Madrid (~30 min antes de la destruccion). Restore exitoso en segundos.
4. Empty commit 637167b para re-disparar deploy. Build aplico la migracion nueva sobre el schema restaurado. Deploy READY.
5. Validacion final con endpoint /api/debug/db-state: 9 migraciones aplicadas, counts integros (Project: 17, FirmInsight: 32, etc.).

### Mitigaciones aplicadas

- Branch dev separada en Neon (host ep-sweet-mode-agjuvpdm) — Schema-only, sin datos. .env.local ahora apunta aca. Cualquier comando destructivo local cae sobre rama vacia.
- Snapshot manual creado en branch production (Neon Backup & Restore) con expires never. Punto fijo de recovery mas alla de la PITR window de 6 horas.
- Lock en CLAUDE.md seccion 14.10 — hosts prohibidos y protocolo de validacion obligatorio antes de cualquier comando destructivo.

### Deuda registrada

- Branch production_old_2026-05-03T... en Neon (31.77 MB) es respaldo automatico del estado roto. Archivar/eliminar despues de 7 dias sin incidentes.
- PITR window de 6h en plan Free. Si el incidente se hubiera diagnosticado con mas de 6h de delay, los datos se habrian perdido. Considerar upgrade de plan Neon si el riesgo es inaceptable.
- Revisar otros repos / proyectos donde Diego tenga .env.local apuntando directo a produccion.

### Lessons learned

- .env.local apuntando a produccion es zero-tolerance. Prod e infra de dev deben estar separadas a nivel host.
- Los probes locales contra DATABASE_URL y los build logs de Vercel son evidencia valida; las suposiciones sobre que branch usa el deploy no lo son. Endpoint de diagnostico runtime (/api/debug/db-state) es el unico modo de validar estado real.
- Diagnostico agil no es tirar hipotesis hasta acertar. Cuando el contexto es ambiguo, leer evidencia primaria (logs, codigo, queries directos) antes de proponer.
