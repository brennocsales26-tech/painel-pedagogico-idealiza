PAINEL PEDAGÓGICO — IDEALIZA
============================

Arquivos:
- index.html   → estrutura (HTML)
- style.css    → visual (CSS)
- script.js    → lógica (JavaScript)
- logo.png     → logotipo da Idealiza

Basta abrir o index.html em qualquer navegador. Os dados dos alunos e
das contas já vêm embutidos no próprio index.html.

LOGIN (pede sempre que fechar/reabrir a página):
- Tarcisio Iure  — senha 1012   (Professor)
- Brenno Sales   — senha 2601   (Administrador)
- Vitor Thadeu   — senha 1902   (Professor)

MENU (área "ÁREA DO USUÁRIO" no topo direito, com nome, função e foto/iniciais):
- Clique no cartão branco com seu nome para abrir o menu.
- + Adicionar aluno
- Gerenciar usuários (só para Administrador — adicionar/remover contas)
- Configurações (trocar nome de usuário, senha e foto; administradores também podem gerenciar usuários)
- Sair

FUNCIONALIDADES:
- Filtros por status: Todos, Adiantados, Em dia, Atrasados, Concluídos,
  Faltantes.
- Atraso automático: se a data de previsão já passou (é anterior ao dia atual)
  e o aluno não está concluído, o status muda sozinho para Atrasado ao abrir
  a página e também enquanto ela permanece aberta.
- Cada aluno tem um botão "✎ Editar" (ou clique no nome) que abre a
  página dele, onde dá para mudar: nome, dia da semana, turma/horário
  (selecionado em uma lista fixa), módulo,
  datas, situação, faltante e observação.
- Nessa mesma página, o botão "Concluir módulo e iniciar outro" arquiva
  o módulo atual no histórico do aluno (com data) e libera os campos
  para lançar o próximo módulo.
- Aluno "Faltante" é um marcador separado do status (checkbox).
- Alunos com status "Concluído" saem da lista principal do dia e só
  aparecem no filtro "Concluídos".

SALVAMENTO:
- As alterações agora ficam salvas automaticamente no armazenamento local do navegador
  ao usar Salvar, Adicionar aluno, Configurações ou Editar aluno.
- O modo hospedado no Claude continua podendo publicar a versão atual quando esse recurso
  estiver disponível.
- Como este é um site estático, os dados ficam no navegador/dispositivo em que foram salvos;
  para uso com vários dispositivos ou usuários simultâneos, será necessário conectar um
  back-end e um banco de dados.
