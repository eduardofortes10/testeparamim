const input = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.local.get(["geminiKey"], ({ geminiKey }) => {
  input.value = geminiKey || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const key = document.getElementById("apiKey").value.trim();

  if (!key) {
    status.textContent = "Cole uma chave antes de salvar.";
    status.style.color = "#fca5a5";
    return;
  }

  await chrome.storage.local.set({
    geminiKey: key
  });

  status.textContent = "Chave salva.";
  status.style.color = "#86efac";
});
