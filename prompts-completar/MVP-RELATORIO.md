# Relatório de fechamento MVP — Promover Experience

Gerado em: jul/2026 (prompt 11)  
Atualizado em: jul/2026 (avaliação vs escopo MVP/Robusta)

---

## Resumo executivo

| Dimensão | Situação |
|----------|----------|
| **Código do MVP** | **100%** — gaps P1 de código fechados (rotas, CRM, storage, visitantes compartilhados) |
| **MVP operacional (uso real)** | ~**70–80%** — bloqueado por deploy Firebase, Storage, seeds e homologação |
| **Versão Robusta** | ~**85–90%** no código — itens P2 principais entregues; SMTP/deploy/calendário mensal fora |
| **Estimativa restante** | MVP ops: **~1–3 dias úteis** (deploy + QA). Robusta completa: **+7–10 dias** além do MVP |

O projeto **não parte do zero**. O código do MVP está fechado. O que falta agora é **colocar em produção, validar ponta a ponta e configurar infra externa**.

### Comparativo com estimativas originais

| Versão | Estimativa original | Código hoje | Falta p/ operacional |
|--------|---------------------|-------------|----------------------|
| **MVP** | 14 dias úteis | ~11–12 dias feitos | ~3–5 dias (deploy + QA + fixes) |
| **Robusta** | 21 dias úteis | ~5–7 dias feitos* | ~14–16 dias (se quiser tudo) |

\* Alguns itens Robusta foram antecipados: Kanban de tarefas, exports CSV/PDF, categorias de documento, histórico simples de visitante.

---

## O que está pronto (código)

- **Auth e perfis:** login, registro, reset de senha; roles `user`, `team`, `client` + claim `admin`.
- **Visitas:** CRUD, detalhe, status, progresso, equipe/clientes por UID, checklist inicial.
- **Agenda:** CRUD de atividades com detecção básica de conflito de horário.
- **CRM:** visitantes com histórico simples e vínculo à visita.
- **Tarefas:** Kanban com drag-and-drop, responsável (texto), edit/delete.
- **Financeiro:** planilha NF/orçamentos + comprovante anexo (modelo opção A).
- **Documentos:** upload/list/delete por visita (Storage no código).
- **Dashboard:** KPIs do ciclo 20→19, próximas visitas com link, tarefas pendentes.
- **Relatórios:** exports CSV/PDF (item previsto só na Robusta, já antecipado).
- **E-mail de resumo:** mailto (padrão) ou fila Firestore (`VITE_EMAIL_MODE=firestore`).
- **Mobile:** cards em Visitas/Visitantes/Financeiro, Kanban com scroll horizontal, CTAs empilhados no detalhe.
- **Deploy:** scripts `deploy:rules`, `deploy:hosting`, `deploy:all`; README com checklist de aceite.
- **Seeds:** `seed:accounts` + `set-user-role.mjs` para team/client/admin.
- **Docs:** `SETUP-EXTERNO.md` com passo a passo operacional.

`npm run build` passa. Sem dados mockados no `src/`.

---

## Avaliação por módulo (vs escopo)

### 1. Revisão geral, backend e estrutura — MVP ~85% | Robusta ~70%

| Item | Status |
|------|--------|
| Stack React + Firebase, coleções, indexes, rules no repo | ✅ |
| Remoção de mocks | ✅ |
| Deploy rules/indexes/storage | ❌ Pendente (externo) |
| Storage rules alinhadas à visita | ⚠️ Fracas — qualquer autenticado lê/escreve em `visits/*` |
| Queries por `ownerId` vs visita compartilhada | ⚠️ Equipe não vê financeiro/documentos criados pelo operador |

### 2. Auth, usuários e permissões — MVP ~80% | Robusta ~30%

| Item | Status |
|------|--------|
| Login, cadastro, reset, perfis, cliente vê visitas autorizadas | ✅ |
| Bloqueio de escrita para cliente (`canWrite`) | ✅ na maioria das telas |
| Bloqueio de rotas para cliente | ⚠️ Só no menu; URL direta ainda abre `/financeiro`, `/visitantes`, `/relatorios` |
| `VisitorsPage` sem `canWrite` | ⚠️ Cliente pode mutar CRM se acessar a rota |
| Vínculo equipe/cliente por UID manual | ⚠️ Funciona, UX ruim |
| Convite por e-mail, logs de atividade | ❌ Robusta |

### 3. Visitas e fluxo principal — MVP ~90% | Robusta ~40%

| Item | Status |
|------|--------|
| CRUD, status, progresso, local, datas, objetivo, detalhe integrado | ✅ |
| Campo idioma da visita | ❌ (só em visitante) |
| Histórico de alterações da visita | ❌ |
| Duplicar visita / templates | ❌ Robusta |

### 4. Agenda — MVP ~95% | Robusta ~20%

| Item | Status |
|------|--------|
| Timeline, CRUD, conflito de horário, mobile | ✅ |
| Calendário visual, drag-and-drop, alertas | ❌ Robusta |

### 5. Visitantes e CRM — MVP ~95% | Robusta ~50%

| Item | Status |
|------|--------|
| Cadastro completo, busca, vínculo, cards mobile | ✅ |
| Histórico de visitas ao editar | ✅ parcial |
| Brindes, busca inteligente | ❌ Robusta |

### 6. Tarefas — MVP ~100% | Robusta ~60%

| Item | Status |
|------|--------|
| CRUD, prazo, filtros, progresso da visita, mobile | ✅ |
| Kanban interativo | ✅ **antecipado da Robusta** |
| Responsável = nome livre (não usuário do sistema) | ⚠️ |
| Dependências, notificações, histórico | ❌ Robusta |

