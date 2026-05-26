let ultimoContexto = null;
let painelMinimizado = false;
let painelPosicao = null;
let arrasteAtual = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SHOW_LOADING") {
    ultimoContexto = message;
    criarPainel({
      title: message.title,
      heading: message.heading,
      selection: message.selection,
      answer: message.message,
      loading: true
    });
  }

  if (message.type === "SHOW_RESULT" || message.type === "SHOW_ERROR") {
    ultimoContexto = message;
    criarPainel({
      title: message.title,
      heading: message.heading,
      selection: message.selection,
      answer: message.answer,
      loading: false
    });
  }
});

function criarPainel({ title, heading, selection, answer, loading }) {
  let painel = document.getElementById("codementor-panel");

  if (!painel) {
    painel = document.createElement("aside");
    painel.id = "codementor-panel";
    document.body.appendChild(painel);
  }

  painel.classList.toggle("is-minimized", painelMinimizado);

  if (painelPosicao) {
    painel.style.left = `${painelPosicao.left}px`;
    painel.style.top = `${painelPosicao.top}px`;
    painel.style.right = "auto";
  }

  painel.innerHTML = `
    <div class="cm-header">
      <div>
        <strong>CodeMentor AI</strong>
        <span>${escapeHTML(title || "Resposta")}</span>
      </div>
      <div class="cm-window-actions">
        <button id="cm-minimize" type="button" aria-label="${painelMinimizado ? "Restaurar" : "Minimizar"}">${painelMinimizado ? "□" : "−"}</button>
        <button id="cm-close" type="button" aria-label="Fechar">×</button>
      </div>
    </div>

    <div class="cm-body">
      <section class="cm-section">
        <h3>Selecionado</h3>
        <pre class="cm-selection"><code>${escapeHTML(selection || "")}</code></pre>
      </section>

      <section class="cm-section">
        <h3>${escapeHTML(heading || "Resposta")}</h3>
        <div class="cm-answer ${loading ? "is-loading" : ""}">
          ${renderMarkdown(answer || "")}
        </div>
      </section>
    </div>
  `;

  document.getElementById("cm-close").onclick = () => painel.remove();
  document.getElementById("cm-minimize").onclick = () => {
    painelMinimizado = !painelMinimizado;
    painel.classList.toggle("is-minimized", painelMinimizado);
    document.getElementById("cm-minimize").textContent = painelMinimizado ? "□" : "−";
    document.getElementById("cm-minimize").setAttribute("aria-label", painelMinimizado ? "Restaurar" : "Minimizar");
    manterPainelNaTela(painel);
  };

  ativarArraste(painel);

}

function ativarArraste(painel) {
  const header = painel.querySelector(".cm-header");

  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;

    const rect = painel.getBoundingClientRect();
    arrasteAtual = {
      painel,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };

    painel.style.left = `${rect.left}px`;
    painel.style.top = `${rect.top}px`;
    painel.style.right = "auto";
    painel.classList.add("is-dragging");
    document.body.classList.add("cm-dragging-window");
    event.preventDefault();
  });

  header.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    document.getElementById("cm-minimize").click();
  });
}

document.addEventListener("pointermove", (event) => {
  if (!arrasteAtual) return;

  const { painel, offsetX, offsetY } = arrasteAtual;
  moverPainel(painel, event.clientX - offsetX, event.clientY - offsetY);
});

document.addEventListener("pointerup", () => {
  if (!arrasteAtual) return;

  arrasteAtual.painel.classList.remove("is-dragging");
  document.body.classList.remove("cm-dragging-window");
  arrasteAtual = null;
});

function moverPainel(painel, left, top) {
  const limite = 8;
  const maxLeft = Math.max(limite, window.innerWidth - painel.offsetWidth - limite);
  const maxTop = Math.max(limite, window.innerHeight - painel.offsetHeight - limite);

  painelPosicao = {
    left: Math.max(limite, Math.min(left, maxLeft)),
    top: Math.max(limite, Math.min(top, maxTop))
  };

  painel.style.left = `${painelPosicao.left}px`;
  painel.style.top = `${painelPosicao.top}px`;
  painel.style.right = "auto";
}

function manterPainelNaTela(painel) {
  const rect = painel.getBoundingClientRect();
  moverPainel(painel, rect.left, rect.top);
}

function renderMarkdown(text) {
  const parts = String(text).split(/```(\w+)?\n?([\s\S]*?)```/g);
  let html = "";

  for (let i = 0; i < parts.length; i += 3) {
    html += formatText(parts[i] || "");

    if (i + 2 < parts.length) {
      const language = parts[i + 1] || "text";
      const code = parts[i + 2] || "";
      html += `<pre class="cm-code language-${escapeHTML(language)}"><code>${escapeHTML(code)}</code></pre>`;
    }
  }

  return html;
}

function formatText(text) {
  const cleanText = escapeHTML(text).trim();

  if (!cleanText) {
    return "";
  }

  return `<p>${cleanText.replace(/\n/g, "<br>")}</p>`;
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
