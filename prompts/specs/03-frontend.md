# Spec 03: Frontend (`apps/web`)

> Rutas, sesión, pantallas, obtención de datos y estados. Cubre las fases 3 y 4 de PLAN.md. Lo visual está en [docs/ui-ux-conventions.md](../../docs/ui-ux-conventions.md) y en el [mockup público](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255); el contrato del API, en [02-backend.md](02-backend.md).

## 1. Stack

- **Next.js 16** (App Router) con React 19 y TypeScript (`strict`).
- Tailwind CSS v4 con tokens en `globals.css`, shadcn/ui y lucide-react.
- TanStack Query v5, Zod (esquemas de `packages/shared`) y Lightweight Charts.
- Inter con `next/font`.
- Tests con Vitest y Testing Library.
- `tsconfig.json` extiende el base y sobrescribe `lib` (con `DOM`), `jsx`, `module: "esnext"` y `moduleResolution: "bundler"`. `next-env.d.ts` va al `.gitignore`.

## 2. Rutas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/login` | Solo sin sesión | Formulario y botón "Use demo account" |
| `/register` | Solo sin sesión | Formulario de registro |
| `/` | Con sesión | Dashboard: watchlist |
| `/stocks/[symbol]` | Con sesión | Detalle del símbolo |
| `not-found` y `error` | Todas | Páginas de error con la marca y enlace a `/` |

**Protección de rutas:** `src/proxy.ts`, la convención de Next 16 que sustituye a `middleware.ts`. Decodifica el `exp` del JWT de la cookie sin verificar la firma (quien la verifica es el API):
- Sin cookie en una ruta protegida → `/login?next=<ruta>`.
- Cookie con `exp` vencido en una ruta protegida → `/login?expired=1&next=<ruta>`.
- Cookie vigente en `/login` o `/register` → `/`.

## 3. Sesión y BFF

El navegador **nunca** ve el JWT. Solo habla con los Route Handlers de Next, que llaman a Express con `API_INTERNAL_URL`.

| Route Handler | Qué hace |
|---|---|
| `POST /api/auth/login` | Llama a `POST /auth/login`. Si sale bien, guarda el token en la cookie y devuelve `{ data: { user } }`, sin el token |
| `POST /api/auth/register` | Igual, con `POST /auth/register` |
| `POST /api/auth/demo` | Hace login con `DEMO_USER_EMAIL` y `DEMO_USER_PASSWORD`, leídas en el servidor. La contraseña demo nunca llega al bundle del cliente |
| `POST /api/auth/logout` | Borra la cookie y devuelve `204` |
| `GET /api/auth/expired` | Borra la cookie y redirige a `/login?expired=1` (ver abajo) |
| `GET, POST, DELETE /api/bff/[...path]` | Pasarela hacia el API: reenvía con `Authorization: Bearer <cookie>`, incluida la query string, y con `X-Forwarded-For` igual a la IP del navegador (la última entrada del `X-Forwarded-For` que puso el edge de Railway), para los límites por IP del API (spec 02 §4). Los handlers de auth también la reenvían. **Lista blanca** de prefijos (`market/`, `watchlist`), para no ser un proxy abierto; un prefijo no permitido devuelve `404`. Propaga status y body tal cual. Si el API responde `401`, borra la cookie |

- **Cookie** `SESSION_COOKIE_NAME` (`ruut_session`): `httpOnly`, `secure` en producción, `sameSite: "lax"`, `path: "/"` y `maxAge` derivado del `exp` del token recibido (no fijo), para que siga a `JWT_EXPIRES_IN`.
- **Server Components:** leen la cookie y llaman al API con `lib/api-server.ts`, que solo funciona en el servidor (`import "server-only"`). **Ante un 401 redirigen a `/api/auth/expired`**: un Server Component no puede borrar cookies, y sin este paso una cookie con `exp` vigente pero rechazada por el API (por ejemplo, si cambia `JWT_SECRET` en un redeploy) provocaría un bucle de redirecciones entre `/` y `/login`.
- **Client Components:** llaman a la pasarela con `lib/api-client.ts`, que valida cada respuesta con el esquema Zod correspondiente y lanza un `ApiError { code, message, status, retryAfter? }`.

Nota de naming: `proxy.ts` es la protección de rutas de Next; la pasarela hacia el API se llama `bff` para no confundirlas.

