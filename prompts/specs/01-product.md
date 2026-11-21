# Spec 01: Producto

> Qué construimos, para quién y qué queda fuera. Los specs de backend ([02-backend.md](02-backend.md)) y frontend ([03-frontend.md](03-frontend.md)) desarrollan cómo.
> Todo el copy de la interfaz va en inglés; este documento lo cita literal.

## 1. Problema y usuario

**Usuario:** inversor minorista que sigue entre 3 y 10 acciones de EE. UU. Entra un par de veces al día para ver cómo van, sin operar desde la app.

**Problema:** las plataformas de trading y los portales financieros están llenos de ruido (noticias, anuncios, decenas de indicadores). Este usuario solo quiere responder rápido tres preguntas:

1. ¿Cómo van hoy mis acciones?
2. ¿Cómo ha evolucionado una acción concreta en distintos plazos?
3. ¿Hay alguna acción nueva que quiera seguir?

**Propuesta de valor:** una watchlist tranquila y clara. El precio y la variación son lo primero que se ve, y la app siempre explica el estado de los datos (con retraso, desactualizados o límite alcanzado).

## 2. Alcance del MVP

### Historias de usuario y criterios de aceptación

**H1. Registro e inicio de sesión**
Como visitante, quiero crear una cuenta o entrar con la cuenta demo para empezar a usar la app.
- Registro con email y contraseña (de 8 a 72 caracteres). Al registrarse, la sesión queda iniciada.
- Inicio de sesión con email y contraseña. Ante credenciales incorrectas se muestra un mensaje genérico: "Invalid email or password".
- La pantalla de login tiene un botón **"Use demo account"** que inicia sesión con el usuario demo, para que el evaluador entre en un clic.
- Cerrar sesión desde el menú de usuario.
- Con la sesión expirada, cualquier acción lleva a `/login` con el aviso "Your session expired. Please sign in again."

**H2. Buscar acciones**
Como usuario, quiero buscar por ticker o nombre para encontrar una acción.
- Buscador siempre visible en la cabecera (en móvil, un botón que abre un diálogo). Atajo `⌘K` / `Ctrl+K`.
- Resultados mientras se escribe, con debounce de 300 ms, desde el primer carácter.
- Solo se ofrecen acciones y ETF de mercados de EE. UU., porque el plan gratuito de Twelve Data solo garantiza esos datos.
- Cada resultado muestra ticker, nombre y mercado. Con el teclado: `↑` `↓` para moverse, `Enter` para abrir el detalle y `Esc` para cerrar.
- Sin resultados: "No results for "xyz"" · "Try the ticker symbol, like AAPL."

**H3. Watchlist**
Como usuario, quiero ver de un vistazo cómo van las acciones que sigo.
- Por cada símbolo: ticker, nombre, precio, variación del día (absoluta y en %) y sparkline del último mes.
- Añadir desde los resultados de búsqueda o desde el detalle, y quitar desde la propia watchlist o desde el detalle.
- Máximo de **8 símbolos** por usuario: es lo que cabe en un minuto de créditos del plan gratuito (8 por minuto, ver 02-backend §5). Al llegar al máximo: "Your watchlist is full (8 symbols). Remove one to add another."
- Los precios se refrescan solos cada 2 minutos mientras el mercado está abierto y la pestaña está visible. Con el mercado cerrado no se refrescan, porque no cambian.
- La watchlist persiste entre sesiones y dispositivos (se guarda en la base de datos).
- Vacía: "Your watchlist is empty" · "Search for a stock to add it to your watchlist." más tres sugerencias que se añaden en un clic (AAPL, MSFT, NVDA).
- El usuario demo arranca con 5 símbolos.

**H4. Detalle de una acción**
Como usuario, quiero ver la evolución de una acción en distintos plazos.
- Ruta `/stocks/[symbol]`, con el orden de bloques fijado en `docs/ui-ux-conventions.md` §5.
- Precio actual y variación del día, con la hora del dato (`As of 14:32 ET`).
- Gráfico de área con selector de rango `1D · 1W · 1M · 6M · 1Y` (1M por defecto), con crosshair y tooltip de fecha y precio, y la variación del periodo.
- Métricas clave: `Open`, `High`, `Low`, `Previous close`, `Volume`, `52-week range`.
- Botón para añadir o quitar de la watchlist.
- Símbolo inexistente: página "We couldn't find "XYZ"" con enlace a la watchlist.

**H5. Transparencia sobre los datos**
Como usuario, quiero saber si lo que veo está actualizado.
- Badge `Delayed · N min` solo si el plan del proveedor entrega datos con retraso. Es configurable en el backend: el plan Basic declara datos de EE. UU. en tiempo real, así que por defecto no aparece.
- Si se alcanza el límite de la API en una vista principal (watchlist, detalle o búsqueda), banner "Data limit reached" · "Showing the last saved prices. Retrying in 42 s." y badge `Stale` en cada dato servido desde caché.
- Las sparklines son secundarias: si no hay créditos, muestran una línea plana y se reintentan en silencio, sin banner.
- Cualquier otro error: mensaje humano con botón `Try again`, nunca códigos técnicos.

## 3. Fuera de alcance (y por qué)

| Fuera | Por qué |
|---|---|
| Trading, órdenes o carteras con P&L | Otro producto; exige datos de posiciones y cumplimiento normativo |
| Tiempo real por WebSocket | El plan gratuito solo da créditos de prueba para WebSocket; el polling con caché basta para este usuario |
| Mercados fuera de EE. UU. | No están garantizados en el plan gratuito |
| Noticias, fundamentales, indicadores técnicos | Ruido para este usuario y créditos extra; candidatos para "con más tiempo" |
| Alertas de precio y emails | Requieren jobs en segundo plano y proveedor de email |
| Recuperación de contraseña, OAuth | No aportan a la evaluación; el registro abierto y la cuenta demo bastan |
| Comparador de símbolos y modo oscuro conmutable | Extras de la Fase 4 si sobra tiempo (los tokens dark ya existen) |

## 4. Restricciones

- **Twelve Data, plan Basic (verificado el 2026-11-21):** 8 créditos por minuto y 800 al día. Cada símbolo de una petición cuesta un crédito. Exceder el límite devuelve un error 429.
- **Licencia:** el plan Basic se describe como de uso interno, sin redistribución pública de datos. Para una prueba técnica y portafolio personal es aceptable (el propio enunciado lo indica), pero hay que mencionarlo en el README.
- **Railway (verificado el 2026-11-21):** 30 días de prueba con 5 USD de crédito único; después, el plan Free da 1 USD al mes y los servicios se duermen sin tráfico. Ver los riesgos de PLAN.md.
- **Tiempo:** unas 3 horas de construcción.

## 5. Criterios de éxito de la demo

1. Un evaluador entra con "Use demo account" y ve su watchlist con datos reales en menos de 5 segundos.
2. Puede buscar, añadir, abrir un detalle y cambiar de rango sin ver un error técnico.
3. Si se agotan los créditos durante la revisión, la app sigue siendo usable con datos en caché y lo explica.
4. La interfaz funciona en móvil (390 px) y en escritorio.
