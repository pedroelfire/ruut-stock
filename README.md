# Stocks

Una watchlist de acciones de EE. UU. tranquila y clara: buscas una acción, la sigues y ves de un vistazo cómo va hoy y cómo ha evolucionado. Prueba técnica fullstack de RUUT, construida con IA como pair programmer y con desarrollo guiado por specs.

## Enlaces y acceso

| Qué | Dónde |
|---|---|
| App (frontend) | https://ruut-stock-web.up.railway.app |
| API (backend) | https://ruut-stock-api.up.railway.app (salud: [`/health`](https://ruut-stock-api.up.railway.app/health)) |
| Repositorio | https://github.com/pedroelfire/ruut-stock |
| Mockup de las convenciones de UI | [Lienzo público](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255) |

**Acceso:** el registro es abierto (email y contraseña de 8 caracteres o más). Para entrar sin registrarse, la pantalla de login tiene el botón **"Use demo account"**, que inicia sesión en un clic con una cuenta demo (`demo@example.com`) que ya tiene 5 acciones en su watchlist.

## Qué construí y para quién

**Usuario:** un inversor minorista que sigue entre 3 y 10 acciones de EE. UU. y entra un par de veces al día para ver cómo van, sin operar desde la app. Las plataformas de trading le dan ruido (noticias, anuncios, decenas de indicadores) cuando solo quiere responder tres preguntas:

1. ¿Cómo van hoy mis acciones? → **Watchlist**: precio, variación del día (absoluta y %) y sparkline del último mes, con refresco automático mientras el mercado está abierto.
2. ¿Cómo ha evolucionado una acción concreta? → **Detalle**: gráfico de área con rangos `1D · 1W · 1M · 6M · 1Y`, tooltip, variación del periodo y métricas clave (apertura, máximo, mínimo, cierre anterior, volumen y rango de 52 semanas).
3. ¿Hay alguna acción nueva que quiera seguir? → **Buscador** siempre visible, con `⌘K` / `Ctrl+K`, debounce de 300 ms y navegación con teclado; se añade a la watchlist desde los resultados.

**El detalle que más cuidé: la honestidad de los datos.** El plan gratuito de Twelve Data da 8 créditos por minuto, así que el límite se va a alcanzar. La app nunca falla en silencio: muestra un banner "Data limit reached" con cuenta atrás y reintento automático, marca con `Stale` cada precio servido desde caché, distingue "no hay precios guardados" de "mostrando los últimos guardados", y separa "el símbolo no existe" de "no hay créditos" y de "el proveedor falló".

Otros detalles: interfaz responsive (tabla en escritorio, tarjetas en móvil, buscador a pantalla completa), modo oscuro según el sistema, altas y bajas optimistas en la watchlist, skeletons con la forma real del contenido, contraste AA, foco visible y gráficos con resumen accesible. Las convenciones visuales están en [docs/ui-ux-conventions.md](docs/ui-ux-conventions.md).

### Qué dejé fuera y por qué

| Fuera | Por qué |
|---|---|
| Operar, carteras con posiciones y P&L | El usuario no opera desde la app; añadiría complejidad sin responder sus tres preguntas |
| Noticias, perfiles de empresa, indicadores técnicos | Es justo el ruido del que huye el usuario, y costaría créditos que el plan gratuito no tiene |
| Mercados fuera de EE. UU., cripto y forex | El plan gratuito de Twelve Data solo garantiza acciones y ETF de EE. UU. |
| Más de 8 símbolos por watchlist | Es lo que cabe en un minuto de créditos (8/min): una watchlist en frío pide un quote por símbolo |
| Comparador de acciones y selector de tema | Eran extras "si sobra tiempo"; prioricé pulir los estados de límite y error |
| Recuperación de contraseña y verificación de email | Requieren un servicio de correo; fuera del alcance de 3 horas |

## Arquitectura

```
 Navegador
    │  cookie httpOnly "ruut_session" (el JWT nunca llega a JavaScript)
    ▼
┌──────────────────────────────┐      red privada de Railway       ┌──────────────────────────────┐
│ web: Next.js 16 (App Router) │  Authorization: Bearer <JWT>       │ api: Express 5 + TypeScript  │
│ · páginas y componentes      │ ─────────────────────────────────▶ │ · auth: registro, login, JWT │
│ · BFF: Route Handlers        │   api.railway.internal:4000        │ · watchlist (Prisma)         │
│   /api/auth/*, /api/bff/*    │                                    │ · market: caché + créditos   │
└──────────────────────────────┘                                    └──────┬────────────────┬──────┘
                                                                           │                │
                                                                    ┌──────▼─────┐   ┌──────▼──────┐
                                                                    │ PostgreSQL │   │ Twelve Data │
                                                                    └────────────┘   └─────────────┘
```

