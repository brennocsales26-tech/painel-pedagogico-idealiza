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
- Não existem senhas gravadas no código público.
- Não existe cadastro público na tela de login.
- Novos usuários devem ser criados exclusivamente por um administrador, pelo menu
  "Gerenciar usuários". A criação usa a Edge Function protegida
  "admin-create-user".

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
- Se a consulta autenticada ao Supabase não puder ler a tabela de alunos por causa de
  RLS/permissões, o painel preserva os dados locais e não tenta inserir os 119 alunos
  novamente; nesse caso, a mensagem de salvamento informa que o banco não confirmou
  o acesso.
- A Edge Function protegida nunca expõe a chave de serviço no navegador.

BANCO E SEGURANÇA:
- A tabela `students` deve permitir leitura e gravação para usuários autenticados,
  conforme as políticas RLS do projeto Supabase.
- A tabela `profiles` deve permitir que o usuário autenticado leia seu próprio perfil
  e que a Edge Function administre a criação de novos perfis.
- Para impedir cadastro direto pela API Auth, desative "Allow new users to sign up"
  nas configurações de autenticação do projeto Supabase. A interface do painel já
  não oferece cadastro público.
