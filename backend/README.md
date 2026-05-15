# receive-forms-api

API REST para recebimento de mensagens do formulário de contato (de um site externo profissional) e endpoints administrativos para listar / detalhar / gerenciar essas mensagens, com autenticação baseada em sessão.

> Para a **referência exaustiva de regras de negócio** (entidades, fluxos de auth, contratos de endpoint, política de CSRF, rate-limits, etc.) leia `.claude/BACKEND_BUSINESS_RULES.md` na raiz do repositório. Este README é o guia prático de **como rodar / como contribuir**.

---

## Stack

- **Node.js 20+** (declarado em `engines.node`)
- **Express 5** com middlewares: `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `pino-http`
- **TypeScript 5.7** (strict + commonjs)
- **TypeORM 0.3** com **PostgreSQL 16**
- **Zod** para validação de payload
- **Pino** para logging estruturado com redação de PII
- **argon2** (argon2id) para hashing de senha
- **jsonwebtoken** (HS256 com `kid`) para JWT de sessão
- **Vitest 2** para testes

---

## Pré-requisitos

- Node.js >= 20
- Postgres 16 acessível (ou suba via `docker compose up -d postgres` na raiz do repo)
- `openssl` (para gerar segredos)

---

## Setup local

```bash
cd backend
cp .env.example .env

# Segredo de assinatura do JWT (mínimo 32 chars; recomendado 96 hex)
echo "AUTH_JWT_SECRET=$(openssl rand -hex 48)" >> .env

# Opcional: bootstrap do primeiro admin
echo "ADMIN_BOOTSTRAP_EMAIL=admin@local.test" >> .env
echo "ADMIN_BOOTSTRAP_PASSWORD=ChangeMeNow-12!" >> .env

npm install

# Suba o Postgres (se ainda não estiver rodando)
# (na raiz do repo)
# docker compose up -d postgres
# docker compose exec postgres psql -U postgres -c "CREATE DATABASE receive_forms;"

# Aplique as migrations
npm run migration:run

# Dev server (hot reload via tsx)
npm run dev
```

A API sobe em `http://localhost:3000`.

### Variáveis de ambiente

Veja `.env.example` para a lista completa anotada. Para a explicação de **efeito de negócio** de cada uma, veja a seção 15 de `.claude/BACKEND_BUSINESS_RULES.md`.

Atalhos importantes:

| Var | Quando | Default |
|-----|--------|---------|
| `AUTH_JWT_SECRET` | obrigatória em prod (a menos que `AUTH_JWT_KEYS` esteja setada) | gerada efêmera em dev |
| `CORS_ORIGIN` | deve incluir o domínio do site externo (que faz `POST /api/contact`) **e** o domínio do dashboard | `http://localhost:5173` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | sempre | `localhost`/`5432`/`postgres`/`postgres`/`receive_forms` |
| `DB_SYNCHRONIZE` | **nunca true em prod** | `false` |
| `ADMIN_BOOTSTRAP_*` | opcional, só roda quando `users` table estiver vazia | vazio |
| `INGEST_HMAC_SECRET` | opt-in, ativa verificação HMAC do `POST /api/contact` | vazio |

---

## Scripts npm

| Script | O que faz |
|--------|-----------|
| `npm run dev` | `tsx watch src/server.ts` — hot reload em dev |
| `npm run build` | `tsc -p tsconfig.json` — compila para `dist/` |
| `npm start` | `node dist/server.js` — produção |
| `npm run lint` | `tsc --noEmit` (gate de tipos; sem `eslint` configurado) |
| `npm run test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch |
| `npm run migration:run` | aplica migrations pendentes |
| `npm run migration:generate` | gera migration a partir do diff do schema |
| `npm run migration:revert` | reverte a última migration |

---

## Estrutura de pastas

```
backend/
├── src/
│   ├── app.ts                      # builder do Express (separado do bootstrap para testes)
│   ├── server.ts                   # bootstrap: init DB, seed admin, listen, graceful shutdown
│   ├── bootstrap/seedAdmin.ts      # primeiro admin idempotente
│   ├── config/
│   │   ├── data-source.ts          # TypeORM DataSource
│   │   ├── env.ts                  # validação + parse das env vars
│   │   └── logger.ts               # pino com redact de PII
│   ├── controllers/                # auth + contact (thin)
│   ├── services/                   # authService + contactService (lógica de domínio)
│   ├── entities/                   # ContactMessage, User, RefreshToken, PasswordResetToken
│   ├── migrations/                 # TypeORM migrations versionadas
│   ├── middlewares/                # requireAuth, requireCsrf, rateLimiter, verifyHmac, errorHandler
│   ├── routes/                     # auth/contact/health
│   ├── validators/                 # Zod schemas
│   └── errors/HttpError.ts         # HttpError class para responses tipadas
├── tests/
│   ├── setup.ts                    # popula env vars antes de carregar src/
│   ├── helpers/fakeDataSource.ts   # repositórios mock em memória
│   ├── authService.test.ts         # fluxos de hash, rotação, family revocation, change/reset
│   ├── csrf.test.ts                # double-submit
│   ├── login.test.ts               # controller + rate-limit via supertest
│   └── requireAuth.test.ts         # cookie + bearer paths
├── Dockerfile                      # multi-stage, non-root, dumb-init
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Rodando os testes

