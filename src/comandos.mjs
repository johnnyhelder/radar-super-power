// Comandos run, escutar, ver e email. O setup vive em setup.mjs.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { recolher } from './collect.mjs';
import { criarEstado, podarVistos, dataLocal } from './state.mjs';
import { mensagemManha, detalhes, detalheItem, email, textos } from './digest.mjs';
import { enviarEmail } from './deliver/email.mjs';

export async function run(cliente, { api, tg, dryRun = false, agora = new Date(), log = console.log }) {
  const estado = criarEstado(cliente.dir);
  const r = await recolher(cliente, {
    api,
    processados: estado.ler('processados.json', {}),
    vistos: podarVistos(estado.ler('vistos.json', {}), agora),
    agora,
    log,
  });

  const data = dataLocal(agora, cliente.fuso);
  const dia = estado.lerDia(data) || { data, itens: [], respondido: null };
  const novos = r.itens.map((it, i) => ({ n: dia.itens.length + i + 1, ...it }));
  const diaNovo = { ...dia, itens: [...dia.itens, ...novos] };

  if (!novos.length) {
    log('Sem novidades. Não envio mensagem.');
  } else {
    const msg = mensagemManha(novos, cliente.cfg);
    if (dryRun) {
      log(`--- mensagem que seria enviada (${novos.length} novidades) ---\n${msg}\n---`);
      const caminho = gravarPrevia(estado, diaNovo, cliente);
      log(`Prévia do email em ${caminho}`);
    } else if (tg && cliente.env.TELEGRAM_CHAT_ID) {
      // Envia antes de gravar: se o envio falhar, as novidades voltam amanhã.
      await tg.enviar(cliente.env.TELEGRAM_CHAT_ID, msg);
      log(`Pergunta enviada com ${novos.length} novidades.`);
    } else {
      log(`Sem TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID, fica só guardado.\n${msg}`);
    }
  }

  if (dryRun) {
    log('Dry-run. Estado não alterado.');
  } else {
    if (novos.length) estado.gravarDia(diaNovo);
    estado.gravar('processados.json', r.processados);
    estado.gravar('vistos.json', r.vistos);
  }
  return { novos, dia: diaNovo };
}

function gravarPrevia(estado, dia, cliente) {
  const pasta = join(estado.base, 'previa');
  mkdirSync(pasta, { recursive: true });
  const caminho = join(pasta, `${dia.data}.html`);
  writeFileSync(caminho, email(dia, cliente.cfg).html);
  return caminho;
}

export async function enviarEmailDoDia(cliente, dia, { destino, dryRun = false, log = console.log } = {}) {
  const e = email(dia, cliente.cfg);
  if (dryRun) {
    const caminho = gravarPrevia(criarEstado(cliente.dir), dia, cliente);
    log(`Dry-run. Email "${e.assunto}" não enviado, prévia em ${caminho}`);
    return null;
  }
  const id = await enviarEmail({
    chave: cliente.env.RESEND_API_KEY,
    de: cliente.env.RADAR_EMAIL_DE,
    para: destino || cliente.env.RADAR_EMAIL_PARA,
    assunto: e.assunto,
    html: e.html,
    texto: e.texto,
  });
  log(`Email enviado (${id}).`);
  return id;
}

// Interpreta uma resposta do dono. Devolve o texto a mandar no chat.
export async function responder(cliente, texto, { dryRun = false, log = console.log } = {}) {
  const T = textos(cliente.cfg.lingua);
  const estado = criarEstado(cliente.dir);
  const dia = estado.ultimoDia();
  const cmd = String(texto).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!dia || !dia.itens.length) return T.vazio;

  if (cmd === 'VER') {
    if (!dryRun) estado.gravarDia({ ...dia, respondido: 'VER' });
    return detalhes(dia.itens);
  }
  if (['EMAIL', 'E-MAIL', 'MAIL', 'CORREO'].includes(cmd)) {
    await enviarEmailDoDia(cliente, dia, { dryRun, log });
    if (!dryRun) estado.gravarDia({ ...dia, respondido: 'EMAIL' });
    return T.emailEnviado;
  }
  if (/^\d+$/.test(cmd)) {
    const it = dia.itens.find((i) => i.n === Number(cmd));
    return it ? detalheItem(it) : T.semItem(cmd);
  }
  return T.ajuda;
}

export async function escutar(cliente, { tg, dryRun = false, log = console.log }) {
  // getUpdates num bot que outro programa já lê rouba-lhe as mensagens. Não há como o
  // detetar com segurança, por isso quem instala confirma que o bot é só do radar.
  if (cliente.env.RADAR_BOT_DEDICADO !== 'sim') {
    throw new Error('O escutar só corre num bot dedicado ao radar. Se for o caso, ponha RADAR_BOT_DEDICADO=sim no .env. Se o bot já tem outro uso, não corra o escutar: use só o run e faça o seu bot chamar "radar ver" e "radar email".');
  }
  const estado = criarEstado(cliente.dir);
  const chatId = String(cliente.env.TELEGRAM_CHAT_ID || '');
  const { offset = 0 } = estado.ler('telegram.json', {});
  const updates = await tg.atualizacoes(offset);

  if (!chatId) {
    log('TELEGRAM_CHAT_ID vazio. Mensagens recebidas (copie o chat_id do dono para o .env):');
    for (const u of updates) {
      const m = u.message;
      if (m) log(`  chat_id ${m.chat.id}, de ${m.from?.first_name || '?'}, "${m.text || ''}"`);
    }
    return;
  }

  let novoOffset = offset;
  for (const u of updates) {
    novoOffset = u.update_id + 1;
    const m = u.message;
    if (!m?.text) continue;
    if (String(m.chat.id) !== chatId) { log(`Ignorada mensagem de outro chat (${m.chat.id}).`); continue; }
    const resposta = await responder(cliente, m.text, { dryRun, log });
    if (dryRun) log(`--- resposta a "${m.text}" ---\n${resposta}\n---`);
    else await tg.enviar(chatId, resposta);
  }
  if (!dryRun) estado.gravar('telegram.json', { offset: novoOffset });
}

export function ver(cliente, { data, n } = {}) {
  const estado = criarEstado(cliente.dir);
  const dia = data ? estado.lerDia(data) : estado.ultimoDia();
  if (!dia) return textos(cliente.cfg.lingua).vazio;
  if (n) {
    const it = dia.itens.find((i) => i.n === Number(n));
    return it ? detalheItem(it) : textos(cliente.cfg.lingua).semItem(n);
  }
  return `${dia.data}${dia.respondido ? ` (respondido ${dia.respondido})` : ''}\n\n${detalhes(dia.itens)}`;
}
