import Markdoc from "@markdoc/markdoc";
function convertHtmlToText(html: string): string {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}

export async function copyMarkdownToClipboard(markdown: string): Promise<void> {
  // Convert Markdown to HTML using Markdoc
  const ast = Markdoc.parse(markdown);
  const content = Markdoc.transform(ast);
  const html = Markdoc.renderers
    .html(content)
    .replace(/<article>/, "")
    .replace(/<\/article>/, "");

  // Convert HTML to plain text
  const plainText = convertHtmlToText(html);

  // Create a new ClipboardItem
  const clipboardItemInput = {
    "text/plain": new Blob([plainText], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  };
  const clipboardItem = new ClipboardItem(clipboardItemInput);
  // Copy to clipboard
  await navigator.clipboard.write([clipboardItem]);
}
