# Promover Experience

Aplicação web de gestão de visitas corporativas (React + Vite + TypeScript + Firebase).

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS 4 + componentes estilo shadcn/ui (Radix)
- Firebase Authentication + Cloud Firestore + Analytics (browser)
- React Hook Form + Zod
- dnd-kit (Kanban)
- Sonner (toasts)
- jsPDF (exportação PDF)

## Modelo de dados

Dados operacionais são **por dono** (`ownerId`). Usuário comum só acessa os próprios documentos. Administradores (Custom Claim `admin: true`) acessam tudo.

Coleções: `users`, `visits`, `visitors`, `visitVisitors`, `activities`, `tasks`, `financeItems`, `documents`.

Arquivos de visita ficam no Firebase Storage (`visits/{visitId}/...`).

## Instalação

```bash
npm install
cp .env.example .env
npm run dev
```

Abra `http://localhost:5173`.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | Lint |
| `npm run seed:user` | Cria conta demo única (`demo@promover.experience`) |
| `npm run seed:accounts` | Cria operador, equipe e cliente de teste |
| `npm run deploy:rules` | Deploy Firestore rules, indexes e Storage rules |
| `npm run deploy:hosting` | Build + deploy Hosting |
| `npm run deploy:all` | Build + deploy completo |

## Firebase

Projeto: `borderless-e4a6a`

```bash
npm install -g firebase-tools
firebase login
firebase use borderless-e4a6a
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
npm run build
firebase deploy --only hosting
# ou tudo do Firestore:
firebase deploy --only firestore
```

## Admin (Custom Claims)

As regras usam `request.auth.token.admin == true` como fonte de verdade. O campo `users.role` espelha o perfil operacional e **não** pode ser elevado pelo próprio usuário no cadastro.

Perfis (`users.role`):
- `user` — operador/dono das visitas (padrão)
- `team` — equipe convidada via `teamMemberIds` na visita
- `client` — cliente com leitura das visitas em `clientUserIds`

Para promover perfil ou admin (Admin SDK):

```js
await admin.auth().setCustomUserClaims(uid, { admin: true })
await admin.firestore().doc(`users/${uid}`).update({ role: 'admin' })
// ou role: 'team' | 'client'
```

Na visita, informe UIDs em **Equipe** e **Clientes** (tela de detalhe) para liberar acesso.

Depois o usuário precisa renovar o token (logout/login ou `getIdToken(true)`).

Script com Admin SDK (requer `service-account.json` na raiz ou `GOOGLE_APPLICATION_CREDENTIALS`):

```bash
npm install
node scripts/set-user-role.mjs <uid> admin
node scripts/set-user-role.mjs <uid> team
node scripts/set-user-role.mjs <uid> client
```

Ou use o atalho legado: `node scripts/set-admin-claim.mjs <uid>`

## Contas de teste

```bash
npm run seed:accounts
```

Gera `credenciais.md` com operador (`user`), equipe (`team`) e cliente (`client`). Para admin, use o script acima no UID desejado.

## E-mail de resumo da visita

Por padrão (`VITE_EMAIL_MODE=mailto`), o botão abre o cliente de e-mail local.

Para envio automático:

1. Instale a extensão [Trigger Email](https://extensions.dev/extensions/firebase/firestore-send-email) no Firebase Console.
2. Configure SMTP/SendGrid na extensão.
3. Defina `VITE_EMAIL_MODE=firestore` no `.env`.
4. Faça deploy das rules: `npm run deploy:rules`.

O app enfileira documentos em `mail/{id}`; a extensão envia e atualiza o status.

## Como testar

1. Cadastre um usuário e confirme o documento em `users/{uid}`.
2. Faça login, logout e recuperação de senha.
3. Acesse uma rota privada sem sessão e confirme o redirecionamento para `/login`.
4. Crie uma visita com checklist básico e verifique tarefas no Planejamento.
5. Cadastre/associe visitantes e confira o CRM.
6. Crie atividades na Agenda para a visita selecionada.
7. Arraste tarefas entre colunas do Kanban.
8. Adicione linhas no Financeiro e confira o total.
9. Exporte CSV/PDF em Relatórios.
10. Com um segundo usuário, confirme isolamento por `ownerId`. Com admin (claim), confirme visão global.
11. Abra uma visita pelo link na listagem; edite dados, vincule visitantes e faça upload de documento (Storage habilitado).
12. Edite atividades, tarefas e linhas financeiras; confira progresso da visita após concluir tarefas.
13. Envie resumo por e-mail (mailto ou fila Firestore, conforme `VITE_EMAIL_MODE`).
14. **Mobile (~375px):** login → visitas (cards) → detalhe → agenda → planejamento (scroll horizontal) → financeiro → CRM.

### Checklist de aceite (homologação)

- [ ] Login com operador, equipe e cliente (contas seed)
- [ ] Admin claim setado e visão global confirmada
- [ ] Fluxo completo: visita → visitante → agenda → tarefa → despesa/doc → resumo
- [ ] Fluxo ok no celular (375px)
- [ ] `npm run deploy:rules` e `npm run deploy:hosting` executados (requer `firebase login`)
- [ ] Storage habilitado no Console + upload de documento funcional
- [ ] (Opcional) Trigger Email configurado + resumo chega na caixa de teste

## Ciclo de medição

O Dashboard considera o ciclo do dia **20** até o dia **19** do mês seguinte.
