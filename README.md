# EstudoMentor AI

Extensão Chrome para resolver questões usando Gemini e/ou Groq com as chaves de API do próprio usuário.

## Como usar agora

1. Abra `chrome://extensions`.
2. Ative o modo desenvolvedor.
3. Carregue esta pasta como extensão sem compactação.
4. Abra o popup da extensão.
5. Cole a chave do Gemini e/ou da Groq.
6. Clique em `Salvar chaves`.
7. Se quiser, use `Testar Gemini` e `Testar Groq`.
8. Em qualquer página, selecione a questão, clique com o botão direito e escolha `EstudoMentor AI`.

## Comportamento

- Gemini é usado primeiro quando estiver configurado.
- Se Gemini falhar e Groq estiver configurada, a extensão tenta Groq.
- A resposta continua obedecendo a regra principal: apenas a resposta final, sem explicação.
- O painel é injetado apenas quando o usuário usa a extensão.

## Compra e validação

A validação de compra/plano será feita depois, em um site ou servidor separado. Por enquanto, o programa está focado em funcionar bem com as APIs informadas pelo usuário.
