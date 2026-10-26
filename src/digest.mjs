// Textos para o dono: a pergunta da manhã (só títulos), os detalhes (VER) e o email.
// Regras de estilo: sem travessão e o mínimo de dois-pontos.

const TEXTOS = {
  pt: {
    ola: (nome) => (nome ? `Bom dia, ${nome}! Espero que você esteja bem.` : 'Bom dia! Espero que você esteja bem.'),
    abertura: (n) => `Preparei o radar de mercado de hoje, com ${n} ${n === 1 ? 'novidade' : 'novidades'}.`,
    fecho: 'Quer ver os detalhes? Responda VER para eu mostrar aqui, ou EMAIL para receber no seu email e ler quando tiver tempo. Se hoje não der, tudo bem, fica guardado.',
    mais: (n) => `E mais ${n} no detalhe.`,
    ajuda: 'Responda VER para ver os detalhes aqui, EMAIL para receber no email, ou o número de uma novidade.',
    vazio: 'Ainda não há novidades guardadas.',
    semItem: (n) => `Não encontrei a novidade ${n}.`,
    emailEnviado: 'Enviei para o seu email.',
    assunto: (data, n) => `Radar de mercado de ${data} (${n} ${n === 1 ? 'novidade' : 'novidades'})`,
    tituloEmail: 'Radar de mercado',
    abrir: 'Abrir',
  },
  es: {
    ola: (nome) => (nome ? `¡Buenos días, ${nome}! Espero que se encuentre bien.` : '¡Buenos días! Espero que se encuentre bien.'),
    abertura: (n) => `He preparado el radar de mercado de hoy, con ${n} ${n === 1 ? 'novedad' : 'novedades'}.`,
    fecho: '¿Quiere ver los detalles? Responda VER para mostrarlos aquí, o EMAIL para recibirlos en su correo y leerlos cuando tenga tiempo. Si hoy no puede, no pasa nada, queda guardado.',
    mais: (n) => `Y ${n} más en el detalle.`,
    ajuda: 'Responda VER para ver los detalles aquí, EMAIL para recibirlos en su correo, o el número de una novedad.',
    vazio: 'Todavía no hay novedades guardadas.',
    semItem: (n) => `No encontré la novedad ${n}.`,
    emailEnviado: 'Se lo he enviado a su correo.',
    assunto: (data, n) => `Radar de mercado del ${data} (${n} ${n === 1 ? 'novedad' : 'novedades'})`,
    tituloEmail: 'Radar de mercado',
    abrir: 'Abrir',
  },
};

export const textos = (lingua) => (lingua === 'es' ? TEXTOS.es : TEXTOS.pt);

const MAX_TITULO = 140;
const MAX_MENSAGEM = 3800;
const curto = (t) => (t.length > MAX_TITULO ? `${t.slice(0, MAX_TITULO - 1)}…` : t);

function porSecao(itens) {
  const grupos = new Map();
  for (const it of itens) {
    if (!grupos.has(it.secao)) grupos.set(it.secao, []);
    grupos.get(it.secao).push(it);
  }
  return grupos;
}

// itens já numerados (campo n).
export function mensagemManha(itens, cfg) {
  const T = textos(cfg.lingua);
  const cabeca = [T.ola(cfg.nome_dono), '', T.abertura(itens.length)];
  const fim = ['', T.fecho];
  const corpo = [];
  let usados = 0;
  for (const [secao, lista] of porSecao(itens)) {
    const bloco = ['', secao, ...lista.map((it) => `${it.n}. ${curto(it.titulo)}`)];
    const tamanho = [...cabeca, ...corpo, ...bloco, ...fim].join('\n').length;
    if (tamanho > MAX_MENSAGEM) break;
    corpo.push(...bloco);
    usados += lista.length;
  }
  if (usados < itens.length) corpo.push('', T.mais(itens.length - usados));
  return [...cabeca, ...corpo, ...fim].join('\n');
}

export function detalheItem(it) {
  return [`${it.n}. ${it.titulo}`, it.resumo, it.url].filter(Boolean).join('\n');
}

export function detalhes(itens) {
  const linhas = [];
  for (const [secao, lista] of porSecao(itens)) {
    linhas.push(secao.toUpperCase(), '');
    for (const it of lista) linhas.push(detalheItem(it), '');
  }
  return linhas.join('\n').trim();
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function email(dia, cfg) {
  const T = textos(cfg.lingua);
  const secoes = [...porSecao(dia.itens)].map(([secao, lista]) => `
    <h2 style="font-size:16px;margin:28px 0 8px;color:#0B7A75">${esc(secao)}</h2>
    ${lista.map((it) => `
    <div style="margin:0 0 16px">
      <div style="font-weight:600">${it.n}. ${esc(it.titulo)}</div>
      ${it.resumo ? `<div style="color:#33505C;margin-top:4px">${esc(it.resumo)}</div>` : ''}
      <a href="${esc(it.url)}" style="color:#0B7A75">${T.abrir}</a>
    </div>`).join('')}`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#F3F6F7">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#12242E;background:#FFFFFF">
    <h1 style="font-size:20px;margin:0 0 4px">${T.tituloEmail}</h1>
    <div style="color:#55707C">${esc(cfg.negocio)} · ${esc(dia.data)}</div>
    ${secoes}
  </div></body></html>`;
  return {
    assunto: T.assunto(dia.data, dia.itens.length),
    html,
    texto: detalhes(dia.itens),
  };
}
