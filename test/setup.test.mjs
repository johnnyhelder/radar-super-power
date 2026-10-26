import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMonitores, executarSetup } from '../src/setup.mjs';
import { clienteFicticio, CONFIG as CONFIG_BASE } from './ajuda.mjs';

test('estimativa calibrada com o piloto', () => {
  const [conc, feiras] = montarMonitores(clienteFicticio());
  assert.equal(conc.estimativa, 480);   // piloto ~464 (8 páginas diárias)
  assert.equal(feiras.estimativa, 194); // piloto ~180 (3 queries x 15 semanal)
});

test('corpo do monitor: goal com país e língua, email do Firecrawl desligado, TLD fora do excludeDomains', () => {
  const [conc, feiras] = montarMonitores(clienteFicticio());
  assert.match(conc.corpo.goal, /Considerar só resultados de Portugal\. Escrever o motivo e o nome em português de Portugal\.$/);
  assert.equal(conc.corpo.notification.email.enabled, false);
  assert.deepEqual(conc.corpo.schedule, { cron: '0 6 * * *', timezone: 'Europe/Lisbon' });
  assert.deepEqual(feiras.corpo.targets[0].excludeDomains, ['padariaexemplo.pt']);
  assert.equal(feiras.corpo.targets[0].searchWindow, '7d');
});

test('simulação não cria nada; acima do orçamento bloqueia com --confirmar', async () => {
  const chamadas = [];
  const api = { listarMonitores: async () => [], criarMonitor: async (c) => { chamadas.push(c); return { id: 'n', name: c.name }; } };
  const r = await executarSetup(clienteFicticio(), { api, log: () => {} });
  assert.equal(r.aplicado, false);
  assert.equal(chamadas.length, 0);

  const caro = clienteFicticio(undefined, '').cfg;
  const cliente = clienteFicticio();
  cliente.orcamento = 500;
  await assert.rejects(executarSetup(cliente, { api, confirmar: true, log: () => {} }), /Nada criado/);
  assert.equal(chamadas.length, 0);
  assert.ok(caro);
});

test('idempotente pelo nome: monitor igual não é recriado', async () => {
  const cliente = clienteFicticio();
  const monitores = montarMonitores(cliente);
  const existentes = monitores.map((m, i) => ({ id: `id${i}`, name: m.corpo.name, goal: m.corpo.goal, targets: m.corpo.targets, notification: m.corpo.notification }));
  const r = await executarSetup(cliente, { api: { listarMonitores: async () => existentes }, log: () => {} });
  assert.deepEqual(r.plano.map((p) => p.acao), ['igual', 'igual']);
});

test('regiao substitui o país no goal; rede social em urls é recusada', () => {
  const comRegiao = clienteFicticio(CONFIG_BASE.replace('pais: Portugal', 'pais: Portugal\nregiao: Porto e Gaia'));
  assert.match(montarMonitores(comRegiao)[0].corpo.goal, /Considerar só resultados de Porto e Gaia\./);
  assert.throws(() => clienteFicticio(CONFIG_BASE.replace('https://c.pt', 'https://www.instagram.com/rival/')), /rede social/);
});
