# Spec 03: Frontend (`apps/web`)

> Rutas, sesión, pantallas, obtención de datos y estados. Cubre las fases 3 y 4 de PLAN.md. Lo visual está en [docs/ui-ux-conventions.md](../../docs/ui-ux-conventions.md) y en el [mockup público](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255); el contrato del API, en [02-backend.md](02-backend.md).

## 1. Stack

- **Next.js 16** (App Router) con React 19 y TypeScript (`strict`).
- Tailwind CSS v4 con tokens en `globals.css`, shadcn/ui y lucide-react.
- TanStack Query v5, Zod (esquemas de `packages/shared`) y Lightweight Charts.
- Inter con `next/font`.
- Tests con Vitest y Testing Library.
- `tsconfig.json` extiende el base y sobrescribe `lib` (con `DOM`), `jsx`, `module: "esnext"` y `moduleResolution: "bundler"`. `next-env.d.ts` va al `.gitignore`.
- **`@ruut/shared` se consume compilado** (`dist`, vía el `exports` de su `package.json`), sin `transpilePackages`: es el mismo artefacto que ejecuta el API en producción, y el build de Railway ya compila `shared` antes que `web`. Turbopack resuelve los imports con los `paths` de `tsconfig.json`, así que ese archivo **no** mapea `@ruut/shared` a `src` (si lo hiciera, el bundle usaría el código fuente). Para que un `dist` desactualizado no oculte errores, `pnpm typecheck` usa `tsconfig.typecheck.json`, que sí apunta a `packages/shared/src`, y Vitest usa un alias al mismo `src` (igual que el api).
- **ESLint:** la config raíz añade, solo para `apps/web`, `@next/eslint-plugin-next` (`core-web-vitals`) y `eslint-plugin-react-hooks` (`recommended-latest`). No se usa `eslint-config-next` porque arrastra `eslint-plugin-react`, `-import` y `-jsx-a11y`, cuyos rangos de peer terminan en ESLint 9 (el repo usa ESLint 10).

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
- Una cookie ilegible cuenta como vencida, y en la redirección por vencimiento se borra.
- El `matcher` excluye `/api/*`, los internos de Next y los archivos estáticos por extensión explícita (`svg`, `png`, `ico`...). Una regla genérica `\.\w+$` dejaría sin proteger `/stocks/BRK.B`.

## 3. Sesión y BFF

El navegador **nunca** ve el JWT. Solo habla con los Route Handlers de Next, que llaman a Express con `API_INTERNAL_URL`.

