# Uso de IA en este proyecto

Registro de cómo se construyó la app con IA, como pide la prueba: herramientas, modelos, forma de trabajar, todos los prompts en orden y dónde se equivocó la IA.

## Herramientas y modelos

| Herramienta | Modelo | Para qué |
|---|---|---|
| Claude Code (extensión de VS Code) | Claude Opus 5.5 (`claude-opus-5-5`) | Sesión principal: planificación, orquestación de agentes, commits |
| Subagentes de Claude Code (`.claude/agents/`) | Claude Opus 5.5, esfuerzo `high` | `backend-dev`, `frontend-dev`, `code-reviewer`, `auditor`, `ui-ux-guardian` |
| Lienzo de diseño de claude.ai | Claude Opus 5.5 | [Mockup público de las convenciones UI/UX](https://claude.ai/artifact/NTM4dZadVzCE9kyGc7d255) |

## Forma de trabajar

1. **Spec primero.** Antes de escribir código se fijan el plan ([PLAN.md](../PLAN.md)), las reglas ([CLAUDE.md](../CLAUDE.md)), las convenciones visuales ([docs/ui-ux-conventions.md](../docs/ui-ux-conventions.md)) y los specs de `specs/`.
2. **Agentes especializados.** La sesión principal delega: los agentes de desarrollo implementan, `ui-ux-guardian` vigila la interfaz, `code-reviewer` aprueba cada commit y `auditor` revisa cada fase completa.
3. **Revisión humana.** Cada fase empieza con luz verde explícita del autor, que revisa lo producido y corrige el rumbo.
4. **Registro.** Cada petición queda en `sessions/NN-topic.md`, en orden.

## Estructura

```
prompts/
├── README.md     # este archivo
├── system/       # índice de las reglas y system prompts (CLAUDE.md, agentes)
├── specs/        # specs de producto, backend y frontend (Fase 0)
└── sessions/     # prompts enviados, en orden
```

## Sesiones

| # | Sesión | Resultado |
|---|---|---|
| 00 | [Planificación](sessions/00-planning.md) | PLAN.md: fases, stack, estructura, Railway |
| 01 | [Agentes](sessions/01-agents.md) | 5 agentes, CLAUDE.md, convenciones UI/UX |
| 02 | [Mockup de UI](sessions/02-ui-mockup.md) | Lienzo con 5 tableros |
| 03 | [Puesta a punto del repo](sessions/03-repo-setup.md) | Regla de idioma, convención de commits, registro de prompts, git init |
| 04 | [Cierre de la Fase 0](sessions/04-phase-0-close.md) | Specs 01-03, andamiaje del monorepo, 3 rondas de `code-reviewer` |
| 05 | [Ajustes: README, token y secretos](sessions/05-readme-token-secrets.md) | README en español, `--warning-subtle`, secretos movidos a archivos `.env` ignorados |

## Dónde se equivocó la IA

Registro honesto de errores de la IA y de lo que se corrigió a mano o por indicación del autor.

| Sesión | Qué pasó | Cómo se corrigió |
|---|---|---|
| 01 | Las convenciones de UI proponían la interfaz en inglés, pero dejaban textos de UI en español (rangos `1S`/`1A`, mensajes de estado, columnas de la tabla). | El autor fijó la regla "código e interfaz 100 % en inglés, solo los `.md` en español". En la sesión 03 se tradujo todo el copy de UI de las convenciones. |
| 01 | La paleta de colores la propuso la IA sin que el autor hubiera fijado colores antes. | Se validó visualmente con el mockup de la sesión 02. |
| 02 | Un token necesario no estaba en las convenciones: el banner de límite de API necesitaba un fondo suave (`#F9F1EB`) que no existía como token. | El autor aprobó añadir `--warning-subtle` (`#F9F1EB` en claro, `#272314` en oscuro) en la sesión 05. |
| 04 | Los primeros specs no cuadraban con el límite de créditos: watchlist de 10 símbolos frente a 8 créditos por minuto, y quotes "en lote" contados como una sola llamada. | Lo detectó `code-reviewer`. Se pasó a un máximo de 8 símbolos y reserva parcial de créditos. |
| 04 | El rate limit por IP no tenía en cuenta que, detrás del BFF, todas las peticiones llegan desde el servidor de Next. | Lo detectó `code-reviewer`. El BFF reenvía la IP real y los límites usan email + IP. |
| 04 | Huecos de contrato: `name` sin persistir, `stale` global en lugar de por dato, quote sin distinguir "no existe" de "sin créditos", posible bucle de redirección con una cookie rechazada. | Lo detectó `code-reviewer` en dos rondas; los specs se corrigieron antes de escribir código. |
| 04 | La primera configuración tenía detalles incorrectos: `engines` de Node incompatible con ESLint 10, `lint` sin `--max-warnings 0`, Postgres expuesto en toda la red local, `esModuleInterop` redundante. | Lo detectó `code-reviewer` y se corrigió. |
