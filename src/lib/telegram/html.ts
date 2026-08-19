export function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function telegramCode(value: string): string {
  return `<code>${escapeTelegramHtml(value)}</code>`;
}

export function usesTelegramHtml(text: string): boolean {
  return text.includes("<code>");
}
