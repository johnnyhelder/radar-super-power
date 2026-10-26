// Monta os monitores a partir da config, estima os créditos e cria/alterar no Firecrawl.
// Idempotente pelo nome "radar:<cliente>:<secao>". Sem confirmar, só simula.

import { lerFrequencia, LINGUAS } from './config.mjs';

export const SECAO_CONCORRENTES = 'Concorrentes';

// Estimativa calibrada com o piloto: página = 2 créditos por verificação (leitura + juiz),
// pesquisa = 1 crédito por resultado por verificação. É um teto: a API cobra menos
// quando não há mudanças para julgar.
export function estimar(monitor) {
  const { porMes } = monitor.frequencia;
  const alvo = monitor.corpo.targets[0];
  if (alvo.type === 'scrape') return Math.round(alvo.urls.length * porMes * 2);
  return Math.round(alvo.queries.length * alvo.maxResults * porMes);
}

function montarGoal(objetivo, cliente) {
  const { pais, regiao, lingua } = cliente.cfg;
  return `${objetivo.trim()} Considerar só resultados de ${regiao || pais}. Escrever o motivo e o nome em ${LINGUAS[lingua]}.`;
}

function montarAgenda(frequencia, cliente) {
  const [h] = String(cliente.cfg.hora_pergunta || '09:30').split(':').map(Number);
  const hora = Math.max(0, h - 3); // os monitores correm 3 h antes da pergunta
  return { cron: `0 ${hora} * * ${frequencia.dias}`, timezone: cliente.fuso };
}

const semPonto = (lista = []) => lista.filter((d) => !String(d).startsWith('.'));

export function montarMonitores(cliente) {
  const { cfg, slug } = cliente;
  const monitores = [];
  const base = { judgeEnabled: true, notification: { email: { enabled: false } } };

  if (cfg.concorrentes?.urls?.length) {
    const frequencia = lerFrequencia(cfg.concorrentes.frequencia || '3x semana');
    monitores.push({
      secao: SECAO_CONCORRENTES,
      monitorId: cfg.concorrentes.monitor_id,
      frequencia,
      corpo: {
        name: `radar:${slug}:${SECAO_CONCORRENTES}`,
        schedule: montarAgenda(frequencia, cliente),
        targets: [{ type: 'scrape', urls: cfg.concorrentes.urls }],
        goal: montarGoal(cfg.concorrentes.objetivo, cliente),
        ...base,
      },
    });
  }

  for (const p of cfg.pesquisas || []) {
    const frequencia = lerFrequencia(p.frequencia);
    const excluir = semPonto([...(cfg.excluir_dominios || []), ...(p.excluir || [])]);
    monitores.push({
      secao: p.secao,
      monitorId: p.monitor_id,
      frequencia,
      corpo: {
        name: `radar:${slug}:${p.secao}`,
        schedule: montarAgenda(frequencia, cliente),
        targets: [{
          type: 'search',
          queries: p.queries,
          maxResults: p.max_resultados || 10,
          searchWindow: frequencia.janela,
          ...(excluir.length ? { excludeDomains: excluir } : {}),
        }],
        goal: montarGoal(p.objetivo, cliente),
        ...base,
      },
    });
  }

  for (const m of monitores) m.estimativa = estimar(m);
  return monitores;
}

export async function executarSetup(cliente, { api, confirmar = false, aceitoCusto = false, log = console.log }) {
  const monitores = montarMonitores(cliente);
  const total = monitores.reduce((s, m) => s + m.estimativa, 0);

  log(`Cliente ${cliente.slug}, ${monitores.length} monitores`);
  for (const m of monitores) log(`  ${m.corpo.name.padEnd(48)} ~${String(m.estimativa).padStart(4)} créditos/mês`);
  log(`  Total estimado ~${total} créditos/mês (orçamento ${cliente.orcamento})`);

  if (total > cliente.orcamento) {
    log(`AVISO: passa do orçamento de ${cliente.orcamento} créditos/mês (o plano grátis do Firecrawl tem 1.000).`);
    if (confirmar && !aceitoCusto) throw new Error('Nada criado. Reduza a config ou use --aceito-custo.');
  } else if (total > cliente.orcamento * 0.9) {
    log('AVISO: acima de 90% do orçamento, pouca folga para afinar.');
  }

  const existentes = api ? await api.listarMonitores() : null;
  if (!existentes) log('Sem FIRECRAWL_API_KEY: não consultei os monitores que já existem.');
  const porNome = new Map((existentes || []).map((m) => [m.name, m]));
  const porId = new Map((existentes || []).map((m) => [m.id, m]));

  const plano = monitores.map((m) => {
    const atual = m.monitorId ? porId.get(m.monitorId) : porNome.get(m.corpo.name);
    if (m.monitorId) return { m, acao: 'usar existente', atual };
    if (!atual) return { m, acao: 'criar' };
    if (atual.goal !== m.corpo.goal || atual.notification?.email?.enabled) return { m, acao: 'alterar', atual };
    return { m, acao: 'igual', atual };
  });

  for (const { m, acao, atual } of plano) {
    log(`\n[${acao}] ${m.corpo.name}${atual ? ` (${atual.id})` : ''}`);
    if (acao === 'criar') log(JSON.stringify(m.corpo, null, 2));
    if (acao === 'alterar') log(JSON.stringify({ goal: m.corpo.goal, notification: m.corpo.notification }, null, 2));
    if (atual && acao !== 'criar' && JSON.stringify(atual.targets?.map(limparAlvo)) !== JSON.stringify(m.corpo.targets.map(limparAlvo))) {
      log('  Os alvos (urls ou queries) mudaram. O PATCH não os altera: apague o monitor no painel e corra o setup de novo.');
    }
  }

  if (!confirmar) {
    log('\nSimulação. Nada foi criado nem alterado. Para aplicar, repita com --confirmar.');
    return { total, plano, aplicado: false };
  }

  for (const item of plano) {
    if (item.acao === 'criar') {
      const criado = await api.criarMonitor(item.m.corpo);
      log(`Criado ${criado.name} (${criado.id}). Estimativa da API ${criado.estimatedCreditsPerMonth ?? '?'} créditos/mês, a nossa ~${item.m.estimativa}.`);
    } else if (item.acao === 'alterar') {
      await api.alterarMonitor(item.atual.id, { goal: item.m.corpo.goal, notification: item.m.corpo.notification });
      log(`Alterado ${item.m.corpo.name}.`);
    }
  }
  return { total, plano, aplicado: true };
}

// Compara só o que vem da config (a API acrescenta ids e opções por defeito).
function limparAlvo(t) {
  return t.type === 'scrape' ? { type: t.type, urls: t.urls } : { type: t.type, queries: t.queries };
}
