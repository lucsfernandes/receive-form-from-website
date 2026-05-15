# receive-forms-app (dashboard SPA)

SPA administrativa em React/Vite que consome a API `receive-forms-api` para listar, buscar e ler mensagens enviadas pelo formulário do site externo, com autenticação cookie-based, gestão de admins e self-service de senha.

> Para a **referência exaustiva de regras de UX/UI, rotas, fluxos e contratos com o backend** leia `.claude/FRONTEND_BUSINESS_RULES.md` na raiz do repositório. Este README é o guia prático de **como rodar / como contribuir**.

---

## Stack

- **Vite 6** (build + dev server)
- **React 19** (com novo JSX runtime)
- **TypeScript 5.7** (strict)
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **react-router-dom v7** (BrowserRouter)
- **axios 1.7** com cookies (`withCredentials`) e interceptors customizados
- **Vitest 2** + **Testing Library** (jsdom)

---

## Pré-requisitos

- Node.js >= 20 (declarado em `engines.node`)
- Backend `receive-forms-api` rodando em `http://localhost:3000` (o dev server da Vite proxia `/api` para esse endpoint)

---

## Setup local

```bash
cd frontend
cp .env.example .env       # opcional — só precisa preencher se quiser API em outro host
npm install
npm run dev                # http://localhost:5173
```

O Vite dev server **proxia** `/api → http://localhost:3000` (definido em `vite.config.ts`). Isso significa que com `VITE_API_BASE_URL=""` (default) os cookies setados pelo backend ridem normalmente sem CORS round-trips.

### Variáveis de ambiente

Existe **uma única** env var relevante no frontend:

| Var | Default | Quando preencher |
|-----|---------|------------------|
| `VITE_API_BASE_URL` | `""` (paths relativos) | Apenas se a API estiver em outro host (ex.: `http://localhost:3000` em dev cross-port). Em prod com Traefik unificando hosts, **deixe vazio**. |

**Importante:** variáveis `VITE_*` vão para o bundle final do navegador. Nada secreto entra aqui.

---

## Scripts npm

| Script | O que faz |
|--------|-----------|
| `npm run dev` | Vite dev server (porta 5173, hot reload, proxy `/api`) |
| `npm run build` | `tsc -b && vite build` — sai em `dist/` |
| `npm run preview` | Pré-visualiza o `dist/` localmente (porta 5173) |
| `npm run lint` | `tsc --noEmit` (gate de tipos; sem ESLint configurado) |
| `npm run test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch |

---

## Estrutura de pastas

```
frontend/
├── src/
│   ├── main.tsx                    # bootstrap (createRoot) + listener unhandledrejection
│   ├── App.tsx                     # BrowserRouter + AuthProvider + DashboardLayout + ErrorBoundary
│   ├── index.css                   # @import tailwindcss + tweaks (focus-visible, font)
│   ├── components/
│   │   ├── DashboardLayout.tsx     # header adaptativo + nav + footer
│   │   ├── ErrorBoundary.tsx       # last-resort para crash de render
│   │   └── RequireAuth.tsx         # gate de rotas autenticadas
│   ├── contexts/AuthContext.tsx    # status / user / login / logout / refresh
│   ├── hooks/
│   │   ├── useAuth.ts              # wrapper de useContext(AuthContext)
│   │   ├── useDebouncedValue.ts    # debounce genérico
│   │   └── useMessages.ts          # useMessageList + useMessageDetail (com AbortController)
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── MessagesListPage.tsx    # busca debounced + paginação + URL sync
│   │   ├── MessageDetailPage.tsx
│   │   ├── AccountPage.tsx         # self-service password change
│   │   └── UsersPage.tsx           # criar admin
│   ├── services/
│   │   ├── api.ts                  # axios instance + interceptors (CSRF, silent refresh) + toFailure
│   │   └── authApi.ts              # login/logout/me/createUser/changePassword/forgot/reset
│   ├── types/                      # auth.ts, contact.ts
│   └── utils/time.ts               # relativeTime, formatDateTime, preview
├── tests/
│   ├── setup.ts                    # jest-dom + cleanup
│   ├── LoginPage.test.tsx
│   └── RequireAuth.test.tsx
├── public/                         # estáticos não-versionados pelo Vite
├── nginx.conf                      # config nginx para o container de runtime
├── Dockerfile                      # builder Vite + runtime nginx:1.27-alpine
├── index.html                      # entrypoint Vite
├── vite.config.ts                  # plugins + dev proxy
└── vitest.config.ts                # jsdom + setupFiles
```

---

## Rodando os testes

```bash
npm test
```

- Suite roda em **jsdom**. `@testing-library/jest-dom` adiciona matchers ao `expect`.
- `cleanup()` é chamado em `afterEach` (em `tests/setup.ts`) — sem leak de DOM entre testes.
- Não há provider HTTP real — testes mockam `AuthContext` ou stubam `login` para isolar componentes.
- Cobertura atual: 2 arquivos, 6 testes (LoginPage, RequireAuth).

Áreas com gaps de cobertura (anotadas em `.claude/FRONTEND_BUSINESS_RULES.md` §14):
- `MessagesListPage` (debounce + URL sync + pagination)
- `MessageDetailPage` (branches)
- `AccountPage` / `UsersPage` / `ResetPasswordPage` / `ForgotPasswordPage`
- Interceptors do axios (silent refresh, CSRF header)

---

## Decisões de design (resumo)

> Detalhes completos em `.claude/FRONTEND_BUSINESS_RULES.md`.

- **Sessão via cookies HttpOnly** geridos pelo backend — SPA nunca toca tokens diretamente. O único cookie que JS lê é `rf_csrf` (não-HttpOnly por design, para ser espelhado em header).
- **`AuthContext`** descobre sessão em mount (`GET /api/auth/me`) e mantém status `loading | authenticated | anonymous`. Listener de `onUnauthorized` (disparado pelo interceptor) propaga logout sem espalhar lógica.
- **Interceptor axios** faz silent refresh em 401 — uma única vez por request, com promise compartilhada para concorrência.
- **CSRF**: interceptor de request copia o cookie `rf_csrf` para o header `X-CSRF-Token` em todo método não-GET.
- **Anti-enumeração**: `LoginPage` e `ForgotPasswordPage` mostram mensagens genéricas, sem diferenciar email existente/inexistente.
- **URL state**: `q` e `page` em `MessagesListPage` ficam na URL (`useSearchParams`) — listagem é bookmarkable e o filtro sobrevive a refresh.
- **Debounce 300ms** no search input via `useDebouncedValue`.
- **AbortController** em todo fetch — sem race condition entre buscas concorrentes.
- **`isSafeNext(next)`** valida `?next=` para impedir open-redirect via `//evil.com`.
- **`clamp(value, 10_000)`** trunca strings vindas do servidor (defesa contra payload bizarro).
- **`ErrorBoundary`** global captura crash de render. Listener `unhandledrejection` em `main.tsx` é o ponto futuro de plug para Sentry.
- **A11y**: `<label htmlFor>` + `aria-invalid` + `aria-describedby` + `role="alert"`/`status` + `aria-live` em pontos chave. Auto-focus no email do login.

