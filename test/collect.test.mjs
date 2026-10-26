import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novidade, dominioExcluido, recolher } from '../src/collect.mjs';
import { clienteFicticio, pagina, apiFalsa } from './ajuda.mjs';

test('pesquisa: alerta novo entra, alerta antigo só na primeira vez', () => {
  const p = pagina.alerta('https://cm-exemplo.pt/natal', 'k1');
  const it = novidade(p, 'Feiras');
  assert.equal(it.chave, 'k1');
  assert.equal(it.titulo, 'Mercado de Natal 2026 (cm-exemplo.pt)');
  assert.ok(!it.resumo.includes('—'), 'travessão do juiz é limpo');
  const antigo = pagina.alerta('https://cm-exemplo.pt/natal', 'k1', 'same');
  assert.equal(novidade(antigo, 'Feiras'), null);
  assert.ok(novidade(antigo, 'Feiras', { primeiraVez: true }));
});

test('página fixa: só entra mudança meaningful', () => {
  assert.equal(novidade(pagina.mudou('https://loja-rival.pt', false), 'Concorrentes'), null);
  const it = novidade(pagina.mudou('https://www.loja-rival.pt', true), 'Concorrentes');
  assert.equal(it.titulo, 'loja-rival.pt · campanha promocional estendida até 30/10');
  assert.equal(it.chave, 'https://www.loja-rival.pt#Promo até 30/10');
});

test('filtro de domínios: TLD e domínio com subdomínios', () => {
  assert.ok(dominioExcluido('https://feira.com.br/x', ['.br']));
  assert.ok(dominioExcluido('https://loja.padariaexemplo.pt', ['padariaexemplo.pt']));
  assert.ok(!dominioExcluido('https://outrapadariaexemplo.pt', ['padariaexemplo.pt']));
  assert.equal(novidade(pagina.alerta('https://feira.com.br', 'k9'), 'Feiras', { excluir: ['.br'] }), null);
});

test('recolher: primeira vez só 7 dias, sem repetidos, e não relê checks', async () => {
  const cliente = clienteFicticio();
  const agora = new Date('2026-10-26T08:00:00Z');
  const dias = (n) => new Date(agora - n * 86400000).toISOString();
  const api = apiFalsa({
    monitores: [
      { id: 'm1', name: 'radar:' + cliente.slug + ':Concorrentes' },
      { id: 'm2', name: 'radar:' + cliente.slug + ':Feiras com inscrições abertas' },
    ],
    checks: {
      m1: [{ id: 'c1', status: 'completed', finishedAt: dias(1) }, { id: 'c0', status: 'completed', finishedAt: dias(10) }, { id: 'cx', status: 'running', finishedAt: null }],
      m2: [{ id: 'c2', status: 'completed', finishedAt: dias(2) }, { id: 'c3', status: 'completed', finishedAt: dias(1) }],
    },
    detalhes: {
      c0: [pagina.mudou('https://velho.pt', true)],
      c1: [pagina.mudou('https://concorrente-a.pt', true), pagina.mudou('https://concorrente-b.pt/loja', false)],
      c2: [pagina.alerta('https://cm-exemplo.pt/natal', 'k1', 'same'), pagina.alerta('https://feira.com.br', 'kbr')],
      c3: [pagina.alerta('https://cm-exemplo.pt/natal', 'k1'), pagina.alerta('https://mun-exemplo.pt/aldeia', 'k2')],
    },
  });
  const r = await recolher(cliente, { api, agora });
  assert.deepEqual(r.itens.map((i) => i.chave), ['https://concorrente-a.pt#Promo até 30/10', 'k1', 'k2']);
  assert.deepEqual(r.processados.m1.sort(), ['c0', 'c1']);

  const r2 = await recolher(cliente, { api, agora, processados: r.processados, vistos: r.vistos });
  assert.equal(r2.itens.length, 0, 'segunda execução não repete nada');
});
