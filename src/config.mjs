// Lê a pasta de um cliente: radar.config.yaml (sem segredos) + .env (segredos).
// O .env do cliente é a única fonte de chaves: não se usa process.env, para nunca
// gastar a chave de outra conta por engano.

import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import YAML from 'yaml';

export const LINGUAS = {
  'pt-PT': 'português de Portugal',
  'pt-BR': 'português do Brasil',
  es: 'espanhol',
};

const REDES = /^https?:\/\/([a-z0-9-]+\.)*(instagram|facebook|tiktok|x|twitter|threads)\.com\//i;

const FUSO_POR_PAIS = {
  portugal: 'Europe/Lisbon',
  espanha: 'Europe/Madrid',
  brasil: 'America/Sao_Paulo',
};

export function lerEnv(texto) {
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

// "diario", "3x semana", "semanal" → dias da semana do cron + verificações por mês.
export function lerFrequencia(texto) {
  const t = String(texto || 'semanal').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^diari/.test(t)) return { dias: '*', porMes: 30, janela: '24h' };
  if (/^semanal/.test(t)) return { dias: '1', porMes: 4.3, janela: '7d' };
  const m = t.match(/^(\d)\s*x\s*semana/);
  if (m) {
    const dias = { 1: '1', 2: '2,5', 3: '1,3,5', 4: '1,2,4,5', 5: '1-5', 6: '1-6', 7: '*' }[m[1]];
    if (dias) return { dias, porMes: Number(m[1]) * 4.3, janela: '7d' };
  }
  throw new Error(`Frequência desconhecida "${texto}". Use diario, semanal ou Nx semana (ex. 3x semana).`);
}

export function validar(cfg) {
  const erros = [];
  for (const campo of ['negocio', 'pais', 'lingua']) if (!cfg[campo]) erros.push(`falta "${campo}"`);
  if (cfg.lingua && !LINGUAS[cfg.lingua]) erros.push(`lingua "${cfg.lingua}" não suportada (use ${Object.keys(LINGUAS).join(', ')})`);
  const urls = cfg.concorrentes?.urls || [];
  const pesquisas = cfg.pesquisas || [];
  if (!urls.length && !pesquisas.length) erros.push('defina concorrentes.urls ou pelo menos uma pesquisa');
  if (urls.length && !cfg.concorrentes.objetivo) erros.push('concorrentes sem "objetivo"');
  // Redes sociais pedem login e proíbem raspagem: concorrente sem site vai numa pesquisa pelo nome.
  for (const u of urls) {
    if (REDES.test(u)) erros.push(`${u} é rede social; use uma pesquisa com o nome e a cidade do concorrente`);
  }
  pesquisas.forEach((p, i) => {
    if (!p.secao) erros.push(`pesquisa ${i + 1} sem "secao"`);
    if (!p.queries?.length) erros.push(`pesquisa ${i + 1} sem "queries"`);
    if (!p.objetivo) erros.push(`pesquisa ${i + 1} sem "objetivo"`);
  });
  if (cfg.concorrentes?.frequencia) lerFrequencia(cfg.concorrentes.frequencia);
  pesquisas.forEach((p) => lerFrequencia(p.frequencia));
  if (erros.length) throw new Error(`radar.config.yaml inválido: ${erros.join('; ')}`);
}

export function carregarCliente(pasta) {
  const dir = resolve(pasta);
  const caminhoCfg = join(dir, 'radar.config.yaml');
  if (!existsSync(caminhoCfg)) throw new Error(`Não encontrei ${caminhoCfg}`);
  const cfg = YAML.parse(readFileSync(caminhoCfg, 'utf8')) || {};
  validar(cfg);
  const caminhoEnv = join(dir, '.env');
  const env = existsSync(caminhoEnv) ? lerEnv(readFileSync(caminhoEnv, 'utf8')) : {};
  return {
    dir,
    slug: cfg.slug || basename(dir),
    cfg,
    env,
    fuso: cfg.fuso || FUSO_POR_PAIS[String(cfg.pais).toLowerCase()] || 'UTC',
    orcamento: cfg.orcamento_creditos ?? 1000,
  };
}
