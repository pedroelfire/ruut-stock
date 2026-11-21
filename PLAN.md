# Plan de desarrollo: prueba técnica Fullstack RUUT

> App de datos y visualización de acciones, construida con IA como pair programmer.
> Fuente: `fullstack-technical-test.pdf` (8 páginas).

---

## 1. Resumen de la prueba

| Aspecto | Detalle |
|---|---|
| Esfuerzo estimado | ~3 horas (orientativo; si te pasas, se explica en el README dónde se fue el tiempo) |
| Plazo | 7 días desde la recepción |
| Entregable | 2 servicios desplegados y públicos (frontend + backend), cada uno con su URL, y el repositorio |
| Contacto | Andy Nadal, CTO |

### Requisitos fijos (no negociables)

1. **Backend conectado a una API pública y gratuita de datos de mercado.** Los datos llegan al frontend *a través del backend*, nunca directo desde el navegador.
2. **Autenticación JWT entre frontend y backend.**
3. **Ambos servicios desplegados** en hosting gratuito, con URL pública propia.
4. **Carpeta `/prompts`** con todos los prompts usados (system prompts, specs, sesiones en orden).
5. **README** con: cómo correrlo localmente, arquitectura, decisiones clave y trade-offs, tiempo invertido, y qué haría con más tiempo. Además: qué se construyó, qué se dejó fuera y por qué.
6. **Acceso para revisar:** usuario y contraseña de prueba, o registro abierto.

### Qué evalúan

- **Spec-driven development con IA:** convertir una idea en un spec claro, guiar a la IA con él y revisar lo que produce. Pesa más el criterio que la cantidad de código escrito.
- **Creatividad y usabilidad:** la tarea es abierta a propósito. Cuenta qué decides construir, cómo se siente y los detalles.
- **Honestidad:** anotar dónde se equivocó la IA y qué se corrigió a mano.
- **Ser dueño del código:** en la entrevista se revisa el código en conjunto y puede haber un cambio pequeño en vivo.

### Preferencias del evaluador

- Stack: TypeScript, **Next.js** (frontend) y **Express** (backend).
- Base de datos: recomiendan Supabase (cualquier otra vale).
- Datos: recomiendan **Twelve Data** (800 créditos/día, 8/min, sin tarjeta). El coste es por símbolo y por request, y los datos gratuitos pueden venir con retraso.
- Piden diseñar pensando en el rate limit: **caché, debounce en la búsqueda y manejo elegante del error de límite alcanzado.**

---

## 2. Propuesta de producto (pendiente de confirmar)

> La prueba no trae lista de features: el producto lo decidimos nosotros. Esta es una propuesta inicial que se cerrará en `prompts/specs/01-product.md`.

**Para quién:** inversor minorista que sigue un puñado de acciones y quiere ver de un vistazo cómo van, sin la complejidad de una plataforma de trading.

**Núcleo (MVP, cabe en ~3 h):**

1. **Registro e inicio de sesión** (registro abierto + usuario demo).
2. **Búsqueda de símbolos** con debounce y autocompletado (`/symbol_search`).
3. **Watchlist personal** guardada en la base de datos: precio actual, variación diaria (absoluta y %) y sparkline.
4. **Detalle de la acción:** gráfico de precio con rangos (1D, 1W, 1M, 6M, 1Y), métricas del quote (open, high, low, previous close, volume, 52-week range).

> Toda la interfaz y el código van en inglés; solo los `.md` en español (ver `CLAUDE.md`).
5. **Estados cuidados:** loading con skeletons, vacío, error, y un aviso claro de "límite de API alcanzado, reintenta en X s", mostrando el último dato en caché.

**Extras, solo si sobra tiempo (por orden de prioridad):**

- Comparador: rendimiento normalizado (base 100) de 2 a 4 símbolos en un mismo gráfico.
- Indicador "datos con retraso" y hora del último update.
- Modo oscuro.

**Fuera de alcance (justificar en el README):** trading real, tiempo real por WebSocket (el plan gratuito no lo soporta bien y gasta créditos), noticias, portafolios con P&L, alertas de precio.

---

