// Utilitários dos testes: cliente fictício numa pasta temporária.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarCliente } from '../src/config.mjs';

export const CONFIG = `
negocio: Padaria Exemplo
nome_dono: Ana
pais: Portugal
lingua: pt-PT
excluir_dominios: [".br"]
hora_pergunta: "09:30"
concorrentes:
  frequencia: diario
  objetivo: Alertar sobre novos produtos, mudanças de preço e promoções.
  urls: [https://concorrente-a.pt, https://concorrente-b.pt/loja, https://c.pt, https://d.pt, https://e.pt, https://f.pt, https://g.pt, https://h.pt]
pesquisas:
  - secao: Feiras com inscrições abertas
    frequencia: semanal
    max_resultados: 15
    queries: ["feira de natal inscrições expositores 2026", "mercado de natal expositores", "feira artesanato inscrições"]
    objetivo: Alertar quando abrirem inscrições para expositores, com prazo e local.
    excluir: [padariaexemplo.pt]
`;

export function clienteFicticio(config = CONFIG, env = '') {
  const dir = mkdtempSync(join(tmpdir(), 'radar-teste-'));
  writeFileSync(join(dir, 'radar.config.yaml'), config);
  writeFileSync(join(dir, '.env'), env);
  return carregarCliente(dir);
}

export const pagina = {
  alerta: (url, chave, status = 'new') => ({
    url, status,
    metadata: { alertAction: 'alert', concept: 'Mercado de Natal 2026', rationale: 'Inscrições abertas até 15/11 — Vila Real.', eventKey: chave },
  }),
  mudou: (url, meaningful, after = 'Promo até 30/10') => ({
    url, status: 'changed',
    judgment: { meaningful, reason: 'campanha promocional estendida até 30/10', meaningfulChanges: [{ type: 'modified', before: 'x', after }] },
  }),
};

export function apiFalsa({ monitores, checks, detalhes }) {
  return {
    listarMonitores: async () => monitores,
    listarChecks: async (id) => checks[id] || [],
    lerCheck: async (id, checkId) => ({ id: checkId, pages: detalhes[checkId] || [] }),
  };
}