```bash
npm test
```

- Suite usa **DataSource em memória** (`tests/helpers/fakeDataSource.ts`) — não precisa de Postgres real.
- Argon2 roda com parâmetros mínimos (`mem=1024 KiB`) para velocidade. Ainda é argon2 real.
- Cobertura atual: 4 arquivos, 27 testes (authService, csrf, login, requireAuth).
- Vitest config: `pool: 'forks'` + `singleFork: true` para evitar cross-test em estado global (env vars).

Testes pontuais:
```bash
npx vitest run tests/authService.test.ts
npx vitest run -t "rotateRefresh"
```

---

## Decisões de design (resumo)

> Detalhes completos em `.claude/BACKEND_BUSINESS_RULES.md`.

- **Cookies HttpOnly** para sessão (access JWT + refresh) — sem expor token a JS.
- **CSRF double-submit** (`X-CSRF-Token` ecoa `rf_csrf` cookie) — apenas em rotas mutantes com sessão ativa.
- **Refresh rotation com family revocation**: reuso de token revogado revoga toda a família — sinal de roubo.
- **argon2id** com parâmetros tunáveis via env (sem code change para prod ajustar custo).
- **JWT HS256 com `kid` no header** — rotação O(1), múltiplas keys aceitas simultaneamente.
- **Rate-limit em todas as superfícies sensíveis** (5 limiters distintos), com IPv6 colapsado em /64.
- **Anti-enumeração** em `/login` (mesma 401 + hashing placeholder para timing) e em `/forgot-password` (sempre 204).
- **Logger Pino** com `redact.remove` em headers de cookie/auth e bodies com `email`/`password`/`message`/`token`.
- **Graceful shutdown** com `setTimeout` de force-exit em 25s + `preStop` no manifest.
- **DataSource init com retry** (8 tentativas, exponential backoff até 64s).
- **Migrations idempotentes** (`IF NOT EXISTS`) com `pg_trgm` GIN indexes para `ILIKE` search.

---

## Deploy

### Container

```bash
docker build -t receive-forms-api:1.0.0 ./backend
```

Imagem é multi-stage: stage 1 builda TS → stage 2 instala deps de prod → stage 3 runtime com `node:20-alpine`, `dumb-init` (signal forwarding), user `node` (UID 1000), `HEALTHCHECK` apontando `/api/v1/health`.

### Kubernetes

Manifests em `k8s/` (na raiz do repo):
- `namespace.yaml` — namespace `receive-forms`
- `postgres.yaml` — StatefulSet + PVC
- `networkpolicy.yaml` — default-deny + permits explícitos (DNS, Traefik → API/SPA, API → Postgres)
- `migrate-job.yaml` — Job one-shot que roda `migration:run` antes de cada rollout do backend
- `backend.yaml` — Deployment + Service + HPA (1-3 replicas, 60% CPU)
- `frontend.yaml` — Deployment + Service + HPA
- `ingress.yaml` — Traefik com TLS via cert-manager
- `certificate.yaml` — Certificate cert-manager (alternativa ao `cert-manager.io/cluster-issuer` annotation)

Fluxo recomendado de deploy:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/networkpolicy.yaml
# IMPORTANTE: migrations antes do rollout do backend
kubectl apply -f k8s/migrate-job.yaml
kubectl -n receive-forms wait --for=condition=complete --timeout=120s job/receive-forms-api-migrate
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/certificate.yaml
kubectl apply -f k8s/ingress.yaml
```

**Secrets**: os manifests carregam **placeholders** `REPLACE_ME_*`. Em produção, use **SealedSecrets**, **External Secrets Operator** ou **SOPS** — *.secret.yaml é gitignored.

---

## Conhecidas (TODO / fora do escopo atual)

- `sendPasswordResetEmail` só loga — wire um provider (SES/Postmark/SendGrid) antes de prod com usuários reais.
- Endpoint `/metrics` (Prometheus) não existe — telemetria fica para roadmap.
- Não há OIDC/SSO. Login local é a única auth humana.
- Rate-limit é **in-memory por pod** — em multi-replica o limite efetivo escala. Considere Redis store em escala.
- `POST /api/auth/users` está atualmente sem middleware de auth/admin/CSRF no código (`authRoutes.ts:54-60`) — endpoint público. Veja code review.

---

## Pull requests

- Cada PR de auth/sessão/rate-limit **deve** atualizar `.claude/BACKEND_BUSINESS_RULES.md` na mesma branch.
- `npm run lint` + `npm test` precisam passar.
- Migrations: nunca edite uma migration já aplicada em ambiente compartilhado — gere uma nova.
