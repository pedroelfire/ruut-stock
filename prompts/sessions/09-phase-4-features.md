# Sesión 09: Fase 4, features del producto

- **Fecha:** 2026-11-22
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `frontend-dev` (implementación y 2 rondas de correcciones), `ui-ux-guardian` (1 ronda) y `code-reviewer` (2 rondas)

## Prompts del usuario

> Terminando la fase 4, vas a dejar corriendo los servicios, y me vas a dar los links y accesos para testear

Respuestas del autor a las preguntas de la IA (propuestas de `ui-ux-guardian`):
- Convenciones: **aprobadas las 4**:
  - qué va en las columnas Change, Trend y 1M;
  - el copy del aviso de límite cuando no hay datos guardados;
  - el copy de error del detalle y del gráfico;
  - la excepción de `tabular-nums` en los ejes del gráfico.
- Comillas: **rectas** en todo el copy.
- Foco de los controles rellenos con `--primary`: **sí** a `ring-offset-2`.

(La fase arrancó tras cerrar la Fase 3, según la instrucción de la sesión 06 de avanzar fase a fase.)

## Qué produjo la IA

- **Datos:**
  - TanStack Query v5 con query keys centralizadas.
  - Sin reintentos en 4xx.
  - 401 global que limpia la caché y redirige a `/api/auth/expired`.
- **Límite de API:**
  - `RateLimitProvider` con banner y cuenta atrás.
  - Variante "No saved prices yet" cuando no hay datos en caché.
  - Región viva persistente para lectores de pantalla.
- **Buscador `SymbolSearch`:**
  - `cmdk`, debounce de 300 ms, ⌘K / Ctrl+K y navegación con teclado.
  - Añadir desde los resultados.
  - Diálogo a pantalla completa en móvil.
- **Dashboard:**
  - Tabla en escritorio y tarjetas en móvil.
  - Badge `Stale`.
  - Altas y bajas optimistas con rollback.
  - Tope de 8 comprobado en el cliente.
  - Sparklines de 2 en 2.
- **Detalle `/stocks/[symbol]`:**
  - Quote cargado en el servidor; el 404, el 429 y el 502 van a estados distintos.
  - Rango en la URL con `history.replaceState`.
  - Lightweight Charts con tooltip propio.
  - Métricas clave con la barra de 52 semanas.
- **`lib/format.ts`:**
  - U+2212 para el signo negativo.
  - Hora ET.
  - Fechas diarias en UTC.
  - Etiquetas del eje según `TickMarkType`.
- **124 tests en web**: formato, debounce, buscador, queries, límite, mutaciones, ventana de sparklines y clasificación de errores del quote. El api sigue con 174.
- **Verificación con datos reales** (`frontend-dev`, Edge headless):
  - Login demo, búsqueda, detalle, cambio de rango.
  - Usuario nuevo: vacío, añadir y quitar, símbolo inexistente.
  - Modo oscuro y móvil.
  - Unos 13 créditos de Twelve Data.

## Revisión

- **`ui-ux-guardian`:**
  - Corrigió 14 desviaciones: contraste del exchange resaltado, foco del diálogo móvil, `aria-label` en `div` sin rol, forma de los skeletons, etiquetas del eje en negrita, color del logo de TradingView en oscuro y otras.
  - Propuso 4 cambios a las convenciones y 2 decisiones menores. Las aprobó el autor y las aplicó la sesión principal en `docs/ui-ux-conventions.md`.
- **`code-reviewer`, ronda 1: CAMBIOS REQUERIDOS.**
  - Las sparklines con datos se refetcheaban todas a la vez al volver al dashboard o al reconectar: hasta 8 créditos de golpe.
  - El mapeo de errores del quote en el servidor no tenía test.
  - Además, 8 no bloqueantes.
- **`code-reviewer`, ronda 2: APROBADO.** Las sparklines ya solo arrancan a través de la ventana, y `classifyQuoteError` está extraído y probado.

## Correcciones y decisiones humanas

- El autor aprobó los cambios de convenciones, las comillas rectas y la separación del anillo de foco.
- La sesión principal añadió al spec 03 los dos puntos que el revisor echó en falta: el botón "Watchlist unavailable" y el `maxLength` del buscador.
- Pendiente para `backend-dev`, sin bloquear:
  - alinear el mensaje de lista llena del API con el copy de producto;
  - nombres del proveedor con sufijo "Common Stock" al añadir;
  - un `GET /watchlist` sin quotes para saber solo la pertenencia.