## 3. Stack

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** en todo el repo | Preferencia del evaluador; tipos compartidos entre front y back |
| Monorepo | **pnpm workspaces** | Un solo repo, un paquete `shared` con tipos y esquemas Zod |
| Frontend | **Next.js 15 (App Router)** + React | Preferido por el evaluador; los Route Handlers nos sirven de BFF (ver Auth) |
| UI | **Tailwind CSS** + **shadcn/ui** | Velocidad y consistencia visual sin diseñar componentes desde cero |
| Gráficos | **TradingView Lightweight Charts** | Hecho para series financieras (velas, líneas, áreas), ligero, licencia Apache 2.0 |
| Data fetching (cliente) | **TanStack Query** | Caché en cliente, reintentos, estados de loading y error |
| Backend | **Express 5** + TypeScript | Preferido por el evaluador |
| Validación | **Zod** (en `packages/shared`) | Mismo esquema valida requests en el back y tipa respuestas en el front |
| Base de datos | **PostgreSQL en Railway** | Todo en un solo proyecto de Railway; red privada entre servicios. Supabase sería la alternativa si hiciera falta auth gestionada, pero el JWT lo emitimos nosotros |
| ORM | **Prisma** | Migraciones sencillas y cliente tipado |
| Auth | **jsonwebtoken** + **bcrypt** | JWT propio, emitido por Express (requisito explícito) |
| Caché de mercado | **LRU en memoria** (`lru-cache`) con TTL por tipo de dato | Suficiente para una sola instancia; reduce el consumo de créditos de Twelve Data |
| Rate limiting propio | **express-rate-limit** | Protege nuestros créditos frente a abuso |
| Seguridad HTTP | **helmet** + **cors** (lista blanca) | Lo básico |
| Logs | **pino** | Logs estructurados legibles en Railway |
| Tests | **Vitest** + **Supertest** | Tests de auth, caché y adaptador de Twelve Data |
| Lint/format | **ESLint** + **Prettier** | |
| Proveedor de datos | **Twelve Data** | Recomendado; cubre búsqueda, quotes y series en el plan gratuito |

### Decisión de arquitectura de auth: Next.js como BFF

El frontend y el backend viven en dominios distintos (`*.up.railway.app` está en la Public Suffix List, así que cuentan como sitios diferentes). Una cookie cross-site con `SameSite=None` falla en Safari y en navegadores que bloquean cookies de terceros. Por eso:

```
Navegador ──cookie httpOnly──▶ Next.js (Route Handlers /api/*) ──Authorization: Bearer <JWT>──▶ Express ──▶ Twelve Data
                                                                                              └──▶ Postgres
```

- Express emite el JWT en `POST /auth/login` y valida `Authorization: Bearer` en cada ruta protegida. Con esto se cumple el requisito de JWT entre front y back.
- Next.js guarda el JWT en una **cookie httpOnly, Secure y SameSite=Lax** en su propio dominio, así que el token nunca queda expuesto a JavaScript del navegador (protección frente a XSS).
- Los Server Components y Route Handlers de Next reenvían el token a Express.
- Access token de vida corta (por ejemplo 1 h). Refresh token: fuera del MVP, se menciona en "qué haría con más tiempo".

### Estrategia frente al rate limit (8 créditos/min, 800/día)

| Dato | Endpoint Twelve Data | TTL de caché |
|---|---|---|
| Búsqueda de símbolos | `/symbol_search` | 24 h |
| Quote | `/quote` (en lote: `symbol=AAPL,MSFT,...`) | 60 s |
| Serie intradía (1D) | `/time_series?interval=5min` | 5 min |
| Serie diaria (1M o más) | `/time_series?interval=1day` | 1 h |

- **Debounce de 300 ms** en la búsqueda del frontend y longitud mínima de 1 a 2 caracteres.
- **Deduplicación de requests en vuelo:** si dos usuarios piden `AAPL` a la vez, sale una sola llamada.
- **Quotes en lote** para la watchlist (ojo: el coste sigue siendo por símbolo).
- **Stale-while-error:** si Twelve Data responde con límite alcanzado (HTTP 429 o `code: 429` en el body), servimos el último valor en caché con `stale: true` y devolvemos `429` + `Retry-After` solo si no hay nada en caché.
- Error normalizado hacia el frontend: `{ error: { code: "RATE_LIMITED" | "NOT_FOUND" | "UPSTREAM_ERROR" | ..., message, retryAfter? } }`.