Riesgo aceptado: `GET /api/auth/expired` permite cerrar la sesión de otro usuario con un enlace (logout por CSRF). La gravedad es baja y se acepta en el MVP; se menciona en el README.

## 4. Pantallas

### Login y registro

- Campos con `label`, validación en cliente con el mismo esquema Zod del API, y errores vinculados con `aria-describedby`.
- Botón principal en estado de carga mientras se envía. El error del servidor aparece encima del formulario.
- Login: botón secundario **"Use demo account"** y enlace "Create an account". Si existe `?expired=1`, aviso "Your session expired. Please sign in again."
- Al entrar, redirige a `next` o a `/`. `next` solo se acepta si empieza por `/`, no empieza por `//` y no contiene `\` (los navegadores leen `/\evil.com` como `//evil.com`).

### Dashboard (`/`)

- Cabecera con el título `Watchlist`, el texto "N symbols · Updated HH:MM ET", el badge de retraso si algún quote trae `delayMinutes > 0`, y el botón `Add symbol`, que enfoca el buscador.
- Escritorio: tabla. Móvil: tarjetas (§5 de las convenciones). Toda la fila o tarjeta navega al detalle; el botón de quitar no propaga el clic.
- Badge `Stale` por fila cuando su quote trae `stale: true`. Fila con `quote: null`: nombre y ticker visibles, y precio y variación como `—` con el texto accesible "Price unavailable".
- **Sparklines:** se cargan después de los quotes, una petición por símbolo y como máximo 2 a la vez, con su propia query key (`['sparkline', symbol]`). Mientras cargan, skeleton. Si reciben `RATE_LIMITED` o fallan, muestran una línea plana en `--muted-foreground` y se reintentan **en silencio** con su propio `retry` (hasta 3 veces, con `retryDelay` igual a `retryAfter`). **No activan el banner global** (ver §5).
- Estados: skeleton, vacío con las sugerencias AAPL, MSFT y NVDA, error con `Try again`, y banner de límite cuando la respuesta de la watchlist trae `meta.partial` o un `RATE_LIMITED`.

### Detalle (`/stocks/[symbol]`)

- El quote se carga en el servidor (Server Component). La serie se carga en el cliente al elegir el rango.
- El rango elegido vive en la URL (`?range=6M`), para poder compartirlo y que sobreviva al refresco. Por defecto, `1M`.
- `PriceChart` con Lightweight Charts, importado con `next/dynamic` y `ssr: false`. Se redimensiona con `ResizeObserver` y destruye el chart al desmontarse. Lleva un resumen accesible en `aria-label` ("NVDA price, 1M: from $176.20 to $189.84, +7.74%").
- Badge `Stale` junto a la hora del dato cuando el quote o la serie traen `stale: true`.
- Respuestas del quote en el servidor (contrato en el spec 02 §4):
  - `404` → `notFound()` ("We couldn't find "XYZ"").
  - `429` → estado de límite alcanzado dentro de la página (banner con cuenta atrás y `Try again`), **nunca** `notFound()`.
  - `502` (falla el proveedor y no hay nada en caché) → estado de error con `Try again`, **nunca** `notFound()`.
- Datos que llegan del API (verificado con datos reales el 2026-11-22):
  - `quote.volume` puede ser `null`.
  - En los rangos diarios, `t` es la fecha a las 00:00Z.
  - `series.asOf` es la hora de obtención, no la del último punto.
  - Los números llegan sin redondear (por ejemplo `-6.64999`): se formatean siempre con `lib/format.ts`.
- En la watchlist, un fallo del proveedor llega como `200` con `quote: null` y **sin** `meta`: se muestra "Price unavailable" en la fila, sin banner. `meta.partial` solo indica falta de créditos.
- Tras un `POST /watchlist` (devuelve `{ symbol, name, addedAt }` sin quote) se invalida `['watchlist']`.

### Búsqueda (cabecera)

- Componente `SymbolSearch` sobre el `Command` de shadcn: popover en escritorio y diálogo a pantalla completa en móvil.
- Debounce de 300 ms, con cancelación de la petición anterior (`AbortController`, a través de TanStack Query).
- Cada resultado tiene un botón para añadirlo a la watchlist (o un check si ya está) y abre el detalle con `Enter` o con un clic.

## 5. Obtención de datos (TanStack Query)

