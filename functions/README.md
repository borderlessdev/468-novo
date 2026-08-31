# Functions — Google Calendar

Cloud Functions (2ª geração, Node 22 + TypeScript) que fazem o OAuth do Google e
sincronizam as atividades da agenda com o Google Calendar.

## Configuração

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials) do projeto
   `borderless-e4a6a`, crie uma credencial **OAuth client ID** do tipo *Web application*.
2. Habilite a **Google Calendar API** no mesmo projeto.
3. Cadastre os redirect URIs autorizados:
   - produção: `https://us-central1-borderless-e4a6a.cloudfunctions.net/googleCalendarOAuthCallback`
   - emulador: `http://localhost:5001/borderless-e4a6a/us-central1/googleCalendarOAuthCallback`
4. Copie `.env.example` para `.env` e preencha:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_ORIGIN=https://seu-app.web.app
```

`functions/.env` está no `.gitignore` e nunca deve ser commitado. Em produção você
também pode usar o Secret Manager (`firebase functions:secrets:set`) no lugar do `.env`.

Sem `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` o deploy continua funcionando: as callables
respondem `failed-precondition` com mensagem em português e o app não quebra.

## Escopos

- `https://www.googleapis.com/auth/calendar.events` — criar/editar eventos.
- `openid` + `email` — apenas para exibir qual conta Google está conectada.

## Comandos

```
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
```

## Dados no Firestore

| Coleção                | Acesso do cliente | Conteúdo                                                      |
| ---------------------- | ----------------- | ------------------------------------------------------------- |
| `calendarSecrets/{uid}`| negado nas rules  | `refreshToken`, `email`, `provider`, `updatedAt`               |
| `calendarConnections/{uid}` | leitura do dono | `ownerId`, `provider`, `email`, `connected`, `connectedAt`  |
| `calendarOAuthStates/{state}` | negado      | `uid`, `createdAt`, `expiresAt` (state do OAuth, TTL 10 min)   |

O refresh token só existe em `calendarSecrets`, gravado pelo Admin SDK — o cliente nunca
o recebe.

## Funções exportadas

- `googleCalendarOAuthStart` (callable) — devolve `{ url }` de consentimento.
- `googleCalendarOAuthCallback` (HTTPS) — troca o code, salva o token e redireciona para
  `${APP_ORIGIN}/configuracoes?calendar=connected`.
- `getCalendarStatus` (callable) — `{ google, outlook, credentialsConfigured }`.
- `googleCalendarDisconnect` (callable) — revoga o token e apaga a conexão.
- `syncActivityToGoogle` (callable) — cria/atualiza o evento de uma atividade.
- `deleteGoogleEvent` (callable) — apaga o evento e limpa o `googleEventId`.
- `syncVisitActivitiesToGoogle` (callable) — sincroniza todas as atividades de uma visita.
- `outlookCalendarOAuthStart` (callable) — stub: responde "ainda não disponível".
- `askHelpAssistant` (callable) — assistente de ajuda (manual UX); mock sem API key.
- `mapProgrammingImport` (callable) — interpreta planilha de programação via IA.
- `draftCommunication` (callable) — rascunhos de e-mail / briefing / convite do portal.

## Assistente de IA (Claude)

O chat de ajuda, o import de programação e os rascunhos usam **Claude (Anthropic)** por padrão.

### Configuração rápida

1. Crie uma API key em [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Copie o exemplo e cole a chave:

   ```bash
   cp functions/.env.example functions/.env
   ```

3. Edite `functions/.env`:

   ```
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

4. Publique as functions:

   ```bash
   npm --prefix functions run deploy
   ```

Sem `ANTHROPIC_API_KEY`, as callables respondem em **modo mock** (respostas fixas) para desenvolver a UI.

### Variáveis opcionais

| Variável            | Padrão                                      | Descrição                          |
| ------------------- | ------------------------------------------- | ---------------------------------- |
| `ANTHROPIC_MODEL`   | `claude-sonnet-4-20250514`                  | Modelo Claude                      |
| `ANTHROPIC_BASE_URL`| `https://api.anthropic.com/v1/messages`     | Endpoint da API (proxy customizado)|
| `AI_PROVIDER`       | `anthropic`                                 | `anthropic`, `openai` ou `mock`    |

Para usar OpenAI em vez de Claude, veja os comentários em `functions/.env.example`.

O evento é criado no calendário de **quem está logado**. Ao sincronizar uma atividade de
outra pessoa da equipe, o evento aparece na agenda Google de quem disparou o sync.

## Reautenticação

Se o Google devolver `invalid_grant`, a função apaga a conexão e responde
`failed-precondition` com a mensagem `calendar_reauth_required`. O frontend mostra o toast
"Reconecte o Google Calendar" e o card em Configurações volta ao estado desconectado.