---

## 4. Estructura de carpetas

```
ruut-stocks/
├── apps/
│   ├── api/                          # Express (servicio "api" en Railway)
│   │   ├── src/
│   │   │   ├── index.ts              # bootstrap del servidor
│   │   │   ├── app.ts                # crea la app Express (exportada para tests)
│   │   │   ├── config/
│   │   │   │   └── env.ts            # variables de entorno validadas con Zod
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # verifica el JWT y añade req.user
│   │   │   │   ├── error-handler.ts  # formato de error uniforme
│   │   │   │   └── rate-limit.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/             # routes, controller, service
│   │   │   │   ├── market/           # search, quote, time-series
│   │   │   │   └── watchlist/        # CRUD de la watchlist del usuario
│   │   │   ├── providers/
│   │   │   │   └── twelve-data/      # cliente HTTP, mapeo de tipos, errores
│   │   │   ├── lib/
│   │   │   │   ├── cache.ts          # LRU + TTL + dedupe en vuelo
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── logger.ts
│   │   │   │   └── prisma.ts
│   │   │   └── routes.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # User, WatchlistItem
│   │   │   ├── migrations/
│   │   │   └── seed.ts               # usuario demo + watchlist inicial
│   │   ├── test/
│   │   ├── railway.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Next.js (servicio "web" en Railway)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/
│       │   │   │   ├── login/page.tsx
│       │   │   │   └── register/page.tsx
│       │   │   ├── (app)/
│       │   │   │   ├── layout.tsx    # layout protegido (redirige si no hay sesión)
│       │   │   │   ├── page.tsx      # dashboard / watchlist
│       │   │   │   └── stocks/[symbol]/page.tsx
│       │   │   ├── api/              # BFF: reenvía a Express con el JWT de la cookie
│       │   │   │   ├── auth/[action]/route.ts
│       │   │   │   └── [...proxy]/route.ts
│       │   │   ├── layout.tsx
│       │   │   └── globals.css
│       │   ├── components/
│       │   │   ├── ui/               # shadcn/ui
│       │   │   ├── charts/           # PriceChart, Sparkline
│       │   │   ├── search/           # SymbolSearch (con debounce)
│       │   │   └── watchlist/
│       │   ├── hooks/                # useDebounce, useQuote, useSeries...
│       │   ├── lib/
│       │   │   ├── api-client.ts     # fetch tipado hacia el BFF
│       │   │   ├── session.ts        # lectura y escritura de la cookie
│       │   │   └── format.ts         # moneda, %, fechas
│       │   └── middleware.ts         # protección de rutas en el edge
│       ├── public/
│       ├── railway.json
│       ├── next.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                       # tipos y esquemas Zod compartidos
│       ├── src/
│       │   ├── schemas/              # auth, market, watchlist
│       │   ├── types/
│       │   └── index.ts
│       └── package.json
│
├── prompts/                          # estructura sugerida por el PDF
│   ├── README.md                     # herramientas, modelos, forma de trabajar, errores de la IA
│   ├── system/                       # índice de CLAUDE.md, agentes y reglas
│   ├── specs/
│   │   ├── 01-product.md
│   │   ├── 02-backend.md
│   │   └── 03-frontend.md
│   └── sessions/                     # prompts enviados, en orden (NN-topic.md)
│       ├── 00-planning.md
│       ├── 01-agents.md
│       ├── 02-ui-mockup.md
│       └── 03-repo-setup.md
│
├── .claude/
│   └── agents/                       # backend-dev, frontend-dev, code-reviewer, auditor, ui-ux-guardian
├── docs/
│   ├── ui-ux-conventions.md          # fuente de verdad visual
│   └── audits/                       # informes del agente auditor
├── .env.example
├── .gitignore
├── CLAUDE.md                         # reglas del proyecto para la IA
├── PLAN.md                           # este documento
├── README.md
├── package.json                      # scripts raíz (dev, build, lint, test)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Modelo de datos (Prisma)

```prisma
model User {
  id           String          @id @default(cuid())
  email        String          @unique
  passwordHash String
  createdAt    DateTime        @default(now())
  watchlist    WatchlistItem[]
}

