// Estado em arquivos JSON dentro de <cliente>/estado/. Escrita atómica (tmp + rename).

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const DIAS_VISTOS = 60;

export function criarEstado(dirCliente) {
  const base = join(dirCliente, 'estado');
  const caminho = (nome) => join(base, nome);

  function ler(nome, padrao) {
    const c = caminho(nome);
    return existsSync(c) ? JSON.parse(readFileSync(c, 'utf8')) : padrao;
  }

  function gravar(nome, valor) {
    const c = caminho(nome);
    mkdirSync(dirname(c), { recursive: true });
    writeFileSync(`${c}.tmp`, JSON.stringify(valor, null, 2) + '\n');
    renameSync(`${c}.tmp`, c);
  }

  return {
    base,
    ler,
    gravar,
    lerDia: (data) => ler(`dias/${data}.json`, null),
    gravarDia: (dia) => gravar(`dias/${dia.data}.json`, dia),
    ultimoDia() {
      const pasta = caminho('dias');
      if (!existsSync(pasta)) return null;
      const datas = readdirSync(pasta).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      return datas.length ? ler(`dias/${datas.at(-1)}`, null) : null;
    },
  };
}

export function podarVistos(vistos, agora = new Date()) {
  const limite = agora.getTime() - DIAS_VISTOS * 86400000;
  return Object.fromEntries(Object.entries(vistos).filter(([, d]) => new Date(d).getTime() >= limite));
}

// Data local do cliente (AAAA-MM-DD) no fuso dele.
export function dataLocal(agora, fuso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}
