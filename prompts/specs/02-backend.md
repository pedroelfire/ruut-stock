# Spec 02: Backend (`apps/api`)

> Contrato del API, modelo de datos, integración con Twelve Data y reglas de caché. Cubre las fases 1 y 2 de PLAN.md. Las reglas generales (idioma, errores, tests) están en `CLAUDE.md`.

## 1. Stack y estructura

- Node `^22.13.0` o `>=24`, Express 5, TypeScript (`strict`), Prisma 7 con PostgreSQL, Zod 4, pino (con pino-http para el log de peticiones), bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit y lru-cache.
- **bcryptjs en lugar de `bcrypt` nativo:** es JS puro, así que no necesita compilación nativa ni en Windows ni en Railway. Genera hashes bcrypt estándar (`$2b$`), con el mismo coste y el mismo límite de 72 bytes.
- **Prisma 7:** la URL de conexión vive en `apps/api/prisma.config.ts` (no en `schema.prisma`) y el cliente se conecta con el driver adapter de pg (`@prisma/adapter-pg`). El cliente se genera con el generador `prisma-client` en `src/generated/prisma` (ignorado por git); `pnpm install` (script `prepare`), `build` y `typecheck` ejecutan `prisma generate`.
- `packages/shared` se compila a `dist` (JS y `.d.ts`); `apps/api` consume esa salida, también en producción. El script `prepare` de `shared` lo compila en cada `pnpm install`.
- Tests con Vitest y Supertest.
- Estructura de carpetas: la de PLAN.md §4 (`config/`, `middleware/`, `modules/<feature>/`, `providers/twelve-data/`, `lib/`).
- Los esquemas Zod de request y response viven en `packages/shared` y se exportan con su tipo inferido, para que el frontend use los mismos.
- `apps/api/package.json` con `"type": "module"`. `tsconfig.json` extiende el base con `module` y `moduleResolution` en `NodeNext` y `types: ["node"]` (en TS 6, `types` vale `[]` por defecto).

## 2. Convenciones del API

- JSON en todas las respuestas. Rutas sin prefijo de versión (`/auth/login`, `/market/quote`).
- **Respuesta correcta:** `{ "data": <payload>, "meta"?: { "partial": true, "retryAfter": number } }`. `meta` solo aparece cuando el presupuesto de créditos no alcanzó para todo y parte de los datos vienen obsoletos o faltan (§5).
- **Frescura por dato:** cada quote y cada serie lleva su propio `stale: boolean` y su `asOf` (ISO 8601). Así, en un lote, unos quotes pueden venir frescos y otros de caché.
- **Respuesta de error:** `{ "error": { "code": string, "message": string, "retryAfter"?: number } }`. `message` es apto para mostrarse en la UI, en inglés y sin detalles internos.

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body, query o params no pasan el esquema Zod |
| `UNAUTHORIZED` | 401 | Token ausente, mal formado, expirado o con firma inválida; credenciales incorrectas |
| `NOT_FOUND` | 404 | Símbolo inexistente o ruta desconocida |
| `CONFLICT` | 409 | Email ya registrado, símbolo ya en la watchlist o watchlist llena |
| `RATE_LIMITED` | 429 | Límite propio (express-rate-limit) o del proveedor sin caché disponible; incluye `retryAfter` en segundos y el header `Retry-After` |
| `UPSTREAM_ERROR` | 502 | Twelve Data falla, devuelve algo inválido o no responde a tiempo |
| `INTERNAL_ERROR` | 500 | Cualquier otro error, siempre logueado |

## 3. Modelo de datos

```prisma
model User {
  id           String          @id @default(cuid())
  email        String          @unique
  passwordHash String
  createdAt    DateTime        @default(now())
  watchlist    WatchlistItem[]
}

model WatchlistItem {
  id       String   @id @default(cuid())
  userId   String
  symbol   String   // always uppercase
  name     String   // stored on insert, so it is available even without a quote
  exchange String?
  addedAt  DateTime @default(now())
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, symbol])
}
```

