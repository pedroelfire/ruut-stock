# Sesión 00: Planificación

- **Fecha:** 2026-11-21
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** ninguno (sesión principal)

## Prompt del usuario

> Quiero que analizes el PDF para esta prueba tecnica que vamos a desarrollar, quiero que hagas un .md con los objetivos del desarrollo por fases, el stack, folder structure, asi como la seleccion de hosting que va a ser railway.

## Qué produjo la IA

- Leyó el enunciado (8 páginas) y extrajo los requisitos fijos: datos solo vía backend, JWT entre front y back, dos servicios desplegados, carpeta `/prompts` y README con decisiones.
- Creó [PLAN.md](../../PLAN.md) con:
  - Resumen de la prueba y de los criterios de evaluación.
  - Propuesta de producto (watchlist para inversor minorista), pendiente de confirmar.
  - Stack: monorepo pnpm, Next.js 15, Express 5, Prisma, PostgreSQL en Railway, Zod compartido, Lightweight Charts.
  - Decisión de auth con Next.js como BFF (cookie httpOnly en el dominio de Next y JWT como Bearer hacia Express), porque `*.up.railway.app` está en la Public Suffix List y las cookies cross-site fallan en Safari.
  - Estrategia frente al rate limit de Twelve Data (TTL por tipo de dato, quotes en lote, dedupe, fallback a dato obsoleto).
  - Estructura de carpetas, modelo de datos, API, 7 fases con criterios de "hecho cuando", configuración de Railway y riesgos.

## Correcciones y decisiones humanas

- Hosting fijado por el autor: Railway.
- La IA advirtió que Railway ya no tiene un tier gratuito ilimitado y propuso un plan B (Vercel + Supabase). Queda por verificar en la Fase 0.