model WatchlistItem {
  id        String   @id @default(cuid())
  userId    String
  symbol    String
  exchange  String?
  addedAt   DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, symbol])
}
```

### API del backend (borrador)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | No | Healthcheck para Railway |
| POST | `/auth/register` | No | Crea el usuario y devuelve el JWT |
| POST | `/auth/login` | No | Devuelve el JWT |
| GET | `/auth/me` | Sí | Usuario actual |
| GET | `/market/search?q=` | Sí | Búsqueda de símbolos |
| GET | `/market/quote?symbols=AAPL,MSFT` | Sí | Quotes (en lote) |
| GET | `/market/series/:symbol?range=1D\|1W\|1M\|6M\|1Y` | Sí | Serie de precios; el backend traduce el rango a intervalo y número de puntos |
| GET | `/watchlist` | Sí | Watchlist con quotes incluidos |
| POST | `/watchlist` | Sí | Añade un símbolo |
| DELETE | `/watchlist/:symbol` | Sí | Elimina un símbolo |

---

## 5. Fases de desarrollo

> Presupuesto total: ~3 h de construcción más el tiempo de spec y de README. Cada fase termina con un commit y su sesión registrada en `prompts/sessions/`.

### Fase 0: Spec y andamiaje (~30 min)

**Objetivo:** tener claro qué se construye antes de pedírselo a la IA (spec first).

- [ ] Confirmar los límites actuales de Twelve Data en su página de precios y obtener la API key.
- [ ] Escribir `prompts/specs/01-product.md` (usuario, features del MVP, lo que queda fuera).
- [ ] Escribir `prompts/specs/02-backend.md` (endpoints, modelo de datos, caché, errores).
- [ ] Escribir `prompts/specs/03-frontend.md` (pantallas, flujos, estados).
- [x] Crear `CLAUDE.md` con las reglas del proyecto (idioma, commits, tests, registro de prompts) e indexarlo en `prompts/system/`.
- [x] Definir los agentes en `.claude/agents/` y las convenciones de UI/UX con su mockup público.
- [x] Inicializar git con `.gitignore` y la estructura de `prompts/`.
- [ ] Inicializar el monorepo pnpm, `tsconfig.base.json`, ESLint/Prettier y `.env.example`.

**Hecho cuando:** los specs están escritos y `pnpm install` funciona en un repo vacío pero estructurado.

### Fase 1: Backend base y autenticación (~40 min)

**Objetivo:** un Express funcional con usuarios y JWT.

- [ ] `app.ts` con helmet, cors (lista blanca), JSON, pino y manejador de errores.
- [ ] `config/env.ts` que valida las variables con Zod y falla al arrancar si falta alguna.
- [ ] Prisma con `User` y `WatchlistItem`, primera migración y seed con el usuario demo.
- [ ] `POST /auth/register`, `POST /auth/login` y `GET /auth/me` con bcrypt y JWT.
- [ ] Middleware `auth` que valida `Authorization: Bearer`.
- [ ] `GET /health`.
- [ ] Tests: registro, login correcto e incorrecto, y ruta protegida sin token o con token inválido.

**Hecho cuando:** se puede hacer login con curl y llamar a `/auth/me` con el token.

### Fase 2: Integración con Twelve Data y caché (~40 min)

**Objetivo:** datos de mercado servidos por nuestro backend, protegidos frente al rate limit.

- [ ] `providers/twelve-data`: cliente con timeout, mapeo a tipos propios y detección del error 429 (tanto por status HTTP como por el campo `code` del body).
- [ ] `lib/cache.ts`: LRU con TTL por clave, dedupe de requests en vuelo y fallback a dato obsoleto.
- [ ] Endpoints `/market/search`, `/market/quote` y `/market/series/:symbol`.
- [ ] CRUD de `/watchlist` que devuelve los quotes en lote.
- [ ] `express-rate-limit` por usuario o IP.
- [ ] Tests del adaptador con respuestas mockeadas (éxito, 429, símbolo inexistente).

**Hecho cuando:** dos llamadas seguidas al mismo quote solo consumen un crédito y un 429 simulado devuelve el dato en caché con `stale: true`.

### Fase 3: Frontend, auth y layout (~30 min)

**Objetivo:** el usuario puede registrarse, entrar y ver un layout protegido.

- [ ] Next.js con Tailwind y shadcn/ui.
- [ ] Route Handlers BFF: login, registro y logout (escriben y borran la cookie httpOnly) y un proxy genérico hacia Express.
- [ ] `middleware.ts` que redirige a `/login` si no hay sesión.
- [ ] Pantallas de login y registro con validación (Zod de `shared`) y errores claros.
- [ ] Layout con cabecera, buscador y menú de usuario.

**Hecho cuando:** login, logout y redirecciones funcionan, y el JWT no es accesible desde `document.cookie`.

### Fase 4: Features del producto (~50 min)

**Objetivo:** la experiencia principal, pulida.

- [ ] `SymbolSearch` con debounce de 300 ms, navegación con teclado y resultados agrupados por exchange.
- [ ] Dashboard con la watchlist: precio, variación coloreada, sparkline, añadir y quitar.
- [ ] Página `/stocks/[symbol]`: gráfico con Lightweight Charts, selector de rango y tarjetas de métricas.
- [ ] Estados de loading (skeletons), vacío ("añade tu primera acción") y error.
- [ ] Aviso de límite alcanzado con cuenta atrás e indicador de dato obsoleto o con retraso.
- [ ] Responsive (móvil primero).
- [ ] (Si sobra tiempo) Comparador normalizado y modo oscuro.

**Hecho cuando:** el flujo buscar → añadir a la watchlist → abrir el detalle → cambiar de rango funciona de punta a punta con datos reales.

### Fase 5: Despliegue en Railway (~20 min)

**Objetivo:** dos URLs públicas funcionando. Ver la sección 6.

**Hecho cuando:** desde una ventana de incógnito se puede registrar un usuario nuevo y usar la app completa en producción, y `GET <api>/health` responde 200.

### Fase 6: README, prompts y cierre (~20 min)

**Objetivo:** que el repo cuente la historia del desarrollo.

- [ ] README: qué se construyó y para quién, cómo correrlo localmente, diagrama de arquitectura, decisiones y trade-offs (BFF, caché en memoria, Railway Postgres en vez de Supabase, Lightweight Charts), tiempo invertido por fase, qué se dejó fuera y qué haría con más tiempo.
- [ ] URLs públicas y credenciales del usuario demo.
- [ ] `prompts/README.md`: herramientas y modelos usados, flujo de trabajo, **dónde se equivocó la IA y qué se corrigió a mano**.
- [ ] Revisar que no haya secretos en `prompts/` ni en el historial de git.
- [ ] Ensayar el walkthrough de la entrevista y preparar ideas para "un cambio pequeño en vivo".

---

## 6. Hosting: Railway

### Por qué Railway

- **Los tres componentes en un solo proyecto:** `api` (Express), `web` (Next.js) y `Postgres`, con un único panel, logs y variables.
- **Monorepo soportado:** cada servicio apunta a su carpeta y despliega solo cuando cambian sus archivos (watch paths).
- **Red privada:** Next.js puede hablar con Express por `api.railway.internal` sin salir a internet, y aun así el API tiene su dominio público (requisito de la prueba).
- **Postgres gestionado** en un clic, con `DATABASE_URL` inyectada mediante referencia de variables.
- **Despliegue automático** desde GitHub en cada push a `main`.
- Servidores Node de larga vida (no serverless), ideal para la caché en memoria del backend.

> ⚠️ **Verificar el plan gratuito antes de empezar.** Railway ya no ofrece un tier gratuito ilimitado: da un periodo de prueba con crédito y después un plan Free con crédito mensual muy limitado, o el Hobby de pago. Hay que confirmar en la página de precios que los 3 servicios caben en el crédito disponible hasta después de la entrevista, y anotarlo en el README como trade-off. Si no alcanzara, el plan B es **web en Vercel + api en Railway + Supabase** como base de datos, sin cambios de código (solo variables de entorno).

### Topología

```
Railway project: ruut-stocks
├── web       (apps/web)   → https://ruut-stocks-web.up.railway.app   (público)
├── api       (apps/api)   → https://ruut-stocks-api.up.railway.app   (público)
│                            api.railway.internal:PORT                (privado, usado por web)
└── Postgres  (plugin)     → DATABASE_URL referenciada desde api
```

### Configuración por servicio

**api: `apps/api/railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "buildCommand": "pnpm --filter @ruut/shared build && pnpm --filter @ruut/api build"
  },
  "deploy": {
    "preDeployCommand": "pnpm --filter @ruut/api exec prisma migrate deploy",
    "startCommand": "pnpm --filter @ruut/api start",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**web: `apps/web/railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "buildCommand": "pnpm --filter @ruut/shared build && pnpm --filter @ruut/web build"
  },
  "deploy": {
    "startCommand": "pnpm --filter @ruut/web start",
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

> Nota de monorepo: como ambos servicios dependen de `packages/shared`, el build se ejecuta desde la **raíz del repo**. En Railway se deja el *Root Directory* en `/`, se indica la ruta del archivo de config (`apps/api/railway.json` o `apps/web/railway.json`) y se configuran los *Watch Paths* (`apps/api/**`, `packages/shared/**` para api; `apps/web/**`, `packages/shared/**` para web).

### Variables de entorno

| Servicio | Variable | Valor |
|---|---|---|
| api | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| api | `JWT_SECRET` | aleatorio de 32 bytes o más |
| api | `JWT_EXPIRES_IN` | `1h` |
| api | `TWELVE_DATA_API_KEY` | API key de Twelve Data |
| api | `CORS_ORIGIN` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| api | `PORT` | la inyecta Railway (escuchar en `0.0.0.0`) |
| web | `API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |
| web | `NEXT_PUBLIC_API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` (solo informativo y para el README) |
| web | `SESSION_COOKIE_NAME` | `ruut_session` |

### Pasos de despliegue

1. Subir el repo a GitHub (público).
2. Crear el proyecto en Railway y añadir **Postgres**.
3. Añadir el servicio **api** desde el repo, con config path `apps/api/railway.json`, sus variables, y generar el dominio público.
4. Añadir el servicio **web** desde el mismo repo, con config path `apps/web/railway.json`, sus variables, y generar el dominio público.
5. Ejecutar el seed una vez (`railway run pnpm --filter @ruut/api exec prisma db seed`) para crear el usuario demo.
6. Smoke test en producción: `/health`, registro, login, búsqueda, watchlist y detalle.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Agotar los 800 créditos/día durante la revisión | Caché con TTL, quotes en lote, dedupe, fallback a dato obsoleto y watchlist del usuario demo limitada a unos 5 símbolos |
| Rate limit por minuto (8/min) al cargar la watchlist | Un solo request en lote para los quotes; sparklines con datos diarios cacheados durante 1 h |
| Crédito de Railway insuficiente | Verificarlo en la Fase 0; plan B con Vercel y Supabase |
| La caché en memoria se pierde en cada redeploy | Aceptable para el MVP; con más tiempo, mover la caché a Postgres o Redis |
| Cookies entre dominios | Patrón BFF: la cookie vive solo en el dominio de Next |
| Pasarse de las 3 h | Extras solo después de cerrar la Fase 5; registrar el tiempo real por fase para el README |

---

## 8. Qué haría con más tiempo (borrador para el README)

- Refresh tokens con rotación y revocación.
- Caché compartida en Redis, más un job que precaliente los símbolos populares.
- Comparador de rendimiento e indicadores técnicos (SMA, RSI).
- Alertas de precio por email.
- Tests E2E con Playwright y CI en GitHub Actions.
- Observabilidad: métricas de aciertos de caché y créditos consumidos por día.
