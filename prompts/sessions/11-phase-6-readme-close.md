# Sesión 11: Fase 6, README y cierre

- **Fecha:** 2026-11-22
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** ninguno (la sesión principal); `auditor` al terminar todas las fases

## Prompt del usuario

> Mientras se despliega, quiero que hagas la fase 6, y verificando que se cumpla lo que pide el PDF

## Qué produjo la IA

- **`README.md` raíz** (en español):
  - qué se construyó y para quién;
  - qué se dejó fuera y por qué;
  - diagrama de arquitectura y decisiones y trade-offs;
  - cómo correrlo en local;
  - despliegue;
  - tiempo invertido por fase, con dónde se fue el tiempo extra;
  - qué haría con más tiempo;
  - uso de IA.
- **Contraste con el PDF de la prueba**, punto por punto:

| Lo que pide el PDF | Dónde se cumple |
|---|---|
| Backend conectado a una API pública de mercado | `apps/api` con Twelve Data, solo a través del backend |
| Frontend conectado al backend con JWT | JWT emitido por Express, cookie httpOnly en Next y `Authorization: Bearer` (BFF) |
| Los dos servicios desplegados, cada uno con URL pública | `ruut-stock-web.up.railway.app` y `ruut-stock-api.up.railway.app` |
| Carpeta `/prompts` con todos los prompts | `prompts/`: README, `system/`, `specs/` 01-03 y `sessions/` 00-11 en orden |
| Herramientas y modelos; dónde se equivocó la IA | `prompts/README.md` |
| Repositorio público | `github.com/pedroelfire/ruut-stock` |
| Usuario de prueba o registro abierto | Registro abierto y botón "Use demo account" |
| README: correrlo en local, arquitectura, decisiones y trade-offs, tiempo, más tiempo | `README.md` |
| Qué se construyó, qué se dejó fuera y por qué | `README.md` y spec 01 |
| Diseñar con el límite de la API en mente: caché, debounce, error de límite | Caché y presupuesto de créditos en el api, debounce de 300 ms, banner con cuenta atrás y badge `Stale` |
| Explicar el stack o la base de datos si se sale de la recomendación | Railway Postgres en lugar de Supabase, explicado en las decisiones del README |

- **Tablas de `prompts/README.md`:** sesiones 10 y 11, y errores de la IA en las Fases 5 y 6.
- **PLAN.md:** Fases 5 y 6 marcadas, con la verificación en producción.

## Correcciones y decisiones humanas

- **Contraseña demo:** no se publica en el repositorio. El acceso queda cubierto por el registro abierto y el botón demo, que entra sin escribirla.
- **Ensayo de la entrevista:** el punto de PLAN "ensayar el walkthrough" queda para el autor.
