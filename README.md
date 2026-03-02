# prototipo-monitoramento-mm

Repositorio unico com frontend (Vite + Vue) e backend proxy (Node/Express).

## Estrutura

- `frontend/`: app Vue publicada no GitHub Pages
- `proxy/`: proxy SOAP para deploy no Render

## Rodar localmente

Terminal 1 (proxy):

```bash
cd proxy
npm i
npm start
```

Configure as variaveis de ambiente no proxy (ex.: copiando `proxy/.env.example` para `.env` no seu ambiente).

Terminal 2 (frontend):

```bash
cd frontend
npm i
npm run dev
```

Configure `frontend/.env` com base em `frontend/.env.example` (`VITE_PROXY_URL` e `VITE_GOOGLE_MAPS_API_KEY`).

## Publicacao

Frontend (GitHub Pages):

- Workflow: `.github/workflows/pages.yml`
- Secrets no repositorio GitHub: `VITE_PROXY_URL` (URL publica do proxy) e `VITE_GOOGLE_MAPS_API_KEY`
- O build publica `frontend/dist`

Proxy (Render):

- Root Directory: `proxy`
- Build Command: `npm install`
- Start Command: `npm start`
- Variaveis de ambiente obrigatorias:
  - `ALLOWED_ORIGIN` (ex.: URL do GitHub Pages)
  - `MAPAS_USER`
  - `MAPAS_PASS`
  - `SOAP_URL`

## Seguranca

- O frontend nao carrega segredos.
- Credenciais (`MAPAS_USER`, `MAPAS_PASS`) existem somente no backend.
- O proxy aplica `helmet`, CORS restrito por `ALLOWED_ORIGIN`, validacao de `Origin` e rate limit de 60 req/min por IP.
