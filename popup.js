const geminiInput = document.getElementById("geminiKey");
const groqInput = document.getElementById("groqKey");
const status = document.getElementById("status");

chrome.storage.local.get(["geminiKey", "groqKey"], ({ geminiKey, groqKey }) => {
  geminiInput.value = geminiKey || "";
  groqInput.value = groqKey || "";
  atualizarStatusSalvo(geminiKey, groqKey);
});

document.getElementById("save").addEventListener("click", async () => {
  const geminiKey = normalizarChave(geminiInput.value);
  const groqKey = normalizarChave(groqInput.value);

  await chrome.storage.local.set({
    geminiKey,
    groqKey
  });

  atualizarStatusSalvo(geminiKey, groqKey, "Chaves salvas.");
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(["geminiKey", "groqKey"]);
  geminiInput.value = "";
  groqInput.value = "";
  status.textContent = "Chaves removidas.";
  status.style.color = "#fca5a5";
});

document.getElementById("testGemini").addEventListener("click", async () => {
  const key = normalizarChave(geminiInput.value);

  if (!key) {
    mostrarStatus("Cole uma chave do Gemini antes de testar.", "#fca5a5");
    return;
  }

  mostrarStatus("Testando Gemini...", "#bfdbfe");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );

    const data = await response.json();
    const message = data.error?.message || "";
    const apiStatus = data.error?.status || "";

    if (response.ok) {
      mostrarStatus(`Gemini válido: ${mascararChave(key)}`, "#86efac");
      return;
    }

    if (response.status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
      mostrarStatus("Gemini válido, mas o limite foi atingido agora.", "#fbbf24");
      return;
    }

    if (message.toLowerCase().includes("api key")) {
      mostrarStatus("Chave do Gemini inválida.", "#fca5a5");
      return;
    }

    mostrarStatus(`Erro no Gemini: ${message || response.status}`, "#fca5a5");
  } catch (error) {
    mostrarStatus(`Erro no Gemini: ${error.message}`, "#fca5a5");
  }
});

document.getElementById("testGroq").addEventListener("click", async () => {
  const key = normalizarChave(groqInput.value);

  if (!key) {
    mostrarStatus("Cole uma chave da Groq antes de testar.", "#fca5a5");
    return;
  }

  mostrarStatus("Testando Groq...", "#bfdbfe");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        "Authorization": `Bearer ${key}`
      }
    });

    const data = await response.json();
    const message = data.error?.message || "";

    if (response.ok) {
      mostrarStatus(`Groq válida: ${mascararChave(key)}`, "#86efac");
      return;
    }

    if (response.status === 429) {
      mostrarStatus("Groq válida, mas o limite foi atingido agora.", "#fbbf24");
      return;
    }

    if (response.status === 401 || response.status === 403) {
      mostrarStatus("Chave da Groq inválida.", "#fca5a5");
      return;
    }

    mostrarStatus(`Erro na Groq: ${message || response.status}`, "#fca5a5");
  } catch (error) {
    mostrarStatus(`Erro na Groq: ${error.message}`, "#fca5a5");
  }
});

function atualizarStatusSalvo(geminiKey, groqKey, prefix = "") {
  const partes = [];

  if (geminiKey) partes.push(`Gemini: ${mascararChave(geminiKey)}`);
  if (groqKey) partes.push(`Groq: ${mascararChave(groqKey)}`);

  mostrarStatus(
    `${prefix ? `${prefix} ` : ""}${partes.length ? partes.join(" | ") : "Nenhuma chave salva."}`,
    partes.length ? "#86efac" : "#fca5a5"
  );
}

function mostrarStatus(texto, cor) {
  status.textContent = texto;
  status.style.color = cor;
}

function normalizarChave(key) {
  return String(key).replace(/\s/g, "");
}

function mascararChave(key) {
  if (!key) return "";
  if (key.length <= 10) return "********";

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
