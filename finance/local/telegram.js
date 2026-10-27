// Telegram Bot API client. Uses long polling (getUpdates), so the computer running Books
// needs no public address. Only messages from the configured chat are ever acted on.
class Telegram {
  constructor({ token, chatId }, fetchImpl = globalThis.fetch) { this.token = token; this.chatId = String(chatId || ''); this.fetch = fetchImpl; }

  configured() { return !!(this.token && this.chatId); }

  async api(method, body = {}) {
    const res = await this.fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) {
      const e = new Error(`Telegram ${method}: ${data.description || res.status}`);
      e.retryAfter = data.parameters && data.parameters.retry_after;
      throw e;
    }
    return data.result;
  }

  send(text, keyboard) {
    return this.api('sendMessage', { chat_id: this.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
  }

  edit(messageId, text, keyboard) {
    return this.api('editMessageText', { chat_id: this.chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard || [] } })
      .catch(e => { if (!/message is not modified/.test(e.message)) throw e; });
  }

  answer(callbackId, text) { return this.api('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) }).catch(() => {}); }

  updates(offset, timeout = 50) { return this.api('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }); }

  async download(fileId) {
    const f = await this.api('getFile', { file_id: fileId });
    const res = await this.fetch(`https://api.telegram.org/file/bot${this.token}/${f.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download failed (${res.status})`);
    return { buf: Buffer.from(await res.arrayBuffer()), path: f.file_path };
  }

  async sendDocument(buf, filename, caption) {
    const form = new FormData();
    form.append('chat_id', this.chatId);
    if (caption) { form.append('caption', caption); form.append('parse_mode', 'HTML'); }
    form.append('document', new Blob([buf]), filename);
    const res = await this.fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description || res.status}`);
    return data.result;
  }

  setCommands() {
    return this.api('setMyCommands', { commands: [
      { command: 'todo', description: 'Show transactions waiting for you' },
      { command: 'summary', description: 'This month so far, per company' },
      { command: 'sync', description: 'Check Gmail now' },
      { command: 'export', description: 'Excel + invoices pack for your CA' },
      { command: 'help', description: 'How this bot works' },
    ] });
  }
}

module.exports = { Telegram };