### 7. Financeiro — MVP ~80% | Robusta ~45%

Modelo implementado: **orçamentos/NF + comprovante** (opção A), não “despesa + categoria + data” genérica do escopo.

| Item | Status |
|------|--------|
| Registro por visita, valor, comprovante, totais, CRUD | ✅ |
| Equipe vê financeiro da visita compartilhada | ⚠️ Query `ownerId` limita |
| Categorias custom, relatórios por estado | ✅ parcial (exports em Relatórios) |

### 8. Documentos — MVP ~85% | Robusta ~55%

| Item | Status |
|------|--------|
| Upload/download/delete, categorias | ✅ |
| Storage habilitado + deploy | ❌ Pendente |
| Versionamento, visualização online | ❌ Robusta |

### 9. Dashboard, relatórios e e-mails — MVP ~85% | Robusta ~55%

| Item | Status |
|------|--------|
| KPIs, resumo manual, mailto + fila Firestore | ✅ |
| Envio automático real | ❌ Trigger Email + SMTP |
| Gráficos, templates, log de envios | ❌ Robusta |

### 10. Mobile, QA e deploy — MVP ~55% | Robusta ~25%

| Item | Status |
|------|--------|
| Responsivo no código, scripts deploy, checklist README | ✅ |
| QA formal 3 perfis, deploy hosting, handoff | ❌ Pendente |
| e2e / CI, performance | ❌ Robusta |

---

## Gaps restantes (prioridade)

### P0 — bloqueia uso real (~1,5–2 dias; depende de acesso externo)

| Item | Status | Ação necessária |
|------|--------|-----------------|
| Deploy Firestore rules + indexes | Pendente | `npm run deploy:rules` com `firebase login` |
| Firebase Storage habilitado + rules | Pendente | Habilitar no Console + deploy storage |
| Contas de teste com roles | Parcial | `npm run seed:accounts` + `set-user-role.mjs` |
| Deploy Hosting | Pendente | `npm run deploy:hosting` |
| UIDs equipe/cliente nas visitas de teste | Pendente | Detalhe da visita → campos Equipe/Clientes |

### P1 — importante para qualidade MVP (~1,5–2,5 dias)

| Item | Status | Ação necessária |
|------|--------|-----------------|
| Homologação ponta a ponta (3 perfis + mobile 375px) | Pendente (ops) | Checklist no README e seção 7 do SETUP-EXTERNO.md |
| Bloqueio de rotas para cliente | ✅ Feito | `ProtectedRoute` + `isNavAllowed` (lixeira bloqueada para cliente) |
| `canWrite` em VisitorsPage | ✅ Feito | Create/edit/delete condicionados a `canWrite` |
| Financeiro/documentos em visita compartilhada | ✅ Feito | Query `visitId` + fallback com `visit.ownerId` |
| Visitantes em visita compartilhada | ✅ Feito | `get` por ID + `getVisitorsByIds` no detalhe |
| Storage rules mais restritivas | ✅ Feito | Membership da visita (read team/client; write owner/team/admin) |
| Envio real de e-mail | Infra pronta | Trigger Email + SMTP + `VITE_EMAIL_MODE=firestore` |

### P2 — Robusta (código entregue)

- [x] Convite automático de usuários por e-mail (`invites` + mail/mailto)
- [x] Duplicar visita / templates (`isTemplate`)
- [x] Calendário semanal + drag-and-drop na agenda + alertas `activity_soon`
- [x] Brindes no CRM
- [x] Histórico de alterações (`activityLogs`)
- [x] Permissões granulares por módulo (`modulePermissions`)
- [x] Log de envios de e-mail (`emailLogs`)
- [x] Campo idioma na visita
- [x] Responsável de tarefa = usuário (`assigneeId`)
- [x] Testes e2e smoke (Playwright) + CI GitHub Actions

Fora do código / futuro: SMTP real, calendário mensal, dependências de tarefa, push FCM.

---

## Riscos técnicos identificados

1. **Deploy não executado** — app funciona local, não em ambiente real.
2. **Visitor `get` aberto a autenticados** — trade-off MVP; list continua restrito a dono/admin; IDs vêm de `visitVisitors`.
3. **Modelo financeiro** difere do escopo genérico (aceitável se for o modelo real da operação).
4. **Sem testes automatizados** — QA 100% manual.

---

## Dependências externas

1. **Firebase Console** (`borderless-e4a6a`): Owner/Editor para Storage, deploy e extensões.
2. **Service Account JSON:** admin claim e scripts Admin SDK (não commitar).
3. **Provedor de e-mail:** SMTP ou SendGrid via extensão Trigger Email.
4. **Domínio/DNS:** opcional para Hosting customizado.

---

## Próximos passos recomendados

1. Rodar `npm run seed:accounts` e promover UIDs (admin, team, client).
2. Executar `npm run deploy:rules` e habilitar Storage no Console.
3. Vincular UIDs de equipe/cliente em visitas de teste.
4. Homologar fluxo completo no celular (375px) com as três contas — ver `SETUP-EXTERNO.md` §7.
5. (Opcional) Configurar Trigger Email e testar resumo automático.
6. `npm run deploy:hosting` para URL pública de homologação.

---

## Checklist do cliente

- [ ] Homologação com dados reais de teste (operador, equipe, cliente, admin)
- [ ] Admin claim setado
- [ ] Deploy rules + Storage habilitado
- [ ] Deploy hosting
- [ ] Fluxo mobile 375px validado
- [ ] Treinamento rápido / handoff
