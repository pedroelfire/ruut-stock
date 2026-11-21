# CLAUDE.md: reglas del proyecto

App de datos y visualización de acciones (prueba técnica RUUT). El plan completo está en [PLAN.md](PLAN.md); las convenciones visuales, en [docs/ui-ux-conventions.md](docs/ui-ux-conventions.md).

## Referencia visual (mockup público)

**[Convenciones UI/UX en el lienzo](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255)** (público, cualquiera con el enlace puede verlo). Tableros: guía de estilo, estados, dashboard en claro, detalle de símbolo en oscuro y watchlist móvil.

- Es la referencia visual de [docs/ui-ux-conventions.md](docs/ui-ux-conventions.md). Si los dos no coinciden, **manda el documento** y el mockup se actualiza.
- Los datos de mercado del mockup son ilustrativos.

## Idioma

- **Todo el código y la interfaz van 100 % en inglés:** identificadores, comentarios, textos de la UI, mensajes de error del API, logs, nombres de tests, nombres de ramas y mensajes de commit.
- **Los archivos `.md` se escriben en español** (documentación, specs, informes de auditoría, sesiones de `prompts/` y también el `README.md` raíz).

## Contexto fijo

- Specs de referencia: [producto](prompts/specs/01-product.md), [backend](prompts/specs/02-backend.md) y [frontend](prompts/specs/03-frontend.md). Si el código y un spec no coinciden, se actualiza primero el spec.
- Monorepo pnpm: `apps/web` (Next.js 16, App Router), `apps/api` (Express 5), `packages/shared` (tipos y esquemas Zod).
- Los datos de mercado vienen de Twelve Data **solo a través de `apps/api`**. El navegador nunca llama a Twelve Data.
- Auth: Express emite el JWT. Next.js lo guarda en una cookie httpOnly y lo reenvía como `Authorization: Bearer` (patrón BFF).
- Hosting: Railway (servicios `web`, `api` y `Postgres`).
- Límite de Twelve Data: 8 créditos/min y 800/día. Todo acceso pasa por la caché de `apps/api/src/lib/cache.ts`.

## Agentes del repositorio

| Agente | Cuándo usarlo | ¿Modifica código? |
|---|---|---|
| `backend-dev` | Implementar o cambiar cualquier cosa en `apps/api` o en los esquemas de `packages/shared` | Sí |
| `frontend-dev` | Implementar o cambiar cualquier cosa en `apps/web` | Sí |
| `ui-ux-guardian` | Después de cualquier cambio visual en `apps/web`, o para actualizar las convenciones de UI | Solo la capa de presentación de `apps/web` y `docs/ui-ux-conventions.md` |
| `code-reviewer` | Antes de cada commit o PR, sobre el diff | No (solo lee y emite un veredicto) |
| `auditor` | Al terminar una feature grande (cada fase de PLAN.md) | No (solo escribe su informe en `docs/audits/`) |

### Flujo de trabajo

1. La sesión principal descompone la tarea y delega en `backend-dev` y/o `frontend-dev`. Si los dos lados se tocan, el contrato (esquema Zod en `packages/shared`) se define primero, en `backend-dev`.
2. Si hubo cambios visuales, se pasa a `ui-ux-guardian`.
3. `code-reviewer` revisa el diff. Con veredicto **CAMBIOS REQUERIDOS**, el agente desarrollador corrige y se vuelve a revisar. Solo se hace commit con **APROBADO**.
4. Al cerrar una feature grande, se ejecuta `auditor`. Sus hallazgos críticos se convierten en tareas antes de seguir con la siguiente fase.
5. La sesión principal registra la sesión en `prompts/sessions/` (ver más abajo) y hace el commit.

Los subagentes no pueden lanzar otros subagentes: la orquestación siempre la hace la sesión principal. Las fases de PLAN.md empiezan solo con luz verde explícita del usuario.

## Convenciones de código

