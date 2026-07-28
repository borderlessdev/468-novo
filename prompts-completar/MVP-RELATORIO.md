# Relatório de fechamento MVP — Promover Experience

Gerado em: jul/2026 (prompt 11)

## O que está pronto

O MVP operacional integrado está implementado no código:

- **Auth e perfis:** login, registro, reset de senha; roles `user`, `team`, `client` + claim `admin`.
- **Visitas:** CRUD, detalhe, status, progresso, equipe/clientes por UID.
- **Agenda:** CRUD de atividades com detecção básica de conflito de horário.
- **CRM:** visitantes com histórico simples e vínculo à visita.
- **Tarefas:** Kanban com drag-and-drop, responsável, edit/delete.
- **Financeiro:** planilha NF/orçamentos + comprovante anexo.
- **Documentos:** upload/list/delete por visita (Storage no código).
- **Dashboard:** KPIs do ciclo 20→19, próximas visitas com link, tarefas pendentes.
- **Relatórios:** exports CSV/PDF.
- **E-mail de resumo:** mailto (padrão) ou fila Firestore (`VITE_EMAIL_MODE=firestore`) compatível com extensão Trigger Email.
- **Mobile:** cards em Visitas/Visitantes, Kanban com scroll horizontal, CTAs empilhados no detalhe.
- **Deploy:** scripts `deploy:rules`, `deploy:hosting`, `deploy:all`; README com checklist de aceite.
- **Seeds:** `seed:accounts` (operador/equipe/cliente) + `set-admin-claim.mjs`.

`npm run build` passa.

## Gaps restantes (prioridade)

### P0 — bloqueia uso real (depende de acesso externo)

| Item | Status | Ação necessária |
|------|--------|-----------------|
| Deploy Firestore rules + indexes | Pendente | `npm run deploy:rules` com `firebase login` |
| Firebase Storage habilitado + rules | Pendente | Habilitar no Console + deploy storage |
| Contas de teste com roles | Script pronto | `npm run seed:accounts` + setar admin claim |
| Deploy Hosting | Pendente | `npm run deploy:hosting` |

### P1 — importante, não bloqueia demo local

| Item | Status | Ação necessária |
|------|--------|-----------------|
| Envio real de e-mail | Infra pronta | Instalar Trigger Email + SMTP/SendGrid + `VITE_EMAIL_MODE=firestore` |
| QA mobile formal | Ajustes feitos | Homologação manual no checklist do README |
| Homologação ponta a ponta | Pendente | Cliente roda checklist com dados reais |

### P2 — Robusta (fora do MVP)

- Convite de usuários por e-mail
- Templates/duplicar visita
- Calendário visual + drag-and-drop na agenda
- Brindes no CRM
- Log completo de envios de e-mail
- Suite e2e / CI

## Dependências externas

1. **Firebase Console** (`borderless-e4a6a`): Owner/Editor para Storage, deploy e extensões.
2. **Service Account JSON:** admin claim e scripts Admin SDK (não commitar).
3. **Provedor de e-mail:** SMTP ou SendGrid via extensão Trigger Email.
4. **Domínio/DNS:** opcional para Hosting customizado.

## Próximos passos recomendados

1. Rodar `npm run seed:accounts` e promover um UID a admin.
2. Executar `npm run deploy:rules` e habilitar Storage no Console.
3. Homologar fluxo completo no celular (375px) com as três contas.
4. (Opcional) Configurar Trigger Email e testar resumo automático.
5. `npm run deploy:hosting` para URL pública de homologação.

## Checklist do cliente

- [ ] Homologação com dados reais de teste
- [ ] Admin claim setado
- [ ] Deploy hosting
- [ ] Treinamento rápido / handoff
