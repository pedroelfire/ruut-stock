# Sesión 08: Fase 3, frontend, auth y layout

- **Fecha:** 2026-11-22
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `frontend-dev` (implementación y correcciones), `ui-ux-guardian` (2 rondas) y `code-reviewer` (2 rondas)

## Prompts del usuario

> Si escapalo tu

Respuestas del autor a las preguntas de la IA:
- Nombre de la app: **"Stocks"**, como en el mockup, en lugar de "Ruut Stocks".
- Cambios a las convenciones de UI/UX: **aprobar las 9 propuestas** de `ui-ux-guardian`.

(La fase arrancó tras cerrar la Fase 2, según la instrucción de la sesión 06 de avanzar fase a fase.)

## Qué produjo la IA

- **`apps/web`:** Next.js 16.4, React 19.3, Tailwind 4.3, shadcn/ui, lucide e Inter.
  - `@ruut/shared` se consume desde `dist`. El typecheck y los tests usan su código fuente.
  - Reglas de Next y react-hooks en el ESLint de la raíz, sin `eslint-config-next` (sus peers terminan en ESLint 9).
- **Sesión y BFF:**
  - Cookie httpOnly con `maxAge` derivado del `exp`.
  - Route Handlers de login, register, demo, logout y expired.
  - Pasarela `/api/bff/[...path]`: lista blanca, rechazo de dot-segments, Bearer desde la cookie y `X-Forwarded-For` sobrescrito.
  - Protección CSRF (`Sec-Fetch-Site` y `Origin`) y exigencia de JSON.
  - `proxy.ts` con redirecciones para sin sesión, sesión vencida y sesión vigente.
- **Pantallas:** login (con "Use demo account"), register, layout protegido con cabecera y menú de usuario, `/` provisional, favicon y página de error global.
- **Tokens de diseño** en `globals.css`, con la paleta por defecto de Tailwind desactivada.
- **70 tests** en web; el api sigue con 174.
- **Prueba de punta a punta** (sesión principal, con `next start` y el API):
  - `/` sin sesión redirige a login.
  - El login demo da 200 con cookie.
  - `/` con sesión muestra "Watchlist · Stocks".
  - Un demo cross-site da 403.
  - Logout da 204.

## Revisión

- **`ui-ux-guardian`, ronda 1:**
  - Corrigió: foco `ring-2`, controles de 40 px por defecto, sombras, contraste del botón destructivo en oscuro y logo según el mockup.
  - Propuso 9 cambios a las convenciones:
    - Contraste del aviso: `--warning-subtle` claro pasa a #FBF4EF.
    - Token `--input` para el borde de los campos (3:1).
    - Overlay de diálogos.
    - Marca.
    - `--negative` también para errores.
    - Edición de shadcn.
    - Excepción de 40 px para enlaces en línea.
    - Iconos de estado.
    - Hover sobre `bg-accent`.
- **`ui-ux-guardian`, ronda 2:** aplicó en el código los cambios aprobados. No quiso editar `docs/ui-ux-conventions.md` porque la aprobación le llegaba reenviada por otro agente, así que lo aplicó la sesión principal tras revisar el diff.
- **`code-reviewer`, ronda 1: CAMBIOS REQUERIDOS.** Login CSRF: un formulario `text/plain` de otro sitio podía iniciar sesión en la cuenta del atacante, y el revisor lo reprodujo contra `next start`. Además, 7 no bloqueantes: body grande leído entero, esquemas duplicados, mensaje del demo sin configurar, favicon, error global, y otros.
- **`code-reviewer`, ronda 2: APROBADO.** Comprobó que no se puede saltar con `x-forwarded-host` falsificado ni con `same-site`, y que no se rompe ningún flujo legítimo.

## Correcciones y decisiones humanas

- **`$` en la contraseña demo:** Next.js expande `$VAR` en los `.env` (dotenv-expand), así que recibía la contraseña recortada y el botón demo fallaba en local. Con permiso del autor, la sesión principal escapó el `$` solo en `apps/web/.env.local` y comprobó, sin imprimir el valor, que Next y el API leen lo mismo.
- El autor eligió el nombre "Stocks" y aprobó los 9 cambios de convenciones. El mockup público se actualizó con el nuevo fondo del aviso y el token `--input`.
