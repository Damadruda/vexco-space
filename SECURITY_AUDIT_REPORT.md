# Reporte de Auditoría de Código — Vex&Co Lab

**Fecha:** 13 de febrero de 2026
**Proyecto:** Vex&Co Lab (Dashboard de Gestión para Emprendedores)
**Stack:** Next.js 14.2.28, TypeScript 5.2.2, Prisma 6.7.0, PostgreSQL
**Branch auditado:** `master`
**Archivos revisados:** 105 archivos TypeScript/TSX, 21 rutas API, 60+ componentes UI

---

## Resumen Ejecutivo

| Severidad | Encontrados | Corregidos | Pendientes |
|-----------|:-----------:|:----------:|:----------:|
| **Crítico** | 4 | 4 | 0 |
| **Alto** | 5 | 5 | 0 |
| **Medio** | 4 | 4 | 0 |
| **Bajo / Info** | 3 | 0 | 3 |
| **Total** | **16** | **13** | **3** |

Se identificaron **4 vulnerabilidades críticas de seguridad** que permitían acceso no autorizado a datos de cualquier usuario, ejecución de requests a redes internas (SSRF), e inyección de queries en la API de Google Drive. Todas fueron corregidas.

---

## Hallazgos Detallados

### CRÍTICOS (Impacto inmediato en seguridad)

#### 1. Autenticación completamente bypaseada en todas las rutas API

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/get-default-user.ts` |
| **Severidad** | CRÍTICO |
| **Estado** | ✅ Corregido |

**Descripción:**
La función `getDefaultUserId()` — usada por 9 rutas API como único mecanismo de autenticación — retornaba el ID del **primer usuario** de la base de datos sin verificar la sesión. Cualquier request HTTP sin autenticación accedía a los datos del primer usuario registrado.

**Rutas afectadas:**
`/api/projects`, `/api/notes`, `/api/links`, `/api/images`, `/api/stats`, `/api/search`, `/api/assistant`, `/api/ai`, `/api/upload/presigned`

**Código vulnerable:**
```typescript
// ANTES — retorna primer usuario sin verificar sesión
let cachedUserId: string | null = null;
export async function getDefaultUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  cachedUserId = user.id;
  return user.id;
}
```

**Corrección aplicada:**
```typescript
// DESPUÉS — verifica sesión real del usuario autenticado
export async function getDefaultUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("No autenticado");
  const userId = (session.user as any).id;
  if (!userId) throw new Error("ID de usuario no encontrado en la sesión");
  return userId;
}
```

---

#### 2. SSRF (Server-Side Request Forgery) en API de links

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/links/route.ts:39` |
| **Severidad** | CRÍTICO |
| **Estado** | ✅ Corregido |

**Descripción:**
El endpoint POST de links ejecutaba `fetch(body.url)` con cualquier URL proporcionada por el usuario, sin validación. Un atacante podía hacer requests a servicios internos (`http://localhost:3000`, `http://169.254.169.254` para metadata de AWS, `http://10.0.0.1` para redes privadas).

**Código vulnerable:**
```typescript
const res = await fetch(body.url, {
  headers: { 'User-Agent': 'Mozilla/5.0' },
  signal: AbortSignal.timeout(5000)
});
```

**Corrección aplicada:**
Se agregó función `isAllowedUrl()` que:
- Solo permite protocolos `http:` y `https:`
- Bloquea `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`
- Bloquea rangos privados: `10.x.x.x`, `172.x.x.x`, `192.168.x.x`
- Bloquea dominios `.internal` y `.local`
- Se agregó `redirect: "manual"` para prevenir redirecciones a hosts internos

---

#### 3. Inyección en query de Google Drive API

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/drive/route.ts:34` |
| **Severidad** | CRÍTICO |
| **Estado** | ✅ Corregido |

**Descripción:**
El parámetro `query` del usuario se interpolaba directamente en la query de la API de Drive sin sanitizar:

```typescript
driveQuery += ` and name contains '${query}'`;  // Inyectable
```

Un atacante podía inyectar condiciones adicionales como `' or name contains '` para acceder a archivos no autorizados.

**Corrección aplicada:**
Se agregó función `sanitize()` que escapa comillas simples y backslashes antes de interpolar.

---

#### 4. Inyección en query de carpetas de Google Drive

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/drive/folder/route.ts:36` |
| **Severidad** | CRÍTICO |
| **Estado** | ✅ Corregido |

**Descripción:**
Mismo patrón de inyección con el parámetro `folderId`:

```typescript
q: `'${folderId}' in parents and trashed=false`  // Inyectable
```

