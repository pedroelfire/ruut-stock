# Sesión 04: Cierre de la Fase 0 (specs y andamiaje)

- **Fecha:** 2026-11-21
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `code-reviewer` (3 rondas)

## Prompt del usuario

> Agrega lo faltante de la fase 0

## Qué produjo la IA

- **Verificación de límites** con búsqueda web, el 2026-11-21:
  - Twelve Data Basic: 8 créditos/min y 800/día, y el exceso devuelve 429. La documentación lo describe como uso interno, sin redistribución.
  - Railway: 30 días de prueba con 5 USD; después, el plan Free con 1 USD al mes y servicios que se duermen sin tráfico.
  - Las implicaciones quedaron en PLAN.md: desplegar tarde dentro de los 7 días, y Hobby o plan B si hace falta.
- **Specs** en `prompts/specs/`:
  - [01-product.md](../specs/01-product.md): usuario, historias con criterios de aceptación, fuera de alcance y criterios de éxito de la demo.
  - [02-backend.md](../specs/02-backend.md): contrato del API, modelo, rangos y TTL, caché, presupuesto de créditos, seguridad, variables de entorno y tests.
  - [03-frontend.md](../specs/03-frontend.md): rutas, sesión y BFF, pantallas, queries, componentes, formato y tests.
- **Andamiaje del monorepo:**
  - `package.json` raíz con scripts y `pnpm-workspace.yaml`.
  - `tsconfig.base.json` (TS 6.0, `strict`) y ESLint 10 en flat config con typescript-eslint y Prettier.
  - `.editorconfig`, `.nvmrc` y `compose.yaml` con Postgres local.
  - Un `.env.example` por app.
  - `pnpm install`, `lint` y `format:check` en verde.
- **Decisiones de versión:**
  - TypeScript fijado en `~6.0.3`, porque typescript-eslint 8.73 no admite TS 7 (su peer es `<6.1.0`).
  - Next.js 16 en lugar de 15 (es la versión estable actual). La protección de rutas pasa de `middleware.ts` a `proxy.ts`.

## Revisión con `code-reviewer`

- **Ronda 1: CAMBIOS REQUERIDOS, con 5 bloqueantes en los specs.**
  1. Una watchlist de 10 símbolos nunca cabía en 8 créditos por minuto.
  2. El rate limit por IP detrás del BFF se convertía en un límite global.
  3. El contrato devolvía un `name` que el modelo no guardaba.
  4. Los badges `Stale` y `Delayed` por fila no tenían respaldo en el contrato.
  5. Los specs se contradecían sobre el 429 de las sparklines.
  
  Además, 25 observaciones menores: estructura de PLAN desactualizada, bucle de redirección posible, zona horaria de las series, límite de bcrypt en bytes, `lru-cache` borrando datos obsoletos, `engines` de Node, entre otras.
- **Ronda 2: CAMBIOS REQUERIDOS, con 1 bloqueante nuevo.** No estaba definido qué devuelve el quote sin créditos frente a un símbolo inexistente. También señaló el riesgo de bloquear la cuenta demo con el limitador por email.
- **Ronda 3: APROBADO.**

Correcciones principales:
- Máximo de 8 símbolos y reserva parcial de créditos.
- `stale` y `asOf` por dato.
- Límites por email + IP real, que el BFF reenvía en `X-Forwarded-For`.
- `name` persistido en la watchlist.
- Tabla de casos del quote (`404` frente a `429`).
- Sparklines con key propia y sin banner.
- Ruta `/api/auth/expired` contra el bucle de redirección.

## Correcciones y decisiones humanas

- Ninguna en esta sesión: el autor pidió completar la Fase 0 y dar aviso antes de la Fase 1.
- Pendiente del autor: crear la API key de Twelve Data y guardarla en `apps/api/.env`.