- TypeScript `strict`. Prohibido `any` (usar `unknown` y estrechar). Nada de `@ts-ignore` sin un comentario que lo justifique.
- Validación con Zod en todas las fronteras: body/query/params en Express, respuestas de Twelve Data, variables de entorno, formularios.
- Las variables de entorno solo se leen en `config/env.ts` (api) o en un módulo equivalente en web. Nunca `process.env` suelto.
- Errores del API con formato único: `{ error: { code, message, retryAfter? } }`. Códigos: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR` (tabla de status HTTP en el spec 02 §2).
- Nombres de archivo en kebab-case. Componentes React en PascalCase. Hooks con prefijo `use`.
- Funciones pequeñas y con un solo propósito. Los comentarios explican el *porqué*, no el *qué*.
- Sin secretos en el código, los logs ni `prompts/`. El token JWT y las contraseñas nunca se loguean.

## Commits

Formato obligatorio:

```
<tipo>(<scope>): <Description>

[cuerpo opcional: el porqué del cambio]

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- **Tipos:** `feat` (funcionalidad nueva), `fix` (corrección de bug), `docs` (solo documentación), `test` (solo tests), `refactor` (sin cambio de comportamiento), `style` (formato, sin cambio de lógica), `perf` (rendimiento), `chore` (dependencias, configuración, tooling), `ci` (pipelines y despliegue).
- **Scope obligatorio**, en minúsculas. Scopes habituales: `api`, `web`, `shared`, `auth`, `market`, `watchlist`, `cache`, `ui`, `deploy`, `prompts`, `repo`.
- **Descripción** en inglés, empieza con mayúscula, en imperativo o como sustantivo, sin punto final y con un máximo de 72 caracteres en la primera línea.
- Un commit por unidad lógica de cambio. No se mezclan features con refactors.
- El trailer `Co-Authored-By` va en todo commit hecho con ayuda de la IA (la prueba pide transparencia sobre el uso de IA).
- Ejemplos:
  - `feat(auth): Auth system with JWT login and register`
  - `fix(cache): Serve stale quote when Twelve Data returns 429 in body`
  - `docs(prompts): Add session 04 backend setup`
  - `chore(repo): Configure pnpm workspaces and TypeScript base`

## Política de tests

Se testea **lo que puede fallar**, no todo:

- **Sí:** lógica con ramas (traducción de rangos a intervalos, cálculo de variaciones), mapeo y validación de datos externos, auth (hash, emisión y verificación de JWT, rutas protegidas), caché (TTL, dedupe, fallback a dato obsoleto), manejo de errores y rate limit, hooks con lógica (debounce), formateadores de números y fechas.
- **No:** componentes puramente presentacionales, configuración del framework, código generado (shadcn, Prisma), getters triviales.
- Herramientas: Vitest en ambos lados, Supertest en el api, Testing Library en web. Nunca se llama a la API real de Twelve Data en los tests: siempre con mocks.

## Registro de prompts (`prompts/`)

La prueba exige conservar todos los prompts, en orden. Al cerrar cada sesión de trabajo (una petición del usuario con su resultado), la sesión principal:

1. Crea `prompts/sessions/NN-topic.md`, con `NN` correlativo de dos dígitos y `topic` en inglés y kebab-case (`04-backend-auth.md`). Una sesión por petición del usuario.
2. Usa esta plantilla:
   - **Fecha**, **herramienta y modelo**, **agentes usados**.
   - **Prompt del usuario:** literal, en bloque de cita.
   - **Qué produjo la IA:** resumen y archivos tocados.
   - **Correcciones y decisiones humanas:** qué cambió el usuario o qué se arregló a mano.
3. Si la IA se equivocó, lo anota también en la sección "Dónde se equivocó la IA" de `prompts/README.md`.
4. Antes de guardar, elimina secretos, tokens y datos personales (emails, nombres de terceros).
5. Incluye el archivo de sesión en el commit de esa sesión, o en un commit `docs(prompts)` aparte.
