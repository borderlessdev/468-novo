# Papéis e permissões (whitelabel / equipe)

Use este guia para saber o que cada tipo de usuário pode fazer no app.

## Admin Master (plataforma)
- Acessa **Pastas de clientes** (`/empresas`).
- Cria pastas, define limite de acessos, cria/convidar **Admin da empresa**.
- Pode definir **Whitelabel** (logo) de qualquer pasta.
- Entra no sistema de qualquer pasta com “Entrar no sistema do cliente”.

## Admin da empresa (org_admin)
- Gerencia a própria pasta (dono da empresa).
- Convida funcionários em **Usuários** (`/usuarios`) com um **cargo** do organograma; remove/exclui funcionários.
- **Altera o cargo** dos funcionários (e o próprio). Não altera o tipo de conta de outro admin da empresa — isso é do Master.
- Define **Whitelabel** (logo) da própria empresa em Configurações — funcionários herdam automaticamente.
- Opera visitas, portal, financeiro, relatórios e playbooks da pasta.
- Também cria convites de cliente na visita e convites de portal/convidados.

## Cargo (organograma)
- Metadado do funcionário (CEO, Gestão de Eventos, Criativos, Coordenadora, ADM, NACT, FINAN, Analista + região, etc.).
- **Não muda permissões** de módulo. Serve para identificação no organograma.
- Definido no convite e alterável depois só pelo Admin da empresa (ou Master).

## Usuário operacional (user)
- Cria e gerencia visitas (escrita operacional).
- Pode criar/editar convites de cliente na visita e convites de portal.
- Não convida funcionários nem altera cargo/whitelabel; não exclui membros.
- Se perguntar como convidar funcionário, mudar cargo ou logo: orientar a pedir ao **Admin da empresa**.

## Equipe / funcionário (team)
- Opera o dia a dia conforme permissões de módulos (visitas, criação/edição de convites de visita/evento e de cliente).
- Não aprova financeiro; não gerencia usuários; não altera cargo de outros; não altera whitelabel; não cria pastas; não exclui funcionários.
- Se perguntar como fazer algo exclusivo de Admin/Master: responder que só o Admin da empresa ou Admin Master pode fazer aquilo.

## Cliente (client)
- Menu restrito: Dashboard, Visitas, Programação/Agenda, Assistente, Configurações (preferências).
- Sem escrita operacional (não cria visitas, não gera link do portal, não edita financeiro).
- Se perguntar como cadastrar visita/portal/logo: explicar que é papel da equipe Promover / Admin da empresa.

## Whitelabel (logo da empresa)
- **Admin da empresa:** Configurações → **Whitelabel da empresa** → **Enviar logo**.
- **Admin Master:** Pastas de clientes → **Abrir pasta** → **Whitelabel** → **Enviar logo**.
- Formatos: JPG, PNG, WebP ou GIF. **Remover** volta à marca Vale.
- A logo aparece no menu, no header e no portal do visitante.
- Funcionários e clientes **herdam** a logo; não há tela para eles alterarem.
