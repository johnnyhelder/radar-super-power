// Telegram só com sendMessage e getUpdates. Nunca configura webhook.

const LIMITE = 4000;

export function partir(texto, max = LIMITE) {
  const partes = [];
  let atual = '';
  for (const linha of texto.split('\n')) {
    const candidato = atual ? `${atual}\n${linha}` : linha;
    if (candidato.length <= max) { atual = candidato; continue; }
    if (atual) partes.push(atual);
    atual = linha.length > max ? linha.slice(0, max) : linha;
  }
  if (atual) partes.push(atual);
  return partes;
}

export function criarTelegram({ token, fetchFn = fetch }) {
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN no .env do cliente.');

  async function chamar(metodo, corpo = {}) {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => ({}));
    // A mensagem de erro nunca leva o token.
    if (!json.ok) throw new Error(`Telegram ${metodo} falhou (${r.status}), ${json.description || 'sem detalhe'}`);
    return json.result;
  }

  return {
    async enviar(chatId, texto) {
      for (const parte of partir(texto)) {
        await chamar('sendMessage', { chat_id: chatId, text: parte, disable_web_page_preview: true });
      }
    },

    // getUpdates só funciona num bot sem webhook. Se houver um, outro sistema usa este
    // bot: paro aqui e não mexo no webhook.
    async atualizacoes(offset) {
      const info = await chamar('getWebhookInfo');
      if (info.url) throw new Error('Este bot tem um webhook ativo, por isso já é usado por outro sistema. Use um bot dedicado ao radar.');
      return chamar('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
    },
  };
}
