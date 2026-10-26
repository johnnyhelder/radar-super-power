import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensagemManha, email } from '../src/digest.mjs';
import { partir } from '../src/deliver/telegram.mjs';

const itens = [
  { n: 1, secao: 'Feiras com inscrições abertas', titulo: 'Mercado de Natal 2026 (cm-exemplo.pt)', resumo: 'Inscrições até 15/11.', url: 'https://cm-exemplo.pt' },
  { n: 2, secao: 'Concorrentes', titulo: 'loja-rival.pt · campanha até 30/10', resumo: 'Campanha <b>estendida</b>', url: 'https://loja-rival.pt' },
];

test('mensagem da manhã: títulos numerados, sem travessão nem dois-pontos', () => {
  const msg = mensagemManha(itens, { lingua: 'pt-PT', nome_dono: 'Ana' });
  assert.match(msg, /^Bom dia, Ana!/);
  assert.match(msg, /com 2 novidades\./);
  assert.match(msg, /\n1\. Mercado de Natal 2026/);
  assert.match(msg, /Responda VER/);
  assert.ok(!msg.includes('—'));
  assert.ok(!msg.includes(':'), msg);
});

test('mensagem em espanhol', () => {
  assert.match(mensagemManha(itens, { lingua: 'es' }), /^¡Buenos días!/);
});

test('mensagem longa corta e avisa quantas ficaram para o detalhe', () => {
  const muitos = Array.from({ length: 80 }, (_, i) => ({ n: i + 1, secao: `S${i % 8}`, titulo: 'x'.repeat(130), url: 'u' }));
  const msg = mensagemManha(muitos, { lingua: 'pt-BR' });
  assert.ok(msg.length <= 4000);
  assert.match(msg, /E mais \d+ no detalhe\./);
});

test('email escapa HTML', () => {
  const e = email({ data: '2026-10-26', itens }, { lingua: 'pt-PT', negocio: 'Loja' });
  assert.ok(e.html.includes('&lt;b&gt;estendida'));
  assert.equal(e.assunto, 'Radar de mercado de 2026-10-26 (2 novidades)');
});

test('partir respeita o limite do Telegram', () => {
  const partes = partir(Array.from({ length: 300 }, () => 'linha de teste com algum texto').join('\n'));
  assert.ok(partes.length > 1 && partes.every((p) => p.length <= 4000));
});

test('escutar recusa bot sem RADAR_BOT_DEDICADO=sim e não chama o Telegram', async () => {
  const { escutar } = await import('../src/comandos.mjs');
  const { clienteFicticio } = await import('./ajuda.mjs');
  let chamou = false;
  const tg = { atualizacoes: async () => { chamou = true; return []; } };
  await assert.rejects(escutar(clienteFicticio(), { tg, log: () => {} }), /bot dedicado/);
  assert.equal(chamou, false);
  await escutar(clienteFicticio(undefined, 'RADAR_BOT_DEDICADO=sim\nTELEGRAM_CHAT_ID=1'), { tg, log: () => {} });
  assert.equal(chamou, true);
});
