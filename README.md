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

Coleções: `users`, `visits`, `visitors`, `visitVisitors`, `activities`, `tasks`, `financeItems`.

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

## Firebase

Projeto: `borderless-e4a6a`

```bash
npm install -g firebase-tools
firebase login
firebase use borderless-e4a6a
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
npm run build
firebase deploy --only hosting
# ou tudo do Firestore:
firebase deploy --only firestore
```

## Admin (Custom Claims)

As regras usam `request.auth.token.admin == true` como fonte de verdade. O campo `users.role` é espelho informativo e **não** pode ser elevado pelo próprio usuário.

Exemplo com Admin SDK (Node):

```js
await admin.auth().setCustomUserClaims(uid, { admin: true })
await admin.firestore().doc(`users/${uid}`).update({ role: 'admin' })
```

Depois o usuário precisa renovar o token (logout/login ou `getIdToken(true)`).

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

## Ciclo de medição

O Dashboard considera o ciclo do dia **20** até o dia **19** do mês seguinte.
