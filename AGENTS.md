# Checkpoints obrigatorios

- Antes de qualquer alteracao de codigo, layout, configuracao ou documentacao neste diretorio, execute `git status --short`.
- Se houver alteracoes anteriores ainda sem commit, crie primeiro um commit de checkpoint com a mensagem `checkpoint: antes de <resumo da nova tarefa>`.
- Se a arvore estiver limpa, o commit atual (`HEAD`) ja e o checkpoint anterior a nova tarefa.
- Depois da implementacao, mantenha a alteracao visivel no working tree ate o usuario aprovar; assim ela pode ser comparada e revertida imediatamente.
- Nunca inclua arquivos `.env`, credenciais, dependencias, builds, logs ou copias de backup no historico.
- Para desfazer algo que o usuario nao aprovou, reverta somente os arquivos da tarefa em questao e preserve qualquer outro trabalho existente.
- Nao use `git reset --hard`, limpeza destrutiva ou reescrita de historico.