**Seed:** crea el usuario demo (`DEMO_USER_EMAIL`, por defecto `demo@example.com`; contraseña en `DEMO_USER_PASSWORD`) con `AAPL` (Apple Inc.), `MSFT` (Microsoft Corporation), `NVDA` (NVIDIA Corporation), `TSLA` (Tesla, Inc.) y `AMZN` (Amazon.com, Inc.). Los nombres van fijos en el seed para no gastar créditos al sembrar. El seed es idempotente (upsert del usuario, que además actualiza el hash si cambia la contraseña, e inserción de símbolos sin duplicados) y falla con un mensaje claro si falta `DEMO_USER_PASSWORD`.

## 4. Endpoints

### Salud

`GET /health` → `200 { "data": { "status": "ok" } }`. Sin auth y sin tocar la base de datos ni el proveedor (es el healthcheck de Railway).

### Auth

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /auth/register` | `{ email, password }` | `201 { data: { token, user: { id, email } } }` · `409 CONFLICT` si el email existe |
| `POST /auth/login` | `{ email, password }` | `200 { data: { token, user } }` · `401` con el mensaje "Invalid email or password" |
| `GET /auth/me` | (Bearer) | `200 { data: { user } }` |

- Email: formato válido, normalizado a minúsculas y sin espacios.
- Contraseña: 8 caracteres como mínimo y **72 bytes UTF-8 como máximo**, el límite real de bcrypt, comprobado con `TextEncoder` en el esquema compartido. Si no, bcrypt truncaría en silencio. Login y registro usan las mismas reglas, así que un login con una contraseña de menos de 8 caracteres responde `400 VALIDATION_ERROR` en lugar de `401` (no revela si el email existe).
- bcrypt con coste 10. En el login se compara también cuando el usuario no existe (con un hash ficticio), para no filtrar por tiempo qué emails existen.
- JWT HS256 con payload `{ sub: userId, email }` y expiración `JWT_EXPIRES_IN` (1 h por defecto). La verificación fija `algorithms: ['HS256']`. Sin refresh token en el MVP.

**IP real del cliente.** Detrás del BFF, todas las peticiones llegan desde el servidor de Next. Para no convertir los límites por IP en límites globales:
- El BFF reenvía la IP del navegador en `X-Forwarded-For` (spec 03 §3).
- Express usa `trust proxy` igual a 1, así que `req.ip` es la entrada que añadió el último salto:
  - Petición directa al dominio público: la añade el edge de Railway, con la IP real.
  - Petición desde web por la red privada: la añade el BFF.
- Un cliente que falsifique `X-Forwarded-For` no consigue nada: el edge de Railway añade la IP real al final y Express solo confía en esa última entrada.

**Rate limit de auth:**
- `POST /auth/login`: 10 intentos **fallidos** cada 15 minutos por **email normalizado + `req.ip`** (`skipSuccessfulRequests: true`). Quien falla la contraseña de la cuenta demo solo se bloquea a sí mismo; el botón demo sigue funcionando para los demás. El `keyGenerator` se monta después del parser JSON y usa `"invalid"` como email cuando falta o no valida.
- Red de seguridad global en `POST /auth/login`: 300 peticiones cada 15 minutos (cada intento cuesta un bcrypt).
- `POST /auth/register`: 10 registros por hora por `req.ip`.

### Mercado (todas con Bearer)

**`GET /market/search?q=app`**
- `q`: de 1 a 32 caracteres, recortado.
- Proveedor: `/symbol_search?symbol=<q>&outputsize=30`. Se filtra `country = "United States"` y `instrument_type` en `Common Stock` o `ETF`, y se devuelven como máximo 8 resultados.
- `data: [{ symbol, name, exchange, type }]`.
- Coste en créditos: se trata como 1 crédito por llamada hasta verificarlo en la documentación de Twelve Data durante la Fase 2. Si resulta gratuito, se excluye del presupuesto.

**`GET /market/quote?symbols=AAPL,MSFT`**
- De 1 a 8 símbolos, en mayúsculas y sin duplicados.
- Proveedor: `/quote?symbol=AAPL,MSFT` (un crédito por símbolo).
- `data: [{ symbol, name, exchange, currency, price, change, changePercent, open, high, low, previousClose, volume, fiftyTwoWeek: { low, high }, isMarketOpen, asOf, stale, delayMinutes }]`. Números como `number`. `asOf` se construye a partir del `timestamp` (Unix) del proveedor. `delayMinutes` sale de la configuración (`TWELVE_DATA_DELAY_MINUTES`, por defecto 0, porque la página de precios del 2026-11-21 lista datos de EE. UU. en tiempo real en el plan Basic). En la Fase 2 se comprueba comparando el `timestamp` del quote con la hora real; si hay retraso, se ajusta la variable.
- Resultado según el caso:

| Caso | Respuesta |
|---|---|
| Todos los símbolos con dato (fresco o de caché) | `200`; cada quote con su `stale` |
| Algunos sin dato por falta de créditos | `200` con los que tienen dato y `meta: { partial: true, retryAfter }` |
| Ningún símbolo con dato por falta de créditos | `429 RATE_LIMITED` con `retryAfter` |
| Todos los símbolos inexistentes según el proveedor | `404 NOT_FOUND` |
| Mezcla de existentes e inexistentes | `200` con los existentes; los inexistentes se omiten |
| Ninguno con dato: unos inexistentes y otros sin créditos | `429 RATE_LIMITED` (gana el 429, para no esconder un problema de presupuesto detrás de un "no existe") |

Así, con un solo símbolo (detalle o validación de `POST /watchlist`), `404` significa "no existe" y `429` significa "sin créditos ahora mismo". Nunca se confunden.

**`GET /market/series/:symbol?range=1M`**
- `range`: `1D | 1W | 1M | 6M | 1Y` (por defecto `1M`).
- Proveedor: `/time_series` con `timezone=UTC`, para que `t` sea ISO sin desfase (por defecto el proveedor devuelve la hora local de la bolsa, sin offset).
- `data: { symbol, range, points: [{ t, close }], periodChange, periodChangePercent, asOf, stale }`, con los puntos en orden ascendente de tiempo.

| Rango | `interval` | `outputsize` | TTL de caché |
|---|---|---|---|
| `1D` | `5min` | 78 | 5 min |
| `1W` | `30min` | 65 | 15 min |
| `1M` | `1day` | 22 | 1 h |
| `6M` | `1day` | 126 | 1 h |
| `1Y` | `1day` | 252 | 1 h |

La traducción de rango a parámetros es una función pura y testeada.

### Watchlist (todas con Bearer; siempre filtrada por el `userId` del token)

**`GET /watchlist`** → `200 { data: [{ symbol, name, addedAt, quote | null }], meta? }`
- `name` sale de la base de datos y existe siempre.
- Los quotes se piden en un lote cacheado. Si un símbolo no tiene quote disponible (ni fresco ni obsoleto), lleva `quote: null` y el item aparece igualmente.

**`POST /watchlist`** con body `{ symbol }` → `201 { data: { symbol, name, addedAt } }`. Orden de validación, del más barato al más caro:
1. El esquema es válido y el símbolo se normaliza a mayúsculas.
2. Si ya está en la lista → `409 CONFLICT`. Si la lista tiene 8 símbolos → `409 CONFLICT`. Esto se comprueba **antes** de gastar créditos.
3. Se pide el quote (cacheado) para validar que el símbolo exista y obtener `name` y `exchange`. Si no existe → `404 NOT_FOUND`.
4. El recuento y la inserción van en una transacción (`prisma.$transaction`), para que dos POST simultáneos no superen los 8.

**`DELETE /watchlist/:symbol`** → `204`; `404` si no estaba.

Las sparklines de la watchlist usan `GET /market/series/:symbol?range=1M`, que el frontend pide aparte (ver §5).

## 5. Twelve Data: integración y presupuesto de créditos

### Adaptador (`providers/twelve-data/`)

- Cliente HTTP con `fetch`, timeout de 8 s y la API key en el parámetro `apikey`, que nunca se loguea.
- Toda respuesta se valida con Zod y se mapea a los tipos propios (los números del proveedor llegan como string).
- Detección de errores: Twelve Data puede responder `200` con `{ "status": "error", "code": 429 | 400 | 404 ... }` en el body. El adaptador trata igual el status HTTP y el `code` del body:
  - `429` → `ProviderRateLimitError`.
  - `400` o `404` por símbolo inválido → `ProviderNotFoundError`.
  - Resto, timeout o respuesta que no valida → `ProviderError`.
- En `/quote` con varios símbolos, el proveedor devuelve un objeto indexado por símbolo y cada entrada puede traer su propio error: se tratan por separado.

### Caché (`lib/cache.ts`)

- LRU en memoria (`lru-cache`) con 500 entradas como máximo y **sin la opción `ttl` de la librería**: cada entrada guarda su propio `expiresAt`. Si se usara la opción `ttl`, la librería borraría la entrada caducada al leerla y no se podría servir como obsoleta.
- Claves: `search:<q en minúsculas>`, `quote:<SYMBOL>` (una entrada por símbolo, aunque se pidan en lote), `series:<SYMBOL>:<range>`.
- TTL:
  - Búsqueda: 24 h.
  - Quote: **2 min con el mercado abierto y 15 min con el mercado cerrado** (según `isMarketOpen` del propio quote). Un quote cacheado justo antes de la apertura tarda como máximo 15 minutos en refrescarse; es aceptable.
  - Series: según la tabla de §4.
- **Dedupe en vuelo:** dos peticiones simultáneas a la misma clave comparten la misma promesa.
- **Stale-while-error:** una entrada caducada se conserva hasta que el LRU la desaloje, para servirla con `stale: true` cuando el proveedor falla o se acaba el presupuesto.
- En un lote de quotes, solo se piden al proveedor los símbolos que no están frescos en caché.

### Presupuesto de créditos (`lib/credit-budget.ts`)

El margen es estrecho: una watchlist de 5 símbolos en frío cuesta 5 créditos en quotes más 5 en sparklines, es decir, 10 créditos, por encima de los 8 por minuto. Por eso el backend controla el gasto antes de llamar al proveedor:

- Contador por ventana de minuto fija (`TWELVE_DATA_CREDITS_PER_MINUTE`, 8 por defecto) y por día UTC (`TWELVE_DATA_CREDITS_PER_DAY`, 800 por defecto).
- **Reserva parcial en lotes:** antes de llamar se reservan los créditos disponibles, como máximo uno por símbolo pendiente. Se piden al proveedor solo los símbolos que caben. El resto se sirve obsoleto desde la caché o falta, y la respuesta lleva `meta: { partial: true, retryAfter }`, con `retryAfter` igual a los segundos que faltan para la siguiente ventana.
- Llamadas de un solo símbolo (serie, búsqueda): sin crédito disponible, se sirve el dato obsoleto si existe; si no, `RATE_LIMITED` con `retryAfter`.
- Un 429 real del proveedor marca la ventana actual como agotada hasta el siguiente minuto. Esto cubre el caso de que la ventana del proveedor no coincida exactamente con la nuestra.
- Prioridad de facto: el frontend pide los quotes primero y las sparklines después, como máximo 2 a la vez. Una sparkline sin crédito no es un error visible (ver 03-frontend §4).
- Con 8 símbolos como máximo y quotes a 2 min de TTL, el sondeo de una watchlist llena gasta **4 créditos por minuto de media**, pero en ráfagas de 8 cada 2 minutos. El minuto de la ráfaga queda sin margen; la reserva parcial y el banner lo cubren sin romper nada.

## 6. Seguridad

- helmet; CORS con lista blanca (`CORS_ORIGIN`, admite varios orígenes separados por comas). Cada valor se normaliza a su origen (`new URL(o).origin`, de modo que `http://localhost:3000/` queda en `http://localhost:3000`) y el arranque falla si alguno no es un origen `http`/`https` puro (con ruta, query, fragmento o credenciales).
- El servidor escucha en `::` (dual-stack, IPv6 e IPv4), porque la red privada de Railway puede ser solo IPv6. Si `listen` falla (por ejemplo, puerto ocupado), se loguea como `fatal` y el proceso sale con código 1.
- Rate limit general de 120 peticiones por minuto **por `userId`**, montado después del middleware de auth (necesita `req.user`). Todas las rutas fuera de auth exigen token.
- Body JSON limitado a 10 kb. Un body mayor o un JSON mal formado responden `400 VALIDATION_ERROR` (el código de la tabla de §2, no un `413`).
- `app.set('trust proxy', 1)`, con el razonamiento de "IP real del cliente" en §4 Auth.
- Logs con pino: método, ruta, status y duración. Nunca se loguean el header `Authorization`, los bodies de auth ni la API key.