- **Monorepo pnpm:** `apps/web`, `apps/api` y `packages/shared` (esquemas Zod y tipos compartidos: el contrato entre los dos lados).
- **Auth (JWT entre frontend y backend):** Express emite un JWT HS256 con `exp`. Next.js lo guarda en una cookie httpOnly, `Secure` y `SameSite=Lax`, y lo reenvía como `Authorization: Bearer` en cada llamada al API. Las rutas se protegen en `proxy.ts` (Next 16) y el API valida el token en cada endpoint privado.
- **Datos de mercado solo a través del backend:** el navegador nunca habla con Twelve Data. Llama a la pasarela `/api/bff/*` de Next, que reenvía a Express solo las rutas de una lista blanca.
- **Caché y presupuesto de créditos en el API:** caché LRU con TTL por tipo de dato (quote: 2 min con el mercado abierto y 15 min cerrado; series según el rango), deduplicación de peticiones en vuelo, fallback a dato obsoleto si el proveedor falla y caché negativa de símbolos inexistentes. Un presupuesto de créditos (8/min, 800/día) reserva antes de llamar y responde `RATE_LIMITED` con `retryAfter` en lugar de dejar que el proveedor falle.
- **Frontend:** TanStack Query (refresco según el estado del mercado, sin reintentos en 4xx), Tailwind 4 + shadcn/ui, Lightweight Charts (TradingView) para los gráficos.

Los specs completos: [producto](prompts/specs/01-product.md), [backend](prompts/specs/02-backend.md) y [frontend](prompts/specs/03-frontend.md).

## Decisiones y trade-offs

| Decisión | Por qué | Coste |
|---|---|---|
| **BFF con cookie httpOnly** en lugar de guardar el JWT en el navegador | El token no es accesible desde JavaScript (XSS) y la cookie vive solo en el dominio de la web, sin CORS ni cookies entre dominios | Un salto más (navegador → Next → Express) y protección CSRF propia en los POST (`Sec-Fetch-Site` / `Origin` y exigencia de JSON) |
| **Express emite el JWT, Next solo lo transporta** | Cumple el requisito (JWT entre frontend y backend) y el API sigue siendo usable por cualquier cliente | Sin refresh tokens: la sesión dura 1 h y luego se vuelve a iniciar |
| **Twelve Data** | Búsqueda, quotes y series en el plan gratuito, con el límite diario más generoso | 8 créditos/min obliga a caché agresiva, presupuesto de créditos y un tope de 8 símbolos |
| **Caché en memoria** (LRU) en lugar de Redis | Un solo proceso de larga vida en Railway; cero infraestructura extra | Se pierde en cada redeploy y no escala a varias réplicas |
| **Railway Postgres** en lugar de Supabase | Web, API y base de datos en un solo proyecto, con red privada entre servicios y variables referenciadas | Depende del periodo de prueba de Railway (30 días, 5 USD) |
| **Railway** como hosting | Servidores Node de larga vida (no serverless), ideal para la caché en memoria; dominio público para cada servicio | Plan gratuito limitado; ver "Despliegue" |
| **Lightweight Charts** | Gráficos financieros ligeros y rápidos, con crosshair y escalas de tiempo pensadas para mercados | Exige mantener el logo de atribución de TradingView |
| **Prisma 7 con `@prisma/adapter-pg`** | Migraciones versionadas y tipos generados desde el esquema | Un paso de `prisma generate` en el build |
| **Dockerfiles** en lugar del builder automático (Railpack) | Control total del monorepo pnpm: versión de pnpm, devDependencies y build desde la raíz | Imágenes más grandes (una sola etapa, sin podar dependencias) |
| **Tests solo de lo propenso a fallar** | Auth, caché, presupuesto de créditos, mapeo del proveedor, formateadores, hooks con lógica y estados de error | Sin tests E2E automatizados; la verificación de punta a punta se hizo a mano y con un navegador headless |

## Cómo correrlo en local

