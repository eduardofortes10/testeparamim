const GEMINI_MODEL = "gemini-2.5-flash";

const MODES = {
  explain_code: {
    title: "Responder código",
    loading: "Gerando resposta...",
    heading: "Resposta"
  },
  solve_exercise: {
    title: "Responder questão",
    loading: "Gerando resposta...",
    heading: "Resposta"
  },
  explain_error: {
    title: "Responder erro",
    loading: "Gerando resposta...",
    heading: "Resposta"
  },
  improve_code: {
    title: "Gerar código melhorado",
    loading: "Gerando código...",
    heading: "Resposta"
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "codementor-root",
    title: "CodeMentor AI",
    contexts: ["selection"]
  });

  Object.entries(MODES).forEach(([id, mode]) => {
    chrome.contextMenus.create({
      id,
      parentId: "codementor-root",
      title: mode.title,
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mode = MODES[info.menuItemId];
  if (!mode) return;

  const selection = info.selectionText?.trim();
  if (!selection || !tab?.id) return;

  await enviarParaAba(tab.id, {
    type: "SHOW_LOADING",
    mode: info.menuItemId,
    title: mode.title,
    heading: mode.heading,
    selection,
    message: mode.loading
  });

  try {
    const answer = await gerarResposta(selection, info.menuItemId);

    await enviarParaAba(tab.id, {
      type: "SHOW_RESULT",
      mode: info.menuItemId,
      title: mode.title,
      heading: mode.heading,
      selection,
      answer
    });
  } catch (error) {
    await enviarParaAba(tab.id, {
      type: "SHOW_ERROR",
      mode: info.menuItemId,
      title: mode.title,
      heading: "Erro",
      selection,
      answer: criarMensagemErro(error)
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "RUN_MODE") return false;

  gerarResposta(message.selection, message.mode)
    .then((answer) => sendResponse({ ok: true, answer }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function enviarParaAba(tabId, mensagem) {
  try {
    await chrome.tabs.sendMessage(tabId, mensagem);
  } catch (error) {
    console.warn("Não foi possível mostrar o painel nesta página.", error);
  }
}

async function gerarResposta(selection, mode) {
  const { geminiKey } = await chrome.storage.local.get(["geminiKey"]);

  if (!geminiKey) {
    throw new Error("Chave do Gemini não encontrada.");
  }

  const prompt = criarPrompt(selection, mode);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Erro na API do Gemini");
  }

  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Não consegui gerar uma resposta."
  );
}

function criarMensagemErro(error) {
  if (error.message === "Chave do Gemini não encontrada.") {
    return "Chave do Gemini não encontrada.\n\nClique no ícone da extensão CodeMentor AI e salve sua chave para começar.";
  }

  return `Não foi possível gerar a resposta.\n\n${error.message}`;
}

function criarPrompt(selection, mode) {
  const regraRespostaDireta = `
Você é o CodeMentor AI.
Responda em português do Brasil.

REGRA PRINCIPAL:
- Dê apenas a resposta final.
- Não explique.
- Não mostre passo a passo.
- Não use introduções como "A resposta é".
- Não use comentários desnecessários.
- Se for questão objetiva com alternativas, responda apenas a alternativa correta e, se útil, uma frase curta com o resultado.
- Se o enunciado pedir para criar, escrever, implementar ou completar um programa, responda apenas com o código completo.
- Se o texto selecionado já trouxer uma pergunta e alternativas, use as alternativas para escolher a resposta.
- Se não houver informação suficiente para responder, escreva apenas: "Informação insuficiente."
`;

  const prompts = {
    explain_code: `
${regraRespostaDireta}
Tarefa: responder diretamente sobre o código selecionado.
Se for pedido o resultado/saída, retorne apenas a saída.
Se for pedido para completar ou corrigir, retorne apenas o código final.
Se for uma pergunta conceitual, retorne apenas a resposta curta.

Texto selecionado:
${selection}
`,
    solve_exercise: `
${regraRespostaDireta}
Tarefa: resolver a questão selecionada.
Se for objetiva, retorne apenas a alternativa correta.
Se pedir um programa, retorne apenas o código completo.
Se pedir uma resposta numérica/textual, retorne apenas essa resposta.

Questão:
${selection}
`,
    explain_error: `
${regraRespostaDireta}
Tarefa: corrigir o erro selecionado.
Retorne apenas o comando, linha ou código corrigido mais provável.
Se não for possível corrigir sem mais contexto, escreva apenas: "Informação insuficiente."

Erro:
${selection}
`,
    improve_code: `
${regraRespostaDireta}
Tarefa: melhorar/refatorar o código selecionado.
Retorne apenas o código melhorado, sem explicação.

Código:
${selection}
`
  };

  return prompts[mode] || prompts.solve_exercise;
}
