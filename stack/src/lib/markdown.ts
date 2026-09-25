const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

// Minimal markdown for question/answer bodies. Input is HTML-escaped first so user content can't inject markup.
export const renderMarkdown = (source: string) =>
  escapeHtml(source || "")
    .replace(/## (.*)/g, '<h3 class="text-lg font-semibold mt-6 mb-3 text-gray-900">$1</h3>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-2 py-1 rounded text-sm">$1</code>')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^/, '<p class="mb-4">')
    .replace(/$/, "</p>")
    .replace(/\n(\d+\. .*)/g, '<ol class="list-decimal list-inside my-4"><li>$1</li></ol>');
