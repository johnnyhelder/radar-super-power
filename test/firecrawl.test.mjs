import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFirecrawl } from '../src/firecrawl.mjs';

const resposta = (status, corpo, headers = {}) => ({
  status, ok: status < 400,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
  text: async () => JSON.stringify(corpo),
});

test('429 espera o Retry-After e repete', async () => {
  const esperas = [];
  const fila = [resposta(429, {}, { 'retry-after': '12' }), resposta(429, {}), resposta(200, { success: true, data: [{ id: 'a' }] })];
  const api = criarFirecrawl({ chave: 'x', fetchFn: async () => fila.shift(), dormir: async (ms) => esperas.push(ms), intervaloLeitura: 0 });
  const r = await api.listarMonitores();
  assert.deepEqual(r, [{ id: 'a' }]);
  assert.deepEqual(esperas, [12000, 35000]);
  assert.equal(api.contagem.GET, 3);
});

test('desiste depois de 5 tentativas', async () => {
  const api = criarFirecrawl({ chave: 'x', fetchFn: async () => resposta(429, {}), dormir: async () => {}, intervaloLeitura: 0 });
  await assert.rejects(api.listarChecks('m'), /5 tentativas/);
});

test('modo só leitura bloqueia POST e PATCH sem chamar a API', async () => {
  let chamadas = 0;
  const api = criarFirecrawl({ chave: 'x', fetchFn: async () => { chamadas++; }, somenteLeitura: true });
  await assert.rejects(api.criarMonitor({}), /só leitura/);
  await assert.rejects(api.alterarMonitor('m', {}), /só leitura/);
  assert.equal(chamadas, 0);
});

test('lerCheck segue o next das páginas', async () => {
  const fila = [
    resposta(200, { success: true, next: 'https://api.firecrawl.dev/v2/monitor/m/checks/c?skip=1', data: { id: 'c', pages: [{ url: 'a' }] } }),
    resposta(200, { success: true, data: { pages: [{ url: 'b' }] } }),
  ];
  const urls = [];
  const api = criarFirecrawl({ chave: 'x', fetchFn: async (u) => { urls.push(u); return fila.shift(); }, dormir: async () => {}, intervaloLeitura: 0 });
  const c = await api.lerCheck('m', 'c');
  assert.deepEqual(c.pages.map((p) => p.url), ['a', 'b']);
  assert.equal(urls[1], 'https://api.firecrawl.dev/v2/monitor/m/checks/c?skip=1');
});