**Corrección aplicada:**
Se sanitiza `folderId` escapando comillas simples y backslashes.

---

### ALTOS (Vulnerabilidades explotables)

#### 5. Mass-assignment en endpoints PATCH (notes, links, images)

| Campo | Valor |
|-------|-------|
| **Archivos** | `app/api/notes/[id]/route.ts`, `app/api/links/[id]/route.ts`, `app/api/images/[id]/route.ts` |
| **Severidad** | ALTO |
| **Estado** | ✅ Corregido |

**Descripción:**
Los tres endpoints PATCH pasaban `data: body` directamente a Prisma, permitiendo que un atacante sobreescribiera cualquier campo, incluyendo `userId` (transferir propiedad), `createdAt`, `cloudStoragePath`, etc.

```typescript
// ANTES
const note = await prisma.note.update({
  where: { id: params.id },
  data: body  // ← El atacante controla todos los campos
});
```

**Corrección aplicada:**
Se agregó una lista blanca de campos permitidos (`ALLOWED_FIELDS`) para cada modelo. Solo los campos explícitamente listados se pueden actualizar.

---

#### 6. Sin verificación de propiedad en rutas de proyecto

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/projects/[id]/route.ts` |
| **Severidad** | ALTO |
| **Estado** | ✅ Corregido |

**Descripción:**
GET, PATCH y DELETE no verificaban que el proyecto perteneciera al usuario autenticado. Cualquier usuario autenticado podía leer, editar o borrar proyectos de otros usuarios conociendo el ID.

**Corrección aplicada:**
Se agregó verificación `project.userId !== userId` → retorna 403.

---

#### 7. Signup sin validación de datos

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/signup/route.ts` |
| **Severidad** | ALTO |
| **Estado** | ✅ Corregido |

**Descripción:**
- No validaba formato de email (aceptaba `"aaa"` como email válido)
- No exigía longitud mínima de contraseña
- No normalizaba email a minúsculas (permitía duplicados como `User@mail.com` y `user@mail.com`)
- bcrypt rounds en 10 (bajo para 2026)

**Corrección aplicada:**
- Validación de email con regex
- Mínimo 8 caracteres para contraseña
- Normalización a `toLowerCase().trim()`
- bcrypt rounds incrementado a 12

---

#### 8. Upload presignado sin autenticación

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/upload/presigned/route.ts` |
| **Severidad** | ALTO |
| **Estado** | ✅ Corregido |

**Descripción:**
El endpoint generaba URLs presignadas de AWS S3 sin requerir autenticación, permitiendo a cualquier persona subir archivos al bucket.

**Corrección aplicada:**
Se agregó `await getDefaultUserId()` al inicio del handler para requerir sesión autenticada.

---

#### 9. Placeholders de credenciales OAuth en producción

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/auth-options.ts:15-16` |
| **Severidad** | ALTO |
| **Estado** | ✅ Corregido |

**Descripción:**
```typescript
clientId: process.env.GOOGLE_CLIENT_ID || "placeholder-client-id",     // ← Fallback peligroso
clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder-client-secret",
```

Si las variables de entorno no estaban configuradas, el proveedor de Google se inicializaba con credenciales inválidas silenciosamente.

**Corrección aplicada:**
Se reemplazó con non-null assertion (`!`) para que falle inmediatamente si las env vars no existen.

---

### MEDIOS (Impacto en rendimiento/calidad)

#### 10. Prisma schema sin índices de base de datos

| Campo | Valor |
|-------|-------|
| **Archivo** | `prisma/schema.prisma` |
| **Severidad** | MEDIO |
| **Estado** | ✅ Corregido |

**Descripción:**
Ningún modelo tenía índices en `userId` ni `projectId`, a pesar de que TODAS las queries filtran por estos campos. Esto causaría full table scans en producción.

**Corrección aplicada:**
Se agregaron `@@index([userId])` y `@@index([projectId])` a todos los modelos relevantes (Account, Session, Project, Idea, Note, Link, Image, ChatMessage). También `@@index([status])` en Project.

---

#### 11. Content-Type incorrecto en streaming del asistente

| Campo | Valor |
|-------|-------|
| **Archivo** | `app/api/assistant/route.ts:90` |
| **Severidad** | MEDIO |
| **Estado** | ✅ Corregido |

**Descripción:**
El endpoint de streaming usaba `Content-Type: text/plain; charset=utf-8` cuando debería ser `text/event-stream` para Server-Sent Events.

**Corrección aplicada:**
Se cambió a `text/event-stream`.

---