---

## Build de produção

```bash
# 1) build local (saída em frontend/dist)
npm run build
npm run preview                    # smoke local

# 2) imagem de container
docker build \
  --build-arg VITE_API_BASE_URL="" \
  -t receive-forms-app:1.0.0 ./frontend
```

A imagem é multi-stage: stage 1 (`node:20-alpine`) builda o bundle com Vite → stage 2 (`nginx:1.27-alpine`) serve em port **8080** como usuário `nginx` (UID 101). O `nginx.conf` aplica:

- Restringe métodos HTTP (apenas GET/HEAD/OPTIONS).
- `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- **CSP estrita**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; …`
  - `unsafe-inline` em style-src é necessário pelo Tailwind v4 (`<style>` runtime).
- Cache imutável em `/assets/` (1 ano). `no-cache` no HTML root.
- SPA fallback: `try_files $uri $uri/ /index.html;`
- `/healthz` retorna `200 'ok'` para probes do K8s.

---

## Deploy

Em Kubernetes (manifests em `k8s/` na raiz do repo):
- `frontend.yaml` — Deployment + Service + HPA (1-3 replicas, target 70% CPU).
- O Service é `ClusterIP` na port 80 → containerPort 8080.
- `ingress.yaml` (Traefik) roteia `/` para este Service e `/api` para o backend — mesmo host, mesma origem, sem CORS na hot path.

A SPA usa **paths relativos** por default — basta deixar `VITE_API_BASE_URL=""` no build, e o nginx + Traefik fazem o roteamento.

---

## Pull requests

- Cada PR que toca rotas, AuthContext ou interceptors **deve** atualizar `.claude/FRONTEND_BUSINESS_RULES.md` na mesma branch.
- `npm run lint` + `npm run build` + `npm test` precisam passar.
- Componentes novos: respeite o padrão de a11y (`<label htmlFor>`, `aria-*`, focus-visible). Nunca injete HTML cru — sempre passe pelo escape automático do React.
- Estado de URL: prefira `useSearchParams` com `setSearchParams(prev => …, { replace: true })` para não poluir history.

---
