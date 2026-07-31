# Setup externo — o que falta fora do código

Tudo em `prompts-completar` está implementado **no repositório**. Este guia cobre o que depende de acesso Firebase, SMTP e homologação manual.

> **Não execute deploy** até confirmar acesso ao projeto correto (`borderless-e4a6a`).

**Situação (jul/2026):** código MVP **100%** (gaps P1 fechados); operacional depende de deploy + homologação. Ver `MVP-RELATORIO.md`.

---

## 1. Firebase — login e projeto

```bash
npm install -g firebase-tools
firebase login
firebase use borderless-e4a6a
firebase projects:list   # deve listar borderless-e4a6a
```

Se a conta logada só vê outro projeto (ex.: `borderless-e8b74`), peça convite Owner/Editor em `borderless-e4a6a` ou faça login com a conta certa.

---

## 2. Deploy rules + indexes + storage (P0)

**Antes:** habilitar **Cloud Firestore** e **Storage** no Console do projeto.

```bash
npm run deploy:rules
```

Isso publica:
- `firestore.rules` (inclui coleção `mail` para e-mail e soft delete / lixeira)
- `firestore.indexes.json`
- `storage.rules`

### TTL da lixeira (30 dias)

Itens excluídos recebem o campo `expiresAt`. Para remoção automática após 30 dias, configure **TTL** no Console Firebase:

1. Firestore → **TTL** (ou *Time-to-live*)
2. Crie política para o campo `expiresAt` nas coleções: `visits`, `visitors`, `activities`, `tasks`, `financeItems`, `documents`
3. Sem TTL, a UI da lixeira oculta itens expirados, mas os documentos permanecem no banco até limpeza manual

> **Atenção:** `storage.rules` exigem membership da visita (owner/team/client para leitura; owner/team/admin para escrita). Faça deploy junto com as Firestore rules.

---

## 3. Contas de teste (P0)

```bash
npm run seed:accounts
```

Cria em Auth + Firestore:

| Papel | E-mail | Senha |
|-------|--------|-------|
| Operador | operador@promover.experience | Demo@123456 |
| Equipe | equipe@promover.experience | Demo@123456 |
| Cliente | cliente@promover.experience | Demo@123456 |

Gera `credenciais.md` (gitignored).

### Admin

1. Baixe service account JSON (Console → Project settings → Service accounts).
2. Salve como `service-account.json` na raiz (gitignored).
3. Rode:

```bash
node scripts/set-user-role.mjs <UID> admin
node scripts/set-user-role.mjs <UID_EQUIPE> team
node scripts/set-user-role.mjs <UID_CLIENTE> client
```

4. Logout/login no app para renovar o token.

### Equipe e cliente em visitas

No detalhe da visita (logado como operador), inclua UIDs em **Equipe** e **Clientes**.

---

## 4. E-mail automático — Trigger Email (P1)

1. Console → Extensions → instalar **Trigger Email** (`firestore-send-email`).
2. Configure SMTP ou SendGrid na extensão.
3. Coleção de e-mails: `mail` (padrão compatível com o app).
4. No `.env`:

```env
VITE_EMAIL_MODE=firestore
```

5. `npm run deploy:rules` (se ainda não fez).
6. Teste: detalhe da visita → Enviar resumo.

Sem extensão/SMTP, mantenha `VITE_EMAIL_MODE=mailto` (padrão).

---

## 5. Deploy Hosting (P0 para URL pública)

```bash
npm run deploy:hosting
```

Ou preview local:

```bash
npm run build
npm run preview
```

---

## 6. Homologação manual — fluxo geral

Use o checklist em `README.md` → **Checklist de aceite (homologação)**.

Fluxo mínimo:
1. Login operador → criar visita
2. Visitante → vincular na visita
3. Agenda → atividade
4. Planejamento → tarefa (Kanban no celular)
5. Financeiro → linha + comprovante (Storage habilitado)
6. Documento na visita
7. Resumo por e-mail

Mobile: testar em ~375px (Visitas, Visitantes, Financeiro em cards; Kanban com scroll).

---

## 7. Homologação por perfil (P1)

Validar com as contas seed após deploy e UIDs vinculados na visita.

### Operador (`user`)

- [ ] Criar/editar/excluir visita
- [ ] Vincular visitantes, equipe (UID) e clientes (UID)
- [ ] CRUD agenda, tarefas, financeiro, documentos
- [ ] Enviar resumo por e-mail
- [ ] Dashboard e relatórios com dados coerentes

### Equipe (`team`)

- [ ] Vê visitas em `teamMemberIds`
- [ ] Edita agenda e tarefas
- [ ] **Verificar:** financeiro e documentos criados pelo operador (query por `visitId` + rules deployadas)
- [ ] Não cria visitas nem exclui visita alheia

### Cliente (`client`)

- [ ] Vê apenas visitas em `clientUserIds`
- [ ] Menu restrito (Dashboard, Visitas, Agenda, Configurações — sem Lixeira)
- [ ] **Verificar:** URL `/financeiro`, `/visitantes`, `/planejamento`, `/relatorios`, `/configuracoes/lixeira` redireciona para `/`
- [ ] Não cria/edita dados (`canWrite` false)

### Admin (claim `admin: true`)

- [ ] Visão global de visitas e dados
- [ ] Acesso a todos os módulos

---

## 8. Gaps de código (fechados)

| Gap | Status |
|-----|--------|
| Rotas cliente não bloqueadas | ✅ `ProtectedRoute` + `isNavAllowed` |
| `VisitorsPage` sem `canWrite` | ✅ |
| Financeiro/docs por `ownerId` | ✅ query `visitId` + fallback `visit.ownerId` |
| Visitantes em visita compartilhada | ✅ `get` + `getVisitorsByIds` |
| `storage.rules` permissivas | ✅ membership da visita |

Restante para uso real: deploy + homologação (P0 / checklist §7).

---

## 9. Decisões ainda abertas (cliente)

Ver `REQUISITOS-ACESSOS.txt`:
- Provedor de e-mail definitivo e domínio remetente
- Ambiente de homologação vs produção
- Domínio customizado (DNS)
- Convite de usuários [Robusta — fora do MVP]
- Manter modelo financeiro NF/orçamentos (opção A) vs despesas genéricas

---

## Resumo rápido

| Passo | Comando / ação |
|-------|----------------|
| Projeto Firebase | `firebase use borderless-e4a6a` |
| Rules + Storage | `npm run deploy:rules` |
| Contas teste | `npm run seed:accounts` |
| Roles | `node scripts/set-user-role.mjs <uid> <role>` |
| E-mail API | Trigger Email + `VITE_EMAIL_MODE=firestore` |
| Site público | `npm run deploy:hosting` |
| Aceite | Checklist README + §7 deste guia |
| Avaliação escopo | `MVP-RELATORIO.md` |
