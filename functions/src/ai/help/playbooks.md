# Playbooks

Rota: `/configuracoes/playbooks`

## O que é
Um playbook é um modelo reutilizável de tarefas, atividades e documentos (fases: preparação, durante, encerramento) aplicado a uma visita.

## Como criar
1. Vá em **Configurações** → Playbooks (ou `/configuracoes/playbooks`).
2. Crie um playbook com nome, tipo de visita e itens.
3. Cada item tem kind: task, activity ou document; fase; offset de dias em relação ao início da visita.

## Como aplicar a uma visita
No detalhe da visita (ou fluxo de planejamento), escolha aplicar o playbook informando a data de início. O sistema gera tarefas, atividades e placeholders de documentos conforme os itens.