## 7. Variables de entorno (`config/env.ts`, validadas con Zod)

| Variable | Obligatoria | Por defecto |
|---|---|---|
| `NODE_ENV` | No | `development` |
| `PORT` | No | `4000` (Railway la inyecta) |
| `LOG_LEVEL` | No | `info` |
| `DATABASE_URL` | Sí | |
| `JWT_SECRET` | Sí (32 caracteres o más) | |
| `JWT_EXPIRES_IN` | No | `1h` (segundos o número con sufijo `s`, `m`, `h` o `d`) |
| `CORS_ORIGIN` | Sí | |
| `TWELVE_DATA_API_KEY` | Sí | |
| `TWELVE_DATA_BASE_URL` | No | `https://api.twelvedata.com` |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | No | `8` |
| `TWELVE_DATA_CREDITS_PER_DAY` | No | `800` |
| `TWELVE_DATA_DELAY_MINUTES` | No | `0` |
| `DEMO_USER_EMAIL` | No (solo para el seed) | `demo@example.com` |
| `DEMO_USER_PASSWORD` | No para el servidor; el seed falla con un mensaje claro si falta | |

Plantilla en `apps/api/.env.example`.

## 8. Tests requeridos

Siguiendo la política de `CLAUDE.md`, solo lo propenso a fallar:

1. Middleware JWT: token válido, ausente, mal formado, expirado, con firma incorrecta y con algoritmo distinto de HS256.
2. Auth: registro con email duplicado, login correcto e incorrecto, normalización del email, contraseña de más de 72 bytes con caracteres multibyte, limitador de login por email + IP (otra IP no queda bloqueada).
3. Quote: tabla de casos de §4 (todos con dato, parcial, sin créditos → 429, inexistente → 404, mezcla).
4. Rango a parámetros del proveedor: los cinco rangos y un valor inválido.
5. Adaptador de Twelve Data: mapeo correcto, 429 por status y por body, símbolo inexistente, respuesta que no valida, lote con un símbolo erróneo.
6. Caché: expiración por TTL (incluido el TTL según mercado abierto o cerrado), dedupe concurrente, servir dato obsoleto ante error.
7. Presupuesto de créditos: reserva completa, reserva parcial con `retryAfter`, agotamiento por un 429 real y reinicio de la ventana.
8. Watchlist: aislamiento entre usuarios, duplicado y lista llena sin gastar créditos, símbolo inexistente devuelve 404, borrado de un símbolo que no está.
