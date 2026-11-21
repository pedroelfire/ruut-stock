# Convenciones de UI/UX

Fuente de verdad visual del proyecto. El agente `ui-ux-guardian` la hace cumplir y es el único que la modifica (con aprobación del usuario). Si un cambio de diseño no encaja aquí, primero se actualiza este documento y después el código.

Mockup de referencia (público): [Convenciones UI/UX en el lienzo](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255). Si el mockup y este documento no coinciden, manda este documento.

> Este documento está en español, pero **todo texto que aparece en la interfaz va en inglés** (ver §10). Los ejemplos de copy de este documento ya están en inglés.

---

## 1. Principios

1. **Los datos primero.** El precio y la variación son lo primero que se ve en cada pantalla. Nada de decoración que compita con ellos.
2. **Calma.** Un inversor minorista no quiere una terminal de trading: espacio en blanco generoso, pocos colores y movimiento mínimo.
3. **Siempre explicar el estado.** Cargando, vacío, error, límite de API alcanzado, dato con retraso: cada uno tiene su tratamiento (sección 6).
4. **Accesible por defecto.** WCAG 2.1 AA como mínimo.

## 2. Color

Todos los colores se definen como **tokens CSS** en `apps/web/src/app/globals.css` y se exponen a Tailwind. **Prohibido** usar hexadecimales, `rgb()` o colores de la paleta por defecto de Tailwind (`text-green-600`, `bg-slate-100`, etc.) dentro de los componentes: solo tokens semánticos.

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--background` | Fondo de página | `#FFFFFF` | `#0B1215` |
| `--surface` | Tarjetas, paneles, popovers | `#F7F9FA` | `#111A1E` |
| `--border` | Bordes y separadores, grid del gráfico | `#E3E8EB` | `#22303A` |
| `--foreground` | Texto principal | `#0E1A1F` | `#E6EDF0` |
| `--muted-foreground` | Texto secundario, etiquetas, ejes | `#5B6B73` | `#8A9BA3` |
| `--primary` | Acciones principales, enlaces, línea del gráfico | `#0E7C7B` | `#2BB5B0` |
| `--primary-foreground` | Texto sobre `--primary` | `#FFFFFF` | `#0B1215` |
| `--positive` | Subidas | `#15803D` | `#22C55E` |
| `--negative` | Bajadas y errores destructivos | `#B91C1C` | `#F05252` |
| `--warning` | Límite de API alcanzado, dato obsoleto (texto, borde, icono) | `#B45309` | `#F59E0B` |
| `--warning-subtle` | Fondo del banner de aviso, siempre con texto en `--warning` | `#F9F1EB` | `#272314` |
| `--ring` | Foco visible | `#0E7C7B` | `#2BB5B0` |

Reglas:

- **La variación nunca se comunica solo con color.** Siempre signo (`+1.24%` / `−0.87%`) y, en listas, un icono de flecha (`ArrowUpRight` / `ArrowDownRight`). Así funciona para personas con daltonismo.
- Variación igual a 0: `--muted-foreground`, sin flecha.
- `--positive` y `--negative` se usan solo para variaciones de precio, nunca para decorar.
- `--warning-subtle` es solo un fondo: siempre lleva encima texto, icono y borde en `--warning` (contraste AA en claro y en oscuro). No se usa para otros avisos ni para decorar.
- Los modos claro y oscuro se implementan desde el principio con tokens, aunque el selector de tema sea un extra.

## 3. Tipografía

- Fuente: **Inter** (vía `next/font`), con `system-ui` como fallback.
- **Todas las cifras** (precios, variaciones, volumen, ejes) con `tabular-nums`, para que no "bailen" al actualizarse.
- Ticker (`AAPL`): `font-semibold`, mayúsculas, `tracking-tight`.

| Rol | Clase Tailwind |
|---|---|
| Precio principal (detalle) | `text-4xl font-semibold tabular-nums` |
| Título de página | `text-2xl font-semibold` |
| Título de sección o tarjeta | `text-base font-semibold` |
| Cuerpo | `text-sm` |
| Etiqueta o metadato | `text-xs text-muted-foreground` |

## 4. Espaciado, forma y elevación

- Escala de Tailwind (múltiplos de 4 px). No se usan valores arbitrarios (`p-[13px]`) salvo para justificar un caso concreto.
- Radios: `rounded-lg` (8 px) en tarjetas y paneles, `rounded-md` (6 px) en inputs y botones, `rounded-full` en badges.
- Elevación: bordes (`border border-border`) en lugar de sombras. `shadow-sm` solo en popovers y menús flotantes.
- Contenedor de página: `mx-auto max-w-6xl px-4 sm:px-6`.

## 5. Estructura y layout

### Shell de la app (rutas protegidas)

