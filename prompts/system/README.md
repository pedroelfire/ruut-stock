# System prompts y reglas

Índice de las instrucciones que guían a la IA en este repositorio. Se enlazan en lugar de copiarse para que no se desincronicen; los originales viven donde Claude Code los lee.

| Archivo | Qué es |
|---|---|
| [CLAUDE.md](../../CLAUDE.md) | Reglas del proyecto que Claude Code carga en cada sesión: contexto, idioma, agentes y flujo de trabajo, convenciones de código, commits, tests y registro de prompts |
| [.claude/agents/backend-dev.md](../../.claude/agents/backend-dev.md) | System prompt del agente de backend (Express, Prisma, JWT, Twelve Data, caché) |
| [.claude/agents/frontend-dev.md](../../.claude/agents/frontend-dev.md) | System prompt del agente de frontend (Next.js, BFF, gráficos, estados) |
| [.claude/agents/code-reviewer.md](../../.claude/agents/code-reviewer.md) | System prompt del revisor que aprueba o rechaza cada commit |
| [.claude/agents/auditor.md](../../.claude/agents/auditor.md) | System prompt del auditor que revisa cada fase completa |
| [.claude/agents/ui-ux-guardian.md](../../.claude/agents/ui-ux-guardian.md) | System prompt del guardián de las convenciones de UI/UX |
| [docs/ui-ux-conventions.md](../../docs/ui-ux-conventions.md) | Convenciones visuales que hace cumplir `ui-ux-guardian` |

Todos los agentes usan `model: opus` y `effort: high`.