| Query key | Origen | `staleTime` | Notas |
|---|---|---|---|
| `['search', q]` | `/api/bff/market/search?q=` | 24 h | `enabled` cuando `q` tiene 1 carácter o más |
| `['watchlist']` | `/api/bff/watchlist` | 2 min | `refetchInterval` de 2 min si algún quote trae `isMarketOpen` y de 15 min si no (así una pestaña abierta detecta la apertura del mercado); solo con la pestaña visible |
| `['quote', symbol]` | `/api/bff/market/quote?symbols=` | 2 min | Hidratado desde el servidor en el detalle |
| `['series', symbol, range]` | `/api/bff/market/series/:symbol?range=` | Igual al TTL del backend | Gráfico del detalle. `placeholderData` con el rango anterior para que no parpadee |
| `['sparkline', symbol]` | `/api/bff/market/series/:symbol?range=1M` | 1 h | Key propia de las sparklines, con `meta: { silentRateLimit: true }` y su propio `retry`. El backend comparte la caché con la serie 1M |

- **Mutaciones** (añadir o quitar de la watchlist): actualización optimista, rollback si fallan e invalidación de `['watchlist']`.
- **Reintentos por defecto:** ninguno ante errores 4xx (incluido el 429); uno ante 5xx o error de red. Las sparklines son la única excepción (ver §4).
- **429 global:** un `RateLimitProvider` escucha la caché de queries. Ante un `RATE_LIMITED` o un `meta.partial`, guarda `retryAfter` y muestra el banner con cuenta atrás. Al llegar a cero, refresca las queries activas. Ignora las queries con `meta.silentRateLimit` (sparklines).
- **401 en cliente:** limpia la caché de queries y navega a `/api/auth/expired`, que borra la cookie y lleva a `/login?expired=1`.

## 6. Componentes

Archivos en kebab-case dentro de `src/components/`: `app-header`, `user-menu`, `symbol-search`, `watchlist-table`, `watchlist-card-list`, `sparkline`, `price-chart`, `range-selector`, `key-metrics`, `change-indicator`, `delayed-badge`, `stale-badge`, `rate-limit-banner`, `empty-state`, `error-state` y los skeletons de cada vista. Primitivas de shadcn en `components/ui/`.

`change-indicator` aplica la regla "nunca solo color": signo con U+2212 para los negativos, flecha y color del token.

## 7. Formato (`lib/format.ts`)

Locale `en-US` y zona horaria de mercado `America/New_York`.

| Función | Ejemplo |
|---|---|
| `formatPrice(value, currency)` | `$189.84` |
| `formatChange(value)` | `+2.31`, `−3.48`, `0.00` |
| `formatPercent(value)` | `+1.23%`, `−0.73%`, `0.00%` |
| `formatVolume(value)` | `152.3M` |
| `formatAxisDate(date, range)` | `14:30` (1D), `Nov 12` (1W a 6M), `Nov ’26` (1Y) |
| `formatAsOf(date)` | `As of 14:32 ET` |

## 8. Variables de entorno

`API_INTERNAL_URL`, `SESSION_COOKIE_NAME`, `DEMO_USER_EMAIL` y `DEMO_USER_PASSWORD`, todas de servidor. No hace falta ninguna variable `NEXT_PUBLIC_*`. `DEMO_USER_EMAIL` y `DEMO_USER_PASSWORD` deben coincidir con las del seed del api. Plantilla en `apps/web/.env.example`.

## 9. Tests requeridos

1. `lib/format.ts`: signos, U+2212, cero, monedas, volumen compacto, fechas por rango, zona horaria ET.
2. `useDebounce`.
3. Route Handlers:
   - Login correcto: cookie puesta con `maxAge` derivado del `exp` y token ausente del body.
   - Error propagado y logout.
   - `expired`: borra la cookie y redirige.
   - Pasarela `bff`: prefijo rechazado devuelve `404`, header Bearer añadido y cookie borrada ante un `401`.
4. `proxy.ts`: redirecciones sin cookie, con cookie vencida (`expired=1`) y con cookie vigente en `/login`.
5. `api-client`: mapeo de errores a `ApiError`, `retryAfter` leído y respuesta que no valida.
6. Validación de `next`: rechaza URLs externas, las que empiezan por `//` y las que contienen `\`.
7. `SymbolSearch`: navegación con teclado (`↑` `↓` `Enter` `Esc`).
