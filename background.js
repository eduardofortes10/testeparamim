const MAX_SELECTION_LENGTH = 8000;
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];
const GROQ_MODEL = "llama-3.1-8b-instant";

const MODES = {
  solve_question: {
    title: "Responder questão",
    loading: "Gerando resposta...",
    heading: "Resposta"
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "estudomentor-root",
      title: "EstudoMentor AI",
      contexts: ["selection"]
    });

    Object.entries(MODES).forEach(([id, mode]) => {
      chrome.contextMenus.create({
        id,
        parentId: "estudomentor-root",
        title: mode.title,
        contexts: ["selection"]
      });
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mode = MODES[info.menuItemId];
  if (!mode) return;

  const selection = normalizarSelecao(info.selectionText);
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

  const selection = normalizarSelecao(message.selection);
  const mode = validarModo(message.mode);

  gerarResposta(selection, mode)
    .then((answer) => sendResponse({ ok: true, answer }))
    .catch((error) => sendResponse({ ok: false, error: criarMensagemErro(error) }));

  return true;
});

async function enviarParaAba(tabId, mensagem) {
  try {
    await chrome.tabs.sendMessage(tabId, mensagem);
  } catch (error) {
    try {
      await injetarPainel(tabId);
      await chrome.tabs.sendMessage(tabId, mensagem);
    } catch (injectionError) {
      console.warn("Não foi possível mostrar o painel nesta página.", injectionError);
    }
  }
}

async function injetarPainel(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["style.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function gerarResposta(selection, mode) {
  const safeSelection = normalizarSelecao(selection);
  const safeMode = validarModo(mode);

  if (!safeSelection) {
    throw new Error("Seleção vazia.");
  }

  const config = await chrome.storage.local.get([
    "geminiKey",
    "groqKey"
  ]);
  const gemini = normalizarChave(config.geminiKey);
  const groq = normalizarChave(config.groqKey);

  if (!gemini && !groq) {
    throw new Error("Nenhuma API configurada.");
  }

  const prompt = criarPrompt(safeSelection, safeMode);

  if (gemini) {
    try {
      return await gerarComGemini(gemini, prompt);
    } catch (error) {
      if (!groq) throw error;
      console.warn("Gemini do usuário falhou. Tentando Groq do usuário.", error);
    }
  }

  return gerarComGroq(groq, prompt);
}

function normalizarSelecao(value) {
  return String(value || "").trim().slice(0, MAX_SELECTION_LENGTH);
}

function validarModo(mode) {
  return MODES[mode] ? mode : "solve_question";
}

function normalizarChave(value) {
  return String(value || "").replace(/\s/g, "");
}

async function gerarComGemini(geminiKey, prompt) {
  let ultimoErro = null;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
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
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 900
            }
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error?.message || "Erro na API do Gemini");
        error.httpStatus = response.status;
        error.apiStatus = data.error?.status || "";
        throw error;
      }

      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Não consegui gerar uma resposta.";
    } catch (error) {
      ultimoErro = error;
    }
  }

  throw ultimoErro || new Error("Gemini indisponível.");
}

async function gerarComGroq(groqKey, prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0,
      max_tokens: 900
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error?.message || "Erro na API da Groq");
    error.httpStatus = response.status;
    error.provider = "groq";
    throw error;
  }

  return data.choices?.[0]?.message?.content?.trim() || "Não consegui gerar uma resposta.";
}

function criarPrompt(selection, mode) {
  const regraRespostaDireta = `
Você é o EstudoMentor AI, um assistente de estudos para provas, exercícios, formulários e questões de várias matérias.
Responda em português do Brasil.

REGRA PRINCIPAL:
- Dê apenas a resposta final.
- Não explique.
- Não mostre passo a passo.
- Não mostre cálculo.
- Não justifique.
- Não use introduções como "A resposta é".
- Não use comentários desnecessários.
- Se for questão objetiva com alternativas, responda apenas a alternativa correta.
- Se for uma questão de matemática, física, química, lógica ou estatística, calcule com cuidado antes de responder.
- Se o enunciado pedir para criar, escrever, implementar ou completar um programa, responda apenas com o código completo.
- Se o texto selecionado já trouxer uma pergunta e alternativas, use as alternativas para escolher a resposta.
- Se não houver informação suficiente para responder, escreva apenas: "Informação insuficiente."
`;

  const prompts = {
    solve_question: `
${regraRespostaDireta}
Tarefa: resolver a questão selecionada.
Se for objetiva, retorne apenas a alternativa correta.
Se pedir uma resposta numérica/textual, retorne apenas essa resposta.
Se pedir um programa, retorne apenas o código completo.

Questão:
${selection}
`,
    correct_option: `
${regraRespostaDireta}
Tarefa: identificar a alternativa correta.
Retorne apenas a letra e/ou o texto da alternativa correta.

Questão:
${selection}
`,
    direct_answer: `
${regraRespostaDireta}
Tarefa: responder diretamente.
Retorne somente a resposta final.

Questão:
${selection}
`,
    final_result: `
${regraRespostaDireta}
Tarefa: resolver e retornar somente o resultado final.
Faça qualquer raciocínio internamente, mas não mostre o cálculo nem a explicação.

Questão:
${selection}
`,
    fix_or_improve: `
${regraRespostaDireta}
Tarefa: corrigir ou melhorar o texto, resposta, cálculo, comando ou código selecionado.
Retorne apenas a versão corrigida ou melhorada.
Se for código, retorne apenas o código final.

Texto:
${selection}
`
  };

  return prompts[mode] || prompts.solve_question;
}

function criarMensagemErro(error) {
  if (error.message === "Nenhuma API configurada.") {
    return "Nenhuma API configurada. Abra o ícone da extensão e informe uma chave do Gemini ou da Groq.";
  }

  if (error.message === "Seleção vazia.") {
    return "Selecione o texto da questão antes de usar a extensão.";
  }

  if (error.httpStatus === 401 || error.httpStatus === 403) {
    return error.provider === "groq"
      ? "Chave da Groq inválida ou sem permissão."
      : "Chave de API inválida, expirada ou sem permissão.";
  }

  if (error.httpStatus === 413) {
    return "O texto selecionado é muito grande. Selecione apenas a questão.";
  }

  if (error.httpStatus === 429) {
    return "Limite de uso atingido. Tente novamente mais tarde.";
  }

  return `Não foi possível gerar a resposta.\n\n${error.message}`;
}
