// Checks novos dos monitores → itens normalizados. Sem IA: a decisão é do juiz do Firecrawl.

import { montarMonitores } from './setup.mjs';

const SETE_DIAS = 7 * 86400000;

export function site(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return String(url); }
}

// ".br" exclui o TLD inteiro; "exemplo.pt" exclui o domínio e os subdomínios.
export function dominioExcluido(url, lista = []) {
  const h = site(url).toLowerCase();
  return lista.some((d) => {
    d = String(d).toLowerCase().replace(/^www\./, '');
    return d.startsWith('.') ? h.endsWith(d) : h === d || h.endsWith(`.${d}`);
  });
}

// O juiz às vezes escreve travessões; nos textos para o dono não entram.
const limpar = (t) => String(t || '').replace(/\s*[—–]\s*/g, ', ').trim();

export function novidade(p, secao, { primeiraVez = false, excluir = [] } = {}) {
  const m = p.metadata || {};
  if (dominioExcluido(p.url, excluir)) return null;
  if (m.alertAction === 'alert' && (p.status === 'new' || primeiraVez)) {
    return {
      chave: m.eventKey || p.url,
      secao,
      titulo: `${limpar(m.concept) || site(p.url)} (${site(p.url)})`,
      resumo: limpar(m.rationale),
      url: p.url,
      publicadoEm: m.publishedAt || null,
    };
  }
  if (p.status === 'changed' && p.judgment?.meaningful) {
    const motivo = limpar(p.judgment.reason);
    const depois = p.judgment.meaningfulChanges?.[0]?.after || motivo;
    return {
      chave: `${p.url}#${String(depois).slice(0, 200)}`,
      secao,
      titulo: `${site(p.url)} · ${motivo}`,
      resumo: motivo,
      url: p.url,
      publicadoEm: null,
    };
  }
  return null;
}

// Devolve os itens novos e o estado atualizado, sem gravar nada (quem chama decide).
export async function recolher(cliente, { api, processados = {}, vistos = {}, agora = new Date(), log = () => {} }) {
  const excluir = cliente.cfg.excluir_dominios || [];
  const monitores = montarMonitores(cliente);
  const existentes = await api.listarMonitores();
  const porNome = new Map(existentes.map((m) => [m.name, m.id]));

  const itens = [];
  const novosProcessados = { ...processados };
  const novosVistos = { ...vistos };

  for (const mon of monitores) {
    const id = mon.monitorId || porNome.get(mon.corpo.name);
    if (!id) { log(`Monitor "${mon.corpo.name}" não existe no Firecrawl, corra o setup.`); continue; }
    const pesquisa = (cliente.cfg.pesquisas || []).find((p) => p.secao === mon.secao);
    const excluirSecao = [...excluir, ...(pesquisa?.excluir || [])];

    const primeiraVez = !processados[id];
    const jaLidos = new Set(processados[id] || []);
    const terminados = (await api.listarChecks(id, 10))
      .filter((c) => c.finishedAt && !['queued', 'running'].includes(c.status))
      .filter((c) => !jaLidos.has(c.id))
      .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
    // Na primeira vez, os checks com mais de 7 dias ficam marcados como lidos sem entrar.
    const checks = terminados.filter((c) => !primeiraVez || agora - new Date(c.finishedAt) <= SETE_DIAS);
    for (const c of terminados) if (!checks.includes(c)) jaLidos.add(c.id);

    for (const c of checks) {
      const detalhe = await api.lerCheck(id, c.id);
      for (const p of detalhe.pages || []) {
        const item = novidade(p, mon.secao, { primeiraVez, excluir: excluirSecao });
        if (!item || novosVistos[item.chave]) continue;
        novosVistos[item.chave] = agora.toISOString();
        itens.push(item);
      }
      jaLidos.add(c.id);
    }
    // Guarda só os últimos 50 ids por monitor: a API lista 10 de cada vez.
    novosProcessados[id] = [...jaLidos].slice(-50);
  }
  return { itens, processados: novosProcessados, vistos: novosVistos };
}
