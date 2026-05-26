const input = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.local.get(["geminiKey"], ({ geminiKey }) => {
  input.value = geminiKey || "";
  status.textContent = geminiKey
    ? `Chave salva: ${mascararChave(geminiKey)}`
    : "Nenhuma chave salva.";
});

document.getElementById("save").addEventListener("click", async () => {
  const key = normalizarChave(document.getElementById("apiKey").value);

  if (!key) {
    status.textContent = "Cole uma chave antes de salvar.";
    status.style.color = "#fca5a5";
    return;
  }

  await chrome.storage.local.set({
    geminiKey: key
  });

  const { geminiKey } = await chrome.storage.local.get(["geminiKey"]);
  status.textContent = `Nova chave salva: ${mascararChave(geminiKey)}`;
  status.style.color = "#86efac";
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(["geminiKey"]);
  input.value = "";
  status.textContent = "Chave removida. Cole a nova chave e salve.";
  status.style.color = "#fca5a5";
});

document.getElementById("test").addEventListener("click", async () => {
  const key = normalizarChave(input.value);

  if (!key) {
    status.textContent = "Cole uma chave antes de testar.";
    status.style.color = "#fca5a5";
    return;
  }

  status.textContent = "Testando chave...";
  status.style.color = "#bfdbfe";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );

    const data = await response.json();
    const message = data.error?.message || "";
    const apiStatus = data.error?.status || "";

    if (response.ok) {
      status.textContent = `Chave válida: ${mascararChave(key)}`;
      status.style.color = "#86efac";
      return;
    }

    if (response.status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
      status.textContent = "Chave válida, mas o limite de requisições foi atingido agora.";
      status.style.color = "#fbbf24";
      return;
    }

    if (message.toLowerCase().includes("api key")) {
      status.textContent = "Chave inválida. Crie outra no Google AI Studio.";
      status.style.color = "#fca5a5";
      return;
    }

    status.textContent = `Erro no teste: ${message || response.status}`;
    status.style.color = "#fca5a5";
  } catch (error) {
    status.textContent = `Erro no teste: ${error.message}`;
    status.style.color = "#fca5a5";
  }
});

function normalizarChave(key) {
  return String(key).replace(/\s/g, "");
}

function mascararChave(key) {
  if (!key) return "";
  if (key.length <= 10) return "********";

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
