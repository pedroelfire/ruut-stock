# Sesión 02: Mockup de las convenciones UI/UX

- **Fecha:** 2026-11-21
- **Herramienta y modelo:** Claude Code (extensión de VS Code) con el lienzo de diseño de claude.ai, Claude Opus 5.5
- **Agentes usados:** ninguno (sesión principal)

## Prompt del usuario

> Generame un artefacto con un mockup de como se verian las convenciones de ux-ui

## Qué produjo la IA

Un lienzo con 5 tableros, publicado en https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255:

1. **Guía de estilo:** principios, tabla de los 11 tokens en claro y oscuro, tipografía, variación con signo y flecha, formato de datos, espaciado y forma, componentes base y accesibilidad.
2. **Estados:** cargando, vacío, error, límite de API alcanzado, dato con retraso y búsqueda sin resultados.
3. **Dashboard (claro):** cabecera con el buscador abierto y la tabla de la watchlist con sparklines.
4. **Detalle de símbolo (oscuro):** selector de rango interactivo que cambia el gráfico, ejes, tooltip y variación del periodo; métricas clave.
5. **Watchlist móvil (390 px):** tarjetas con el banner de límite alcanzado y badges `Stale`.

Datos de mercado ilustrativos.

## Correcciones y decisiones humanas

- A mitad de la publicación, el autor hizo público el lienzo y el permiso automático bloqueó las siguientes subidas (los tableros 3 a 5 quedaron escritos en local). En la sesión 03 el autor confirmó que el lienzo es público a propósito.
- El mockup destapó tres puntos en las convenciones:
  1. Falta un token de fondo suave para el banner de aviso (`--warning-subtle`). Pendiente de aprobación.
  2. Los rangos estaban en español (`1S`/`1A`). Resuelto en la sesión 03: `1W`/`1Y`.
  3. Área táctil mínima: 40 px en las convenciones frente a 44 px que recomienda la guía del lienzo. Se mantiene 40 px.