Requisitos: Node 24 (o 22.13+), pnpm 9 (`corepack enable` o `npm i -g pnpm@9.7.1`), Docker (para Postgres) y una API key gratuita de [Twelve Data](https://twelvedata.com).

```bash
pnpm install
pnpm db:up                                   # Postgres 17 en localhost:5432 (compose.yaml)

cp apps/api/.env.example apps/api/.env       # rellena TWELVE_DATA_API_KEY, JWT_SECRET y DEMO_USER_PASSWORD
cp apps/web/.env.example apps/web/.env.local # DEMO_USER_* iguales a las del api

pnpm --filter @ruut/api db:migrate           # crea las tablas
pnpm --filter @ruut/api db:seed              # crea la cuenta demo con 5 acciones
pnpm dev                                     # web en http://localhost:3000 y api en http://localhost:4000
```

- `JWT_SECRET` necesita 32 caracteres o más: `openssl rand -base64 32`.
- Next.js expande `$VAR` dentro de los `.env`: si la contraseña demo lleva `$`, escríbelo como `\$` en `apps/web/.env.local` (el comentario de `.env.example` lo explica).

Comprobaciones (las mismas que pasan antes de cada commit):

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Hay 298 tests: 174 en el API (Vitest + Supertest, siempre con Twelve Data simulado) y 124 en la web (Vitest + Testing Library).

## Despliegue

Railway, con un proyecto de tres recursos (Postgres, `api` y `web`) descrito como código en [.railway/railway.ts](.railway/railway.ts) y aplicado con `railway config apply`. Cada servicio se construye desde la raíz del repo con su Dockerfile ([apps/api/Dockerfile](apps/api/Dockerfile) y [apps/web/Dockerfile](apps/web/Dockerfile)) y se redespliega en cada push a `main` que toque sus archivos. El pre-deploy del API ejecuta las migraciones y el seed idempotente de la cuenta demo. Los secretos no están en el repo: se fijan en Railway con la CLI.

El plan original usaba `railway.json`, pero Railway lo deprecó (deja de leerlo el 2026-12-01) en favor de Infrastructure as Code. El runbook completo está en [PLAN.md §6](PLAN.md#6-hosting-railway).

## Tiempo invertido

La estimación era de 3 horas. Medido por la hora de los commits (tiempo de reloj; parte del trabajo de los agentes corría en paralelo mientras yo revisaba):

| Fase | Tiempo |
|---|---|
| 0 · Plan, specs, agentes, mockup de UI y andamiaje del monorepo | ~1 h 05 min |
| 1 · Backend base y auth JWT | ~35 min |
| 2 · Integración con Twelve Data, caché, créditos y watchlist | ~45 min |
| 3 · Frontend: BFF, sesión, protección de rutas y layout | ~40 min |
| 4 · Buscador, watchlist, detalle con gráfico y estados | ~55 min |
| 5 · Despliegue en Railway (en parte, en paralelo con el cierre de la Fase 4) | ~40 min |
| 6 · README, registro de prompts y cierre (en paralelo con el despliegue) | ~25 min |
| **Total de reloj** (de la primera petición al último commit) | **~4 h 45 min** |

**Dónde se fue el tiempo extra:** sobre todo en la Fase 0 (escribir los specs antes de pedir código, que ahorró correcciones después) y en las rondas de revisión. Cada fase pasó por `code-reviewer` hasta su aprobación, y varias rondas encontraron bugs reales: un CSRF en el login, reembolsos de créditos que permitían superar el límite, sparklines que gastaban los 8 créditos de golpe. En el despliegue se sumó migrar de `railway.json` a Infrastructure as Code.

## Qué haría con más tiempo

- **Caché compartida en Redis** (o en Postgres) para que sobreviva a los redeploys y permita varias réplicas del API.
- **Tests E2E** con Playwright en CI sobre los flujos principales (login, buscar, añadir, detalle), con Twelve Data simulado.
- **Refresh tokens** y revocación de sesiones, en lugar de una sesión fija de 1 h.
- **Comparador**: varias acciones en un mismo gráfico, normalizadas a base 100.
- **Alertas de precio** por email cuando una acción cruza un umbral.
- **WebSocket de Twelve Data** para precios en tiempo real con el mercado abierto (requiere plan de pago).
- Endpoint `GET /watchlist` sin quotes para que el detalle y el buscador sepan qué símbolos están sin gastar caché, y alinear los mensajes de error del API con el copy del producto.

## Uso de IA

Todo se construyó con **Claude Code (Claude Opus 5.5)** y cinco agentes especializados (`backend-dev`, `frontend-dev`, `code-reviewer`, `ui-ux-guardian` y `auditor`), con el flujo spec → implementación → revisión de UI → revisión de código → commit. La carpeta [prompts/](prompts/README.md) contiene las herramientas y modelos, las reglas y system prompts, los specs, cada prompt enviado en orden y una tabla honesta de **dónde se equivocó la IA y cómo se corrigió**.
