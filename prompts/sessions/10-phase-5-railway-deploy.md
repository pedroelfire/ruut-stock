# Sesión 10: Fase 5, despliegue en Railway

- **Fecha:** 2026-11-22
- **Herramienta y modelo:** Claude Code (extensión de VS Code), Claude Opus 5.5
- **Agentes usados:** `code-reviewer` (2 rondas) y un agente de lectura web para la documentación de Railway

## Prompts del usuario

> Por mientras, quiero que empieces a trabajar en la estructura del deploy de railway, te deje el token en una variable llamada CLAUDE_RAILWAY_TOKEN

> Este es el remote: git remote add origin https://github.com/pedroelfire/ruut-stock.git
> Es para la cuenta de pedroelfire, si no tienes la sesion iniciada, abreme la ventana para iniciar sesion

> Vuelve a intentar

> Ya cree el .env.railway, vuelve a intentar

## Qué produjo la IA

- **Investigación:** al leer la documentación vigente, la IA descubrió que el plan original (`railway.json`, Config as Code) ya no sirve.
  - Está deprecado: los servicios nuevos no pueden usarlo y Railway deja de leerlo el 2026-12-01.
  - Se rehízo con **Infrastructure as Code** (`.railway/railway.ts`). Antes de escribirlo, la IA leyó los tipos del SDK oficial (`railway@3.17.0`), porque la documentación no cubría algunos detalles: dominios generados, referencias dentro de cadenas y política de reinicio.
- **Archivos:**
  - `.railway/railway.ts`: Postgres, api y web con origen GitHub, builder Dockerfile y watch paths. Además:
    - pre-deploy con migraciones y seed;
    - healthchecks;
    - dominios `*.up.railway.app` con puertos fijos;
    - secretos con `preserve()`.
  - `apps/api/Dockerfile` y `apps/web/Dockerfile`, con contexto en la raíz del monorepo. Se eligió Dockerfile en lugar de Railpack por sus problemas conocidos con pnpm. Las dos imágenes se construyeron en local antes de desplegar.
  - `.dockerignore`, que deja fuera los `.env`, `node_modules`, builds, docs y prompts.
  - Script `db:release` en el api. Se reescribieron PLAN §6 y el spec 02 §7.
- **GitHub:**
  - Remote `pedroelfire/ruut-stock` y push de `main`. Antes, la IA revisó todo el historial: ningún secreto ni archivo `.env`.
  - El repo es público.
- **Railway:**
  - **Token:** se comprobó por GraphQL que era de cuenta, sin imprimirlo. La CLI lo leía desde `.env.railway` (ignorado por git).
  - **Proyecto:** se usó `ruut-tech-test`, que el autor ya había creado. El plan mostró 3 recursos que añadir y ninguno que borrar.
  - **Apply:** `railway config apply` creó Postgres, api y web con sus dominios.
  - **Secretos del api:** `JWT_SECRET` nuevo, la key de Twelve Data y la cuenta demo. Se fijaron con la CLI leyéndolos de los `.env` locales; ningún valor apareció en la salida.
- **Prueba en producción:**
  - `/health` da 200 y el api sin token da 401.
  - El login demo da 200 y el registro da 201.
  - Búsqueda, alta y baja en la watchlist, quote, serie y detalle funcionan con datos reales.
  - La web llega al api por la red privada.

## Revisión

- **`code-reviewer`, ronda 1: CAMBIOS REQUERIDOS.**
  - El IaC no declaraba los dominios públicos. Sin el de la web, `CORS_ORIGIN` quedaba en `https://`, el api no arrancaba y entraba en bucle de reinicios.
  - El spec 02 y PLAN §6 seguían describiendo `railway.json` y un `PORT` inyectado.
- **`code-reviewer`, ronda 2: APROBADO.** Los dominios ya están declarados con constantes compartidas, la web referencia las variables demo del api y los documentos están al día.

## Correcciones y decisiones humanas

- **Token:** el autor lo había definido en una sola terminal y la IA no podía verlo. Tras dos intentos, lo puso en `.env.railway`.
- **Repositorio:** lo dio el autor, en la cuenta `pedroelfire`.
- **Proyecto de Railway:** se reutilizó `ruut-tech-test`, el que el autor creó para la prueba. Su servicio vacío `observant-wisdom` no se tocó.
- **Usuario de prueba:** en la base de datos de producción queda un usuario `smoke-…@example.com`, creado durante el smoke test.
