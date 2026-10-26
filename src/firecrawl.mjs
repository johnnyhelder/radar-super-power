// Cliente mínimo da API v2 do Firecrawl (monitores).
// Limites observados no piloto: ~10 pedidos/min nas leituras, ~2 a 3/min ao criar ou alterar.
// Um 429 espera o Retry-After (ou 35 s) e repete, até 5 tentativas.

const BASE = 'https://api.firecrawl.dev';

const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms));

export function criarFirecrawl({
  chave,
  fetchFn = fetch,
  dormir = dormirReal,
  intervaloLeitura = 6500,
  intervaloEscrita = 25000,
  somenteLeitura = false,
  log = () => {},
}) {
  if (!chave) throw new Error('Falta FIRECRAWL_API_KEY no .env do cliente.');
  let ultimoPedido = 0;
  const contagem = { GET: 0, POST: 0, PATCH: 0 };

  async function pedir(metodo, caminho, corpo) {
    if (somenteLeitura && metodo !== 'GET') {
      throw new Error(`Modo só leitura, bloqueado ${metodo} ${caminho}`);
    }
    const intervalo = metodo === 'GET' ? intervaloLeitura : intervaloEscrita;
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      const espera = ultimoPedido + intervalo - Date.now();
      if (espera > 0) await dormir(espera);
      ultimoPedido = Date.now();
      contagem[metodo]++;
      const r = await fetchFn(BASE + caminho, {
        method: metodo,
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      if (r.status === 429) {
        const retryAfter = Number(r.headers?.get?.('retry-after'));
        const ms = retryAfter > 0 ? retryAfter * 1000 : 35000;
        log(`Firecrawl 429 em ${metodo} ${caminho}, espero ${Math.round(ms / 1000)} s (tentativa ${tentativa}/5)`);
        await dormir(ms);
        continue;
      }
      const texto = await r.text();
      let json = null;
      try { json = JSON.parse(texto); } catch { /* resposta sem JSON */ }
      if (!r.ok || json?.success === false) {
        throw new Error(`Firecrawl ${metodo} ${caminho} respondeu ${r.status}, ${json?.error || texto.slice(0, 200)}`);
      }
      return json;
    }
    throw new Error(`Firecrawl ${metodo} ${caminho} continua em 429 depois de 5 tentativas`);
  }

  // O campo "next" pode vir como URL completa ou como caminho.
  const caminhoDe = (next) => (next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next);

  return {
    contagem,

    async listarMonitores() {
      const todos = [];
      for (let offset = 0; ; offset += 100) {
        const r = await pedir('GET', `/v2/monitor?limit=100&offset=${offset}`);
        todos.push(...(r.data || []));
        if (!r.data || r.data.length < 100) return todos;
      }
    },

    async criarMonitor(corpo) {
      return (await pedir('POST', '/v2/monitor', corpo)).data;
    },

    async alterarMonitor(id, corpo) {
      return (await pedir('PATCH', `/v2/monitor/${id}`, corpo)).data;
    },

    async listarChecks(monitorId, limit = 10) {
      return (await pedir('GET', `/v2/monitor/${monitorId}/checks?limit=${limit}`)).data || [];
    },

    async lerCheck(monitorId, checkId) {
      let r = await pedir('GET', `/v2/monitor/${monitorId}/checks/${checkId}`);
      const check = r.data;
      const pages = [...(check.pages || [])];
      let next = r.next || check.next;
      while (next) {
        r = await pedir('GET', caminhoDe(next));
        pages.push(...(r.data?.pages || []));
        next = r.next || r.data?.next;
      }
      return { ...check, pages };
    },
  };
}
