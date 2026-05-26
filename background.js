const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];
const GROQ_MODEL = "llama-3.1-8b-instant";

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
  const storage = await chrome.storage.local.get(["geminiKey", "groqKey"]);
  const geminiKey = String(storage.geminiKey || "").replace(/\s/g, "");
  const groqKey = String(storage.groqKey || "").replace(/\s/g, "");

  if (!geminiKey && !groqKey) {
    throw new Error("Nenhuma chave de API encontrada.");
  }

  const prompt = criarPrompt(selection, mode);

  if (geminiKey) {
    try {
      return await gerarComFallback(geminiKey, prompt);
    } catch (error) {
      if (!groqKey) {
        throw error;
      }

      console.warn("Gemini falhou. Tentando Groq como fallback.", error);
    }
  }

  return chamarGroq(groqKey, prompt);
}

async function gerarComFallback(geminiKey, prompt) {
  let ultimoErro = null;

  for (const model of GEMINI_MODELS) {
    try {
      return await chamarGemini(geminiKey, model, prompt);
    } catch (error) {
      ultimoErro = error;

      if (error.retryDelayMs && !error.message.includes("limit: 0")) {
        await esperar(error.retryDelayMs);

        try {
          return await chamarGemini(geminiKey, model, prompt);
        } catch (retryError) {
          ultimoErro = retryError;
        }
      }

      if (ehErroDeQuota(ultimoErro)) {
        throw ultimoErro;
      }

      if (!podeTentarOutroModelo(ultimoErro)) {
        throw ultimoErro;
      }
    }
  }

  throw new Error(
    ultimoErro?.message ||
    "Todos os modelos do Gemini estão indisponíveis no momento."
  );
}

async function chamarGemini(geminiKey, model, prompt) {
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
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message = data.error?.message || "Erro na API do Gemini";
    const status = data.error?.status || "";
    const error = new Error(`${message} [${response.status} ${status}]`);
    error.httpStatus = response.status;
    error.apiStatus = status;
    error.retryDelayMs = obterRetryDelayMs(data, message);
    throw error;
  }

  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "Não consegui gerar uma resposta."
  );
}

async function chamarGroq(groqKey, prompt) {
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
      max_tokens: 1200
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data.error?.message || "Erro na API da Groq";
    const error = new Error(`${message} [Groq ${response.status}]`);
    error.httpStatus = response.status;
    error.provider = "groq";
    throw error;
  }

  return (
    data.choices?.[0]?.message?.content?.trim() ||
    "Não consegui gerar uma resposta."
  );
}

function obterRetryDelayMs(data, message) {
  const retryInfo = data.error?.details?.find((detail) => detail.retryDelay);
  const retryDelay = retryInfo?.retryDelay;

  if (retryDelay) {
    return Math.ceil(Number.parseFloat(retryDelay) * 1000);
  }

  const match = message.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(Number.parseFloat(match[1]) * 1000) : 0;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 12000)));
}

function podeTentarOutroModelo(error) {
  const message = error.message.toLowerCase();

  return (
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("503")
  );
}

function criarMensagemErro(error) {
  if (error.message === "Nenhuma chave de API encontrada.") {
    return "Nenhuma chave encontrada. Abra o ícone da extensão e salve uma chave do Gemini ou da Groq.";
  }

  if (error.message === "Chave do Gemini não encontrada.") {
    return "Chave do Gemini não encontrada.\n\nClique no ícone da extensão CodeMentor AI e salve sua chave para começar.";
  }

  if (ehErroDeQuota(error)) {
    return error.provider === "groq"
      ? "Limite gratuito da Groq atingido. Aguarde um pouco ou use Gemini como alternativa."
      : "Limite gratuito do Gemini atingido. Aguarde alguns segundos ou use a Groq como alternativa.";
  }

  if (ehErroDeChaveInvalida(error)) {
    return error.provider === "groq"
      ? "Chave da Groq inválida. Abra o ícone da extensão e cole uma chave válida da Groq."
      : "Chave do Gemini inválida ou não encontrada. Abra o ícone da extensão, limpe a chave salva e cole uma chave nova válida.";
  }

  return `Não foi possível gerar a resposta.\n\n${error.message}`;
}

function ehErroDeQuota(error) {
  const message = error.message.toLowerCase();

  return (
    error.httpStatus === 429 ||
    error.apiStatus === "RESOURCE_EXHAUSTED" ||
    message.includes("quota exceeded") ||
    message.includes("rate-limit") ||
    message.includes("resource_exhausted")
  );
}

function ehErroDeChaveInvalida(error) {
  const message = error.message.toLowerCase();

  return (
    (error.httpStatus === 400 || error.httpStatus === 401 || error.httpStatus === 403) &&
    (
      message.includes("api key not found") ||
      message.includes("valid api key") ||
      message.includes("invalid_argument") ||
      message.includes("invalid api key") ||
      message.includes("unauthorized")
    )
  );
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
