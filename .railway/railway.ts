// Railway Infrastructure as Code for the ruut-tech-test project (Postgres + api + web).
// Applied with the Railway CLI: `railway config plan`, then `railway config apply`.
// Railway does not read this file on deploy; deploys come from the GitHub source below.
//
// Secrets are never written here: `preserve()` keeps the value already set in Railway. They are
// set once with `railway variables --set` after the first apply, then the api is redeployed
// (runbook in PLAN.md, section 6).
import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac';

const REPO = 'pedroelfire/ruut-stock';
const BRANCH = 'main';

// Fixed ports: the web service reaches the api on the private network at a known port, and each
// public domain routes to its service's port.
const API_PORT = '4000';
const WEB_PORT = '3000';

// Generated *.up.railway.app domains. The api needs the web origin (CORS_ORIGIN) to boot, and the
// technical test requires both services to be public.
const API_DOMAIN = 'ruut-stock-api.up.railway.app';
const WEB_DOMAIN = 'ruut-stock-web.up.railway.app';

// Both images build from the repo root (pnpm workspace + packages/shared), so any change to the
// workspace manifests, the shared package or the base tsconfig must redeploy both services.
const SHARED_WATCH = [
  '/packages/shared/**',
  '/package.json',
  '/pnpm-lock.yaml',
  '/pnpm-workspace.yaml',
  '/tsconfig.base.json',
  '/.dockerignore',
];

export default defineRailway(() => {
  const db = postgres('Postgres');

  const api = service('api', {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/api/Dockerfile',
      watchPatterns: ['/apps/api/**', ...SHARED_WATCH],
    },
    // Migrations, then the idempotent demo seed. A failure stops the deploy.
    preDeploy: 'pnpm run db:release',
    healthcheck: '/health',
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    networking: { serviceDomains: { [API_DOMAIN]: { port: Number(API_PORT) } } },
    env: {
      NODE_ENV: 'production',
      PORT: API_PORT,
      LOG_LEVEL: 'info',
      DATABASE_URL: db.env.DATABASE_URL,
      JWT_SECRET: preserve(),
      JWT_EXPIRES_IN: '1h',
      // The browser never calls the api (BFF), but the api still validates the allowed origin.
      CORS_ORIGIN: `https://${WEB_DOMAIN}`,
      TWELVE_DATA_API_KEY: preserve(),
      TWELVE_DATA_CREDITS_PER_MINUTE: '8',
      TWELVE_DATA_CREDITS_PER_DAY: '800',
      TWELVE_DATA_DELAY_MINUTES: '0',
      // Used by the pre-deploy seed; the server itself starts without them.
      DEMO_USER_EMAIL: preserve(),
      DEMO_USER_PASSWORD: preserve(),
    },
  });

  const web = service('web', {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/web/Dockerfile',
      watchPatterns: ['/apps/web/**', ...SHARED_WATCH],
    },
    // Public page that answers 200 without a session ("/" redirects to /login).
    healthcheck: '/login',
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    networking: { serviceDomains: { [WEB_DOMAIN]: { port: Number(WEB_PORT) } } },
    env: {
      NODE_ENV: 'production',
      PORT: WEB_PORT,
      API_INTERNAL_URL: `http://\${{api.RAILWAY_PRIVATE_DOMAIN}}:${API_PORT}`,
      SESSION_COOKIE_NAME: 'ruut_session',
      // Must match the api's demo account: referenced, so there is a single source of truth.
      DEMO_USER_EMAIL: api.env.DEMO_USER_EMAIL,
      DEMO_USER_PASSWORD: api.env.DEMO_USER_PASSWORD,
    },
  });

  return project('ruut-tech-test', { resources: [db, api, web] });
});