| Route Handler | Qué hace |
|---|---|
| `POST /api/auth/login` | Llama a `POST /auth/login`. Si sale bien, guarda el token en la cookie y devuelve `{ data: { user } }`, sin el token |
| `POST /api/auth/register` | Igual, con `POST /auth/register` |
| `POST /api/auth/demo` | Hace login con `DEMO_USER_EMAIL` y `DEMO_USER_PASSWORD`, leídas en el servidor. La contraseña demo nunca llega al bundle del cliente. Si no están configuradas, `500 INTERNAL_ERROR` (spec 02 §2), con el mensaje "The demo account is not available right now.", que el formulario muestra tal cual |
| `POST /api/auth/logout` | Borra la cookie y devuelve `204` |
| `GET /api/auth/expired` | Borra la cookie y redirige a `/login?expired=1` (ver abajo) |
| `GET, POST, DELETE /api/bff/[...path]` | Pasarela hacia el API: reenvía con `Authorization: Bearer <cookie>`, incluida la query string, y con `X-Forwarded-For` igual a la IP del navegador (la última entrada del `X-Forwarded-For` que puso el edge de Railway), para los límites por IP del API (spec 02 §4). Los handlers de auth también la reenvían. **Lista blanca** de prefijos (`market/`, `watchlist`), para no ser un proxy abierto; un prefijo no permitido devuelve `404`. Propaga status y body tal cual. Si el API responde `401`, borra la cookie. Sin cookie responde `401` sin llamar al API. Rechaza (`404`) los segmentos `.` y `..` y los que contienen `/` o `\` tras decodificar: `market/%2E%2E/auth/me` acabaría en `auth/me`. Bodies de más de 10 KB (el límite de `express.json()` del API) → `400`, comprobando el `Content-Length` declarado antes de leer y el tamaño real después |

- **Cookie** `SESSION_COOKIE_NAME` (`ruut_session`): `httpOnly`, `secure` en producción, `sameSite: "lax"`, `path: "/"` y `maxAge` derivado del `exp` del token recibido (no fijo), para que siga a `JWT_EXPIRES_IN`.
- **Server Components:** leen la cookie y llaman al API con `lib/api-server.ts`, que solo funciona en el servidor (`import "server-only"`). **Ante un 401 redirigen a `/api/auth/expired`**: un Server Component no puede borrar cookies, y sin este paso una cookie con `exp` vigente pero rechazada por el API (por ejemplo, si cambia `JWT_SECRET` en un redeploy) provocaría un bucle de redirecciones entre `/` y `/login`.
- **Client Components:** llaman a la pasarela con `lib/api-client.ts`, que valida cada respuesta con el esquema Zod correspondiente y lanza un `ApiError { code, message, status, retryAfter? }`.

**Protección CSRF (`lib/same-origin.ts`).** La cookie es `SameSite=Lax`, pero eso no protege el *login CSRF*: un `<form method="POST" enctype="text/plain">` en otro sitio puede enviar un body que es JSON válido a `/api/auth/login`, y `/api/auth/demo` ni siquiera necesita body. Por eso:
- Todos los `POST` de `/api/auth/*` (login, register, demo y logout) y, como defensa en profundidad, el `POST` y el `DELETE` de la pasarela rechazan las peticiones cross-site con **`403 VALIDATION_ERROR`** ("Cross-site requests are not allowed."), sin llamar al API:
  - Si existe `Sec-Fetch-Site` (lo pone el navegador y una página no puede falsificarlo), solo pasan `same-origin` y `none`.
  - Si no existe, y hay `Origin`, su host debe coincidir con `X-Forwarded-Host` o, en su defecto, `Host`. `Origin: null` cuenta como cross-site.
  - Sin ninguna de las dos cabeceras (curl, servidor a servidor) no hay cookie ambiental de navegador que explotar, así que pasa.
  - Código `VALIDATION_ERROR` porque el catálogo no tiene entrada para el 403, y `UNAUTHORIZED` queda reservado para sesiones rechazadas por el API (el cliente reacciona a él cerrando la sesión).
- Login, register y el `POST` de la pasarela exigen `Content-Type: application/json`; si no, **`400 VALIDATION_ERROR`** ("Request body must be JSON"), el status del catálogo para un body inválido. Un formulario HTML no puede enviar ese content type sin CORS.

Nota de naming: `proxy.ts` es la protección de rutas de Next; la pasarela hacia el API se llama `bff` para no confundirlas.

Riesgo aceptado: `GET /api/auth/expired` permite cerrar la sesión de otro usuario con un enlace (logout por CSRF). La gravedad es baja y se acepta en el MVP; se menciona en el README.

## 4. Pantallas

### Login y registro

- Campos con `label`, validación en cliente con el mismo esquema Zod del API, y errores vinculados con `aria-describedby`.
- Botón principal en estado de carga mientras se envía. El error del servidor aparece encima del formulario.
- Login: botón secundario **"Use demo account"** y enlace "Create an account". Si existe `?expired=1`, aviso "Your session expired. Please sign in again."
- Al entrar, redirige a `next` o a `/`. `next` solo se acepta si empieza por `/`, no empieza por `//`, no contiene `\` (los navegadores leen `/\evil.com` como `//evil.com`) y no contiene caracteres de control (los navegadores eliminan tabuladores y saltos de línea, así que `/\t/evil.com` acabaría como `//evil.com`).

### Dashboard (`/`)

- Cabecera con el título `Watchlist`, el texto "N symbols · Updated HH:MM ET" (la hora es el `dataUpdatedAt` de la query), el badge de retraso si algún quote trae `delayMinutes > 0`, y el botón `Add symbol`, que **abre** el buscador de la cabecera (contexto `SymbolSearchProvider`; en escritorio, el popover bajo el trigger).
- Escritorio: tabla (`watchlist-table`). Columnas: `Change` es la variación absoluta con signo y `Trend` la variación en % con flecha. Móvil: tarjetas (`watchlist-card-list`, §5 de las convenciones). Las dos se renderizan y se alternan con CSS (`md:`), sin `matchMedia`, para no depender de la hidratación.
- Toda la fila o tarjeta navega al detalle: en la tabla, el ticker es el enlace real (foco y lectores de pantalla) y el `onClick` de la fila cubre el puntero; en las tarjetas, el enlace del ticker se estira sobre la tarjeta (`after:absolute after:inset-0`). El botón de quitar no propaga el clic.
- Lista llena (8 símbolos): se muestra "Your watchlist is full (8 symbols). Remove one to add another." y el alta se rechaza en el cliente antes de llamar al API. Si el API responde igualmente `409` por lista llena (carrera), se muestra el mismo copy.
- Badge `Stale` por fila cuando su quote trae `stale: true`. Fila con `quote: null`: nombre y ticker visibles, y precio y variación como `—` con el texto accesible "Price unavailable".
- **Sparklines:** se cargan después de los quotes, una petición por símbolo y como máximo 2 a la vez, con su propia query key (`['sparkline', symbol]`). Mientras cargan, skeleton. Si reciben `RATE_LIMITED` o fallan, muestran una línea plana en `--muted-foreground` y se reintentan **en silencio** con su propio `retry` (hasta 3 veces, con `retryDelay` igual a `retryAfter`). **No activan el banner global** (ver §5).
- Estados: skeleton, vacío con las sugerencias AAPL, MSFT y NVDA, error con `Try again`, y banner de límite cuando la respuesta de la watchlist trae `meta.partial` o un `RATE_LIMITED`.

### Detalle (`/stocks/[symbol]`)

- El quote se carga en el servidor (Server Component) y se pasa como `initialData` a `['quote', symbol]`, que sigue refrescándose en el cliente con el mismo `refetchInterval` que la watchlist. La serie se carga en el cliente al elegir el rango.
- El rango elegido vive en la URL (`?range=6M`), para poder compartirlo y que sobreviva al refresco. Por defecto, `1M` (que no se escribe en la URL). El cambio de rango usa `history.replaceState`, que Next.js sincroniza con `useSearchParams` sin volver a renderizar la página en el servidor (no se vuelve a pedir el quote).
- Una URL con el símbolo en minúsculas (`/stocks/aapl`) redirige a la canónica (`/stocks/AAPL`), conservando `range`. Como `loading.tsx` ya empezó el streaming, la redirección llega como meta refresh más navegación del router, no como un `307`. Un segmento que no es un ticker válido → `notFound()` sin llamar al API.
- El botón de añadir o quitar lee la pertenencia de `['watchlist']` (comparte caché con el dashboard). Coste: si no está en caché, `GET /watchlist` pide los quotes de la lista (normalmente cacheados en el API). Si `['watchlist']` falló y no hay nada en caché, el botón se muestra deshabilitado como "Watchlist unavailable", para no ofrecer "Add to watchlist" sobre un símbolo que quizá ya está (acabaría en `409`).
- `PriceChart` con Lightweight Charts, importado con `next/dynamic` y `ssr: false`. Se redimensiona con `ResizeObserver` y destruye el chart al desmontarse. Lleva un resumen accesible en `aria-label` ("NVDA price, 1M: from $176.20 to $189.84, +7.74%").
- Badge `Stale` junto a la hora del dato cuando el quote o la serie traen `stale: true`.
- Respuestas del quote en el servidor (contrato en el spec 02 §4):
  - `404` → `notFound()` ("We couldn't find "XYZ"").
  - `429` → estado de límite alcanzado dentro de la página (banner con cuenta atrás y `Try again`), **nunca** `notFound()`. Al llegar a cero, `router.refresh()`.
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
- El input limita la consulta a 32 caracteres (`maxLength={SEARCH_QUERY_MAX_LENGTH}`, el mismo tope que valida el API), para no convertir un `400` en el error genérico "Check your connection".
- Debounce de 300 ms, con cancelación de la petición anterior (`AbortController`, a través de TanStack Query).
- Cada resultado tiene un botón para añadirlo a la watchlist (o un check si ya está) y abre el detalle con `Enter` o con un clic. El botón va **junto a** la opción, no dentro: un botón anidado en un `role="option"` no lo anuncian los lectores de pantalla. Se alcanza con `Tab`; tras pulsarlo, el foco vuelve al input.
- `↑` `↓` recorren los resultados en bucle; `Esc` cierra y devuelve el foco al trigger. Mientras llega la respuesta se mantienen los resultados anteriores (`keepPreviousData`) o un skeleton si no hay ninguno.

## 5. Obtención de datos (TanStack Query)

| Query key | Origen | `staleTime` | Notas |
|---|---|---|---|
| `['search', q]` | `/api/bff/market/search?q=` | 24 h | `enabled` cuando `q` tiene 1 carácter o más |
| `['watchlist']` | `/api/bff/watchlist` | 2 min | `refetchInterval` de 2 min si algún quote trae `isMarketOpen` y de 15 min si no (así una pestaña abierta detecta la apertura del mercado); solo con la pestaña visible |
| `['quote', symbol]` | `/api/bff/market/quote?symbols=` | 2 min | Hidratado desde el servidor en el detalle (`initialData`). `refetchInterval` de 2 o 15 min según `isMarketOpen`, como la watchlist |
| `['series', symbol, range]` | `/api/bff/market/series/:symbol?range=` | Igual al TTL del backend | Gráfico del detalle. `placeholderData` con el rango anterior para que no parpadee |
| `['sparkline', symbol]` | `/api/bff/market/series/:symbol?range=1M` | `Infinity` | Key propia de las sparklines, con `meta: { silentRateLimit: true }` y su propio `retry` (solo ante `RATE_LIMITED`, 5xx o red; mínimo 1 s de espera). Sin `retryOnMount`, `refetchOnWindowFocus` ni `refetchOnReconnect`. Ningún refetch por dato obsoleto (montaje, foco, reconexión o reactivación), porque los lanzaría todos a la vez y gastaría los 8 créditos/min. Se recargan a través de la ventana cuando la entrada se libera (`gcTime` tras salir del dashboard) o al recargar la página. El backend comparte la caché con la serie 1M |

- **Ventana de sparklines:** en el orden de la watchlist, una query arranca solo si hay menos de 2 en vuelo; una query que espera entre reintentos cuenta como en vuelo. El estado se lee de la caché de queries en cada render (`sparklineWindow`, función pura y testeada). Las queries ya resueltas mantienen su observer activo sin ocupar hueco, lo que solo es seguro porque no pueden refetchear por su cuenta (ver la fila de `['sparkline', symbol]`): la ventana es la única vía por la que arranca una petición, así que nunca hay más de 2 en vuelo. La ventana se activa con la primera carga de la watchlist (`data` definido, no `isSuccess`), para que un refetch fallido de la watchlist no la apague y la vuelva a encender.
- **Mutaciones** (añadir o quitar de la watchlist): actualización optimista, rollback si fallan e invalidación de `['watchlist']`. El alta optimista usa el quote de `['quote', symbol]` si está en caché. Un `DELETE` que responde `404` cuenta como éxito (ya no estaba). El error se muestra junto al control que lo provocó (dashboard, buscador o detalle), con el `message` del API.
- Solo el dashboard tiene `refetchInterval` sobre `['watchlist']`: el detalle y el buscador observan la misma entrada sin intervalo, para no duplicar el sondeo.
- **Reintentos por defecto:** ninguno ante errores 4xx (incluido el 429); uno ante 5xx o error de red. Las sparklines son la única excepción (ver §4).
- **429 global:** un `RateLimitProvider` escucha la caché de queries. Ante un `RATE_LIMITED` o un `meta.partial`, guarda `retryAfter` y muestra el banner con cuenta atrás. Al llegar a cero, refresca las queries activas. Ignora las queries con `meta.silentRateLimit` (sparklines). Un `RATE_LIMITED` sin `retryAfter` cuenta 60 s; la cuenta atrás mínima es 1 s (un `retryAfter: 0` repetido no provoca un bucle). Si llega otro aviso, el plazo solo se alarga. Una vista sin datos por un `RATE_LIMITED` muestra su skeleton bajo el banner, no un error. Los errores de mutaciones no activan el banner.
- **401 en cliente:** limpia la caché de queries y navega a `/api/auth/expired`, que borra la cookie y lleva a `/login?expired=1`.

## 6. Componentes

Archivos en kebab-case dentro de `src/components/`: `app-header`, `user-menu`, `symbol-search`, `watchlist-table`, `watchlist-card-list`, `sparkline`, `price-chart`, `range-selector`, `key-metrics`, `change-indicator`, `delayed-badge`, `stale-badge`, `rate-limit-banner`, `empty-state`, `error-state` y los skeletons de cada vista (`watchlist-skeleton`, `stock-detail-skeleton`). Además: `app-providers` (QueryClient, `RateLimitProvider` y `SymbolSearchProvider`), `rate-limit-provider`, `symbol-search-context`, `watchlist-view` (contenedor del dashboard), `quote-values` (precio y variación con `—` y "Price unavailable"), `stock-detail` (cuerpo cliente del detalle), `watchlist-toggle-button`, `quote-unavailable` (429 y 502 del detalle) y `symbol-not-found`. Primitivas de shadcn en `components/ui/` (button, input, label, dropdown-menu, command, popover, dialog y skeleton).

Hooks en `src/hooks/`: `use-debounce`, `use-media-query`, `use-now-seconds` (cuenta atrás), `use-watchlist-actions` y `use-sparklines`.

- `sparkline` es un SVG (`polyline`) sin dependencias; Lightweight Charts solo se usa en `price-chart`.
- `price-chart` lee los colores de los tokens CSS (`getComputedStyle`), aplica el degradado de `--primary` al 20 %, vuelve a colorearse si cambia `prefers-color-scheme`, desactiva zoom y desplazamiento, y muestra un tooltip propio (fecha y precio) que sigue al crosshair. Mantiene el logo de atribución de TradingView, que la licencia de Lightweight Charts pide.

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
| `formatTooltipDate(date, range)` | `Nov 12, 14:30 ET` (1D, 1W), `Nov 12, 2026` (1M a 1Y) |
| `formatMarketTime(date)` | `14:32 ET` |
| `formatAsOf(date)` | `As of 14:32 ET` |

- Los rangos diarios (`1M`, `6M`, `1Y`) traen la fecha de la sesión a las `00:00Z`: se formatean en **UTC**, porque en hora de Nueva York caerían en el día anterior. Los intradía (`1D`, `1W`) se formatean en `America/New_York`.
- El signo y el color salen del valor redondeado a 2 decimales (`changeDirection`): `−0.004` se muestra `0.00`, sin signo y en `--muted-foreground`.
- Reloj de 24 h (`hourCycle: 'h23'`), para que la medianoche sea `00:05` y nunca `24:05`.

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
   - CSRF: una petición cross-site devuelve `403` sin llamar al API (auth y pasarela); un body que no es `application/json` y uno de más de 10 KB devuelven `400`.
4. `proxy.ts`: redirecciones sin cookie, con cookie vencida (`expired=1`) y con cookie vigente en `/login`.
5. `api-client`: mapeo de errores a `ApiError`, `retryAfter` leído y respuesta que no valida.
6. Validación de `next`: rechaza URLs externas, las que empiezan por `//` y las que contienen `\`.
7. `SymbolSearch`: navegación con teclado (`↑` `↓` `Enter` `Esc`), una sola petición tras el debounce, check en los símbolos que ya están y copy sin resultados.
8. Lógica de datos: `refetchInterval` según el mercado, política de reintentos por defecto y de las sparklines, ventana de 2 sparklines, `RateLimitProvider` (banner, refetch al llegar a cero e ignorar las queries silenciosas) y 401 global.
9. `useWatchlistActions`: alta optimista con rollback, baja optimista con `404` como éxito y lista llena sin llamar al API.