```
┌────────────────────────────────────────────────────────┐
│ Logo        [ Search symbol…   ⌘K ]          Account ▾ │  header 56 px, sticky
├────────────────────────────────────────────────────────┤
│                                                        │
│   contenido de la página (max-w-6xl)                   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- En móvil, el buscador se convierte en un botón de icono que abre un diálogo a pantalla completa.
- Navegación con teclado en el buscador: `↑` `↓` para moverse, `Enter` para abrir, `Esc` para cerrar. Atajo `⌘K` / `Ctrl+K`.

### Dashboard (watchlist)

- Escritorio (`md` y superior): tabla con columnas **Symbol · Name · Price · Change · Trend · 1M (sparkline) · acciones (sin título)**. Las cifras se alinean a la derecha.
- Móvil: lista de tarjetas (ticker y nombre a la izquierda; precio y variación a la derecha; sparkline debajo).
- Toda la fila o tarjeta es clicable y lleva al detalle.

### Detalle de símbolo (`/stocks/[symbol]`)

Orden vertical fijo:

1. Cabecera: ticker, nombre, exchange, botón de añadir o quitar de la watchlist.
2. Precio actual y variación del día, con la hora del último dato (`As of 14:32 ET`) y el badge `Delayed · 15 min` si aplica.
3. Selector de rango: control segmentado `1D · 1W · 1M · 6M · 1Y`.
4. Gráfico (alto 320 px en móvil, 420 px en escritorio).
5. Rejilla de métricas (**Key metrics**): `Open`, `High`, `Low`, `Previous close`, `Volume`, `52-week range`. Dos columnas en móvil y tres en escritorio.

### Gráficos

- Línea o área con `--primary`. El área usa un degradado de `--primary` al 20 % hacia transparente.
- Grid y ejes en `--border` y `--muted-foreground`.
- Crosshair con tooltip: fecha y precio.
- Sparklines sin ejes ni tooltip, coloreadas con `--positive` o `--negative` según la variación del periodo.

## 6. Estados

| Estado | Tratamiento |
|---|---|
| Cargando | Skeleton con la forma del contenido final (nunca un spinner a pantalla completa) |
| Vacío | Icono sencillo, una frase y una acción: "Your watchlist is empty" · "Search for a stock to add it to your watchlist." · botón `Search stocks` |
| Error | Mensaje en lenguaje humano, sin códigos técnicos, con botón `Try again`: "We couldn't load your watchlist" · "Check your connection and try again." |
| Límite de API alcanzado | Banner con fondo `--warning-subtle`, borde, icono y texto en `--warning`: "Data limit reached" · "Showing the last saved prices. Retrying in 42 s." Si hay datos en caché, se muestran con el badge `Stale` |
| Dato con retraso | Badge discreto `Delayed · 15 min` junto a la hora del último dato |
| Sin resultados de búsqueda | "No results for "xyz"" · "Try the ticker symbol, like AAPL." |

## 7. Componentes

- Base: **shadcn/ui** en `apps/web/src/components/ui/`. No se editan salvo para aplicar tokens.
- Iconos: **lucide-react** exclusivamente, con tamaño `size-4` en línea y `size-5` en botones de icono.
- Antes de crear un componente nuevo se comprueba si ya existe uno equivalente en `components/`.
- Los botones de icono llevan siempre `aria-label`.

## 8. Formato de datos

Siempre con `Intl` y a través de `apps/web/src/lib/format.ts`; nunca se formatea a mano en un componente.

| Dato | Formato | Ejemplo |
|---|---|---|
| Precio | Moneda del símbolo, 2 decimales | `$189.84` |
| Variación absoluta | Con signo, 2 decimales | `+2.31` |
| Variación % | Con signo, 2 decimales | `+1.24%` |
| Volumen | Compacto | `52.3M` |
| Fecha en ejes | Según el rango: hora para 1D, mes y día para 1W a 6M, mes y año para 1Y | `14:30`, `Nov 12`, `Nov ’26` |

El signo negativo es el carácter `−` (U+2212), no un guion.

## 9. Accesibilidad

- Contraste AA: 4.5:1 para texto normal y 3:1 para texto grande y elementos gráficos.
- Foco visible en todo elemento interactivo (`focus-visible:ring-2 ring-ring`).
- Las áreas táctiles miden 40 × 40 px como mínimo.
- Respetar `prefers-reduced-motion`: sin animaciones de entrada ni transiciones del gráfico.
- Los gráficos llevan un resumen accesible (`aria-label` con el rango, el valor inicial, el final y la variación).
- Formularios: `label` asociado, errores vinculados con `aria-describedby` y foco en el primer campo con error.

## 10. Texto

- Idioma de la UI: **inglés, 100 %** (decisión confirmada). Ningún texto visible, `aria-label`, `title`, `alt` ni mensaje de error en otro idioma. Locale de formato: `en-US`.
- Tono directo y sin jerga.
- Botones con verbo: "Add to watchlist", "Try again".
- No se usan mayúsculas sostenidas salvo en tickers.
