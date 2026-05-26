window.CodeMentorPrism = {
  highlightAll(root = document) {
    root.querySelectorAll(".cm-code code").forEach((code) => {
      code.innerHTML = highlight(code.textContent);
    });
  }
};

function highlight(source) {
  return escapeHTML(source)
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|from|def|print|range|int|float|char|void|public|private|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)\b/g, '<span class="token keyword">$1</span>')
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '<span class="token string">$&</span>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<span class="token number">$&</span>')
    .replace(/(\/\/.*|#.*)/g, '<span class="token comment">$1</span>');
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