#### 12. Código muerto — tipos de Expense no usados

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/types.ts` |
| **Severidad** | MEDIO |
| **Estado** | ✅ Corregido |

**Descripción:**
El archivo definía tipos `Expense`, `ExpenseFormData`, `EXPENSE_CATEGORIES` y `DateRange` que no eran importados por ningún otro archivo del proyecto. Parecen residuos de un template anterior.

**Corrección aplicada:**
Se eliminó el archivo.

---

#### 13. Errores de autenticación retornados como 500

| Campo | Valor |
|-------|-------|
| **Archivos** | Todas las rutas API |
| **Severidad** | MEDIO |
| **Estado** | ✅ Corregido |

**Descripción:**
Cuando `getDefaultUserId()` fallaba por falta de autenticación, el error se propagaba al catch genérico y retornaba `500 Internal Server Error` en lugar de `401 Unauthorized`.

**Corrección aplicada:**
Se agregó manejo específico del error `"No autenticado"` → retorna `401` en todas las rutas.

---

### BAJOS / INFORMATIVOS (Requieren decisión de negocio)

#### 14. next.config.js ignora todos los errores de build

| Campo | Valor |
|-------|-------|
| **Archivo** | `next.config.js` |
| **Severidad** | BAJO |
| **Estado** | ⚠️ Pendiente |

**Descripción:**
```javascript
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

Esto oculta errores de TypeScript y ESLint durante el deploy. Probablemente se agregó para desbloquear el deployment, pero debería removerse una vez que el código esté limpio.

**Recomendación:** Remover ambas opciones y corregir cualquier error que surja.

---

#### 15. allowDangerousEmailAccountLinking habilitado

| Campo | Valor |
|-------|-------|
| **Archivo** | `lib/auth-options.ts:17` |
| **Severidad** | BAJO |
| **Estado** | ⚠️ Pendiente |

**Descripción:**
`allowDangerousEmailAccountLinking: true` permite vincular automáticamente cuentas de diferentes proveedores (Google + credentials) al mismo email. Esto puede ser un vector de account takeover si un atacante registra una cuenta con el email de otro usuario antes de que este use Google SSO.

**Nota:** El riesgo se mitiga parcialmente porque Google SSO está restringido al dominio `@vexandco.com`.

**Recomendación:** Evaluar si es realmente necesario y documentar la decisión.

---

#### 16. Next.js 14.2.28 con vulnerabilidad de seguridad conocida

| Campo | Valor |
|-------|-------|
| **Archivo** | `package.json` |
| **Severidad** | BAJO |
| **Estado** | ⚠️ Pendiente |

**Descripción:**
Yarn reporta:
> `warning next@14.2.28: This version has a security vulnerability. Please upgrade to a patched version.`

**Recomendación:** Actualizar Next.js a la última versión parcheada.

---

## Resumen de Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `lib/get-default-user.ts` | Reescrito: auth real con `getServerSession` |
| `lib/auth-options.ts` | Removidos placeholders de OAuth |
| `lib/types.ts` | Eliminado (código muerto) |
| `prisma/schema.prisma` | Agregados 12 índices de base de datos |
| `app/api/projects/route.ts` | Auth 401, validación de título |
| `app/api/projects/[id]/route.ts` | Auth + verificación de propiedad |
| `app/api/notes/route.ts` | Auth 401, validación de título |
| `app/api/notes/[id]/route.ts` | Auth + propiedad + allowlist de campos |
| `app/api/links/route.ts` | Auth 401 + protección SSRF + validación URL |
| `app/api/links/[id]/route.ts` | Auth + propiedad + allowlist de campos |
| `app/api/images/route.ts` | Auth 401, validación cloudStoragePath |
| `app/api/images/[id]/route.ts` | Auth + propiedad + allowlist de campos |
| `app/api/stats/route.ts` | Auth 401 |
| `app/api/search/route.ts` | Auth 401 |
| `app/api/assistant/route.ts` | Auth 401 + Content-Type fix |
| `app/api/ai/route.ts` | Auth 401 |
| `app/api/signup/route.ts` | Validación email/password + normalización |
| `app/api/upload/presigned/route.ts` | Agregada autenticación |
| `app/api/drive/route.ts` | Sanitización de query |
| `app/api/drive/folder/route.ts` | Sanitización de folderId |

---

## Estado Final

- **TypeScript:** ✅ Compila sin errores (`npx tsc --noEmit` exitoso)
- **Prisma:** ✅ Schema válido, client generado correctamente
- **Dependencias:** ✅ Instaladas sin errores críticos
- **Git:** ✅ Todos los cambios commiteados y pusheados

---

*Reporte generado el 13 de febrero de 2026*
