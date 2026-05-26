let ultimoContexto = null;

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

  painel.innerHTML = `
    <div class="cm-header">
      <div>
        <strong>CodeMentor AI</strong>
        <span>${escapeHTML(title || "Assistente")}</span>
      </div>
      <button id="cm-close" type="button" aria-label="Fechar">×</button>
    </div>

    <div class="cm-toolbar">
      <button type="button" data-mode="explain_code">Responder</button>
      <button type="button" data-mode="solve_exercise">Resolver</button>
      <button type="button" data-mode="explain_error">Corrigir</button>
      <button type="button" data-mode="improve_code">Código</button>
    </div>

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
  `;

  document.getElementById("cm-close").onclick = () => painel.remove();

  painel.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => executarModo(button.dataset.mode));
  });

  if (window.CodeMentorPrism) {
    window.CodeMentorPrism.highlightAll(painel);
  }
}

async function executarModo(mode) {
  if (!ultimoContexto?.selection) return;

  criarPainel({
    title: "Gerando resposta",
    heading: "Resposta",
    selection: ultimoContexto.selection,
    answer: "Gerando nova resposta...",
    loading: true
  });

  const response = await chrome.runtime.sendMessage({
    type: "RUN_MODE",
    mode,
    selection: ultimoContexto.selection
  });

  criarPainel({
    title: response.ok ? "Resposta gerada" : "Erro",
    heading: response.ok ? "Resposta" : "Erro",
    selection: ultimoContexto.selection,
    answer: response.ok ? response.answer : response.error,
    loading: false
  });
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
  return escapeHTML(text)
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h4>$1</h4>")
    .replace(/^# (.*)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.+)$/s, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
