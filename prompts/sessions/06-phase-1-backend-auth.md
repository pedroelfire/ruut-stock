# Sesión 06: Fase 1, backend base y autenticación

- **Fecha:** 2026-11-21
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `backend-dev` (implementación y correcciones), `code-reviewer` (2 rondas) y `auditor` (detenido a petición del autor)

## Prompts del usuario

> Luz verde, inicia la fase 1

> Ya inicie docker

> No quiero que el auditador escriba un docs. Si todo pasa correctamente, pasa a la fase 2, y el auditor solo lo vamos a correr cuando completemos las fases

## Qué produjo la IA

- **`packages/shared`:** esquemas Zod de auth (register y login con un límite de 72 bytes UTF-8, user, respuesta de auth) y del envelope de error con sus códigos. Compila a `dist`.
- **`apps/api`:**
  - `createApp(deps)` con dependencias inyectadas.
  - Configuración validada con Zod; `CORS_ORIGIN` se normaliza.
  - helmet, cors con lista blanca, pino con redacción de datos sensibles, un único formato de error y `GET /health`.
  - Auth: register, login y me, con bcryptjs y JWT HS256 (`exp` obligatorio, algoritmo fijo).
  - Limitadores: login por email + IP más un tope global, y registro por IP.
  - Prisma 7.10.1 con adapter-pg, la migración inicial y un seed idempotente.
  - Escucha en `::`; un fallo de `listen` sale con exit 1.
- **41 tests** (Vitest y Supertest, con un repositorio en memoria): middleware JWT, auth, limitador de login, repositorio Prisma (P2002), carrera de registro, body de más de 10 kb, charset no soportado y configuración.
- **Prueba de punta a punta contra Postgres real** (Docker), hecha por la sesión principal:
  - La migración se aplicó y no hay diferencias con el schema.
  - El seed ejecutado dos veces deja 1 usuario y 5 símbolos.
  - Registro 201 y luego 409 real, login 200, `/auth/me` 200, contraseña incorrecta 401, login demo 200.
  - Los logs no contienen secretos.

## Revisión con `code-reviewer`

- **Ronda 1: CAMBIOS REQUERIDOS.** Un bloqueante: en Express 5, el callback de `listen` también recibe el error, así que con el puerto ocupado se registraba "API listening" y el proceso salía con 0. Además, 9 no bloqueantes:
  - Escucha en `::` para la red privada IPv6 de Railway.
  - Tests del camino P2002.
  - 4xx de body-parser convertidos en 500.
  - `exp` no obligatorio en el JWT.
  - `CORS_ORIGIN` sin normalizar.
  - `DEMO_*` en el esquema del servidor.
  - `dist` de `shared` desactualizado en los tests.
  - Avisos de despliegue y documentación de PLAN.
- **Ronda 2: APROBADO.** Las correcciones se verificaron con tests y con arranques reales.

## Correcciones y decisiones humanas

- El autor arrancó Docker para la prueba de punta a punta.
- **Cambio de proceso decidido por el autor:** el `auditor` no escribe archivos y solo se ejecuta al completar todas las fases. Se detuvo la auditoría de la Fase 1 que estaba en curso y se borró el informe que alcanzó a escribir (no había hallazgos críticos). Se actualizaron `.claude/agents/auditor.md`, CLAUDE.md, PLAN.md y el README de `prompts/`.
- Decisiones de la IA aceptadas: bcryptjs en lugar de bcrypt (sin compilación nativa) y Prisma 7.10.1 estable en lugar de la 8 rc.
