PAINEL PEDAGÓGICO — IDEALIZA
============================

Arquivos:
- index.html   → estrutura (HTML)
- style.css    → visual (CSS)
- script.js    → lógica (JavaScript)
- logo.png     → logotipo da Idealiza

Basta abrir o index.html em qualquer navegador com internet. O painel usa
Supabase Auth para login e PostgreSQL para compartilhar os dados entre usuários.

LOGIN:
- Use seu e-mail e senha do Supabase.
- A primeira conta criada recebe automaticamente o perfil Administrador.
- Não existem senhas gravadas no código público.

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
- As alterações são salvas no PostgreSQL do Supabase ao usar Salvar, Adicionar aluno,
  Configurações ou Editar aluno.
- O localStorage permanece apenas como cópia de segurança local.
- O cadastro de usuários administradores usa uma Edge Function protegida e nunca expõe
  a chave de serviço no navegador.
