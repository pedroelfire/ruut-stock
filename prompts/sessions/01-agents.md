# Sesión 01: Agentes del repositorio

- **Fecha:** 2026-11-21
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** ninguno (sesión principal, que los definió)

## Prompt del usuario

> Vamos a definir agentes para el trabajo en este repositorio, un agente para el frontend, otro agente para el backend, estos dos deben de ser capaces de poder escribir codigo especializado en su area y tambien de escribir solo los tests necesarios en las funciones y codigo que puede fallar o ser propenso. Se debe de definir un agente que sea un revisor de codigo, que mire el codigo y sea capaz de aprobar calidad de codigo, asi como un auditor, que se llamara en este caso, cada que se termine alguna feature grande, para ver areas de mejora y calidad. Por ultimo un agente que mantenga en regla las convenciones de UI/UX, como colores y estructura con los planteados al principio, define los agentes con opus en high

## Qué produjo la IA

- 5 agentes en `.claude/agents/`, todos con `model: opus` y `effort: high`:
  - `backend-dev` y `frontend-dev`: escriben código de su área y solo los tests de código propenso a fallar, con una lista explícita de qué sí y qué no se testea.
  - `code-reviewer`: solo lectura; ejecuta typecheck, lint y tests y emite **APROBADO** o **CAMBIOS REQUERIDOS** con bloqueantes por archivo y línea.
  - `auditor`: se ejecuta al cerrar cada fase; escribe un informe en `docs/audits/` con puntuación por área y hallazgos priorizados.
  - `ui-ux-guardian`: corrige desviaciones de la capa de presentación; las convenciones solo cambian con aprobación del autor.
- [CLAUDE.md](../../CLAUDE.md) con convenciones de código, política de tests y el flujo entre agentes.
- [docs/ui-ux-conventions.md](../../docs/ui-ux-conventions.md) con tokens de color (claro y oscuro), tipografía, espaciado, layout por pantalla, estados, formato de datos y accesibilidad.

## Correcciones y decisiones humanas

- La paleta (base teal, verde y rojo para variaciones, ámbar para avisos) la propuso la IA; el autor no había fijado colores antes. Se validó con el mockup de la sesión 02.
- Error de la IA: dejó copy de UI en español en las convenciones aunque proponía la interfaz en inglés. Se corrigió en la sesión 03.
