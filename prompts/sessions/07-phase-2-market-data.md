# Sesión 07: Fase 2, Twelve Data, caché, presupuesto de créditos y watchlist

- **Fecha:** 2026-11-21 y 2026-11-22
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `backend-dev` (implementación y 3 rondas de correcciones) y `code-reviewer` (4 rondas)

## Prompts del usuario

> Ya cambié la API key y explicame proque quiers que cambie las contrasenas en esos archivos

> Ya puse una nueva contrasena igual en ambos archivos

(La fase arrancó tras el "pasa a la fase 2" de la sesión 06.)

## Qué produjo la IA

- **`packages/shared`:** esquemas de market (search, quote con `stale`, `asOf` y `delayMinutes`; series; `meta` parcial) y de watchlist.
- **`apps/api`:**
  - Adaptador de Twelve Data: validación tolerante (`.nullish()` y descarte de filas inválidas), errores por status y por `code` del body, y errores por símbolo dentro de un lote.
  - Caché LRU con expiración propia, dedupe en vuelo tipado y datos obsoletos ante errores. Caché negativa de 15 min para "no existe".
  - Presupuesto de créditos: 8 por minuto y 800 por día UTC, con reserva parcial. Solo se reembolsa cuando el proveedor no sirvió datos.
  - Freno global de 30 s ante una caída del proveedor o una key inválida.
  - Endpoints de market (búsqueda solo en bolsas principales de EE. UU., ordenada exacto > prefijo > resto) y watchlist (límite de 8 atómico con `SELECT ... FOR UPDATE`).
  - Limitador de 120 peticiones por minuto por usuario.
- **174 tests** (133 tras la primera entrega).
- **Pruebas con la API real**, hechas por la sesión principal con 11 créditos en total:
  - Watchlist demo con 5 quotes correctos.
  - Quote repetido servido desde caché.
  - Serie NVDA 1M con 22 puntos.
  - Búsquedas "app" y "spy" correctas y sin OTC.
  - Logs sin advertencias y sin la API key.
  - `asOf` a las 15:59 ET: datos en tiempo real, así que `TWELVE_DATA_DELAY_MINUTES` se queda en 0.

## Revisión con `code-reviewer`

- **Ronda 1: APROBADO**, con 15 no bloqueantes. Los más importantes:
  - Esquemas que rechazaban `null`.
  - Errores de Zod sin el campo que falla.
  - Una fila mala de la búsqueda tumbaba la respuesta entera.
  - Créditos no devueltos ante una caída.
  - Un 4xx sin cuerpo se interpretaba como "no existe".
  - Dedupe con una clave mal tipada.
  - Sin caché negativa.
  - Test de dedupe no determinista.
  - Código muerto.
- **Ronda 2: CAMBIOS REQUERIDOS.** El reembolso recién añadido devolvía créditos de respuestas 2xx que el proveedor sí había cobrado. Si el esquema no coincidía, se podía superar el tope de 8 por minuto.
- **Ronda 3: APROBADO.** Reembolso corregido y freno de 30 s verificado: no deja un 502 permanente, no oculta datos frescos y no deja reservas sin liquidar.
- Queda anotado como aceptable: un timeout no activa el freno; el presupuesto acota el daño a 8 por minuto.

## Correcciones y decisiones humanas

- **API key inválida:** la key que había en `.env` daba 401 en Twelve Data. El autor la reemplazó por una válida.
- **Contraseña demo:** a petición de la IA, el autor puso una contraseña demo distinta de la key, igual en `apps/api/.env` y `apps/web/.env.local`. La IA explicó por qué: será pública y no debe coincidir con ninguna credencial real. Se volvió a ejecutar el seed.
- **Calidad de la búsqueda:** con datos reales, la IA observó resultados OTC poco útiles y pidió excluirlos y ordenar los resultados.
