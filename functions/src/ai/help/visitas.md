# Experiências (visitas e eventos)

Rotas: `/visitas`, `/visitas/:id`, Dashboard (`/`) e Operações.

O menu chama **Experiências**. Cada item tem um **tipo de experiência**: Visita VIP, Comunidade Prioritária, Visita Comunidade ou Evento (interno/externo).

## Abas da lista
- **Visitas:** VIP e comunidades (não inclui Evento).
- **Eventos:** só tipo Evento.
- **Período:** todos os tipos que **cruzam** o intervalo de datas (não precisa começar e terminar dentro).
  - Datas padrão = ciclo atual (dia 20 ao 19 do mês seguinte), o mesmo do Dashboard.
  - Botão **Ciclo atual** recoloca essas datas.
  - URL: `/visitas?tab=periodo&de=AAAA-MM-DD&ate=AAAA-MM-DD`.

## Como ver todas as experiências de um período
1. Menu **Experiências**.
2. Aba **Período**.
3. Ajuste **Período de** / **Período até**, ou use **Ciclo atual**.
No Dashboard, **Ver todos** abre essa aba com as datas do ciclo. Clicar num KPI (ex.: Experiências do ciclo) filtra o painel da direita.

## Criar uma experiência
1. **Nova experiência** (ou o diálogo no topo).
2. Informe título, tipo de experiência, datas e demais campos.
3. Salve. Aparece em Experiências e no Dashboard se cruzar o ciclo.

## Detalhe
Em `/visitas/:id`: dados, visitantes, tarefas, documentos (incluindo arquivo da programação importada), financeiro, portal do visitante, resumo por e-mail e logs.

## Status
planejamento → em_andamento → concluida (ou cancelada).

## Clonar / lixeira
Itens excluídos vão para a lixeira em Configurações.
