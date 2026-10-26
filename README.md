# radar-super-power

Radar de concorrentes e de mercado para pequenos negócios. Custa zero por mês.

> Versão 0.1, em laboratório com um bar de vinhos. Funciona, está testada, mas ainda está a ser afinada em uso real.

O radar não manda relatório. Todas as manhãs ele envia ao dono uma lista curta de títulos no Telegram e pergunta se ele quer ver aqui ou no email. O dono responde VER ou EMAIL e recebe só o que pediu. Nos dias sem novidade, não chega mensagem nenhuma.

Nasceu de um piloto real numa loja de semijoias em Portugal. O dado existia, mas a dona não lia os relatórios por email, porque empresário não tem tempo todo dia. A solução foi inverter o fluxo. O sistema recolhe em silêncio e só pergunta.

```
Bom dia, Ana! Espero que você esteja bem.

Preparei o radar de mercado de hoje, com 3 novidades.

Feiras com inscrições abertas
1. Mercado de Natal 2026 (cm-exemplo.pt)
2. Feira de Natal da Vila (mun-exemplo.pt)

Concorrentes
3. concorrente-a.pt · campanha promocional estendida até 30/10

Quer ver os detalhes? Responda VER para eu mostrar aqui, ou EMAIL para receber no seu email e ler quando tiver tempo. Se hoje não der, tudo bem, fica guardado.
```

## Quanto custa

Nada, se ficar dentro dos planos grátis. O radar foi desenhado para isso.

| Peça | Plano grátis | O que o radar usa |
|---|---|---|
| Firecrawl (monitores e juiz de IA) | 1.000 créditos por mês, renovam todo mês | O modelo de config gasta cerca de 410. O setup avisa acima de 900 e recusa acima de 1.000 |
| Resend (email) | 3.000 emails por mês, 100 por dia, sem domínio próprio | No máximo 1 email por dia |
| Telegram (bot) | Grátis | Uma mensagem por manhã com novidade, mais as respostas |
| Servidor | Qualquer máquina com Node 20 e cron (um PC ligado, uma VPS grátis) | Alguns segundos por dia |

A recolha não usa nenhuma API de IA paga. Quem decide o que é relevante é o juiz do próprio Firecrawl, que já está incluído no preço dos créditos.

## Como funciona

1. **Monitores (Firecrawl, agendado).** Páginas dos concorrentes e pesquisas na web. O juiz marca o que mudou de verdade.
2. **Recolha (cron, sem IA).** O `radar run` lê os resultados novos, filtra o que o juiz marcou, tira repetidos e guarda o resumo do dia.
3. **Pergunta (Telegram).** Lista numerada só com títulos.
4. **Entrega (a pedido).** O `radar escutar` lê a resposta e manda os detalhes no chat ou o email.

## Aula, do zero à primeira mensagem

### 1. Conta grátis no Firecrawl

Crie a conta em firecrawl.dev e copie a API key. Um negócio, uma conta, assim os 1.000 créditos são só dele.

### 2. Bot grátis no Telegram

No Telegram, abra o @BotFather, mande `/newbot`, escolha um nome e copie o token.

Use um bot **só para o radar** e ponha `RADAR_BOT_DEDICADO=sim` no `.env`. O radar lê as respostas com `getUpdates`, e dois programas a ler o mesmo bot roubam as mensagens um do outro. Sem essa linha, o `radar escutar` não corre. Se o bot tiver webhook, o radar também para e avisa. Ele nunca mexe no webhook.

**Já tem um bot que conversa com o dono?** Não ligue o `escutar` nele. Use o mesmo token só para o `radar run`, que apenas envia mensagens, e ensine o seu bot a responder ao VER e ao EMAIL chamando `radar ver` e `radar email`. Quem já usa um bot com o Claude Code só precisa de dizer isso ao Claude.

### 3. Conta grátis no Resend

Crie a conta em resend.com **com o email onde o dono quer ler o radar**. Em API Keys, crie uma chave com permissão "Sending access".

Sem domínio próprio, o Resend envia de `onboarding@resend.dev` e só entrega no email da própria conta. Para o radar isso chega, porque o email é sempre para o dono. Quem tiver domínio verificado preenche `RADAR_EMAIL_DE` e pode enviar para qualquer endereço.

### 4. Instalar

```bash
git clone <este repo> radar-super-power
cd radar-super-power
npm install
```

Os dados de cada negócio ficam **fora do repo**, numa pasta só dele.

```bash
mkdir -p ~/radar-clientes/padaria-exemplo
cp radar.config.example.yaml ~/radar-clientes/padaria-exemplo/radar.config.yaml
cp .env.example ~/radar-clientes/padaria-exemplo/.env
```

Preencha o `.env` com as três chaves e edite a config (concorrentes, pesquisas, país, língua). Com o Claude Code, basta descrever o negócio e pedir que ele proponha os concorrentes e as pesquisas.

### 5. Descobrir o chat_id do dono

O dono manda "oi" ao bot. Depois, com `TELEGRAM_CHAT_ID` ainda vazio, corra o comando abaixo.

```bash
bin/radar escutar --cliente ~/radar-clientes/padaria-exemplo
```

Ele mostra o `chat_id` de quem escreveu. Copie para o `.env`. A partir daí o radar só responde a esse chat.

### 6. Ver o custo antes de gastar

```bash
bin/radar setup --cliente ~/radar-clientes/padaria-exemplo
```

Sem `--confirmar`, o setup só simula. Mostra cada monitor, o corpo exato que vai mandar ao Firecrawl e a estimativa de créditos por mês. Quando estiver bom, repita com `--confirmar`. Depois de criar, ele mostra também a estimativa da própria API ao lado da nossa.

O setup é idempotente pelo nome (`radar:<pasta>:<secao>`). Correr de novo não duplica nada, só atualiza o objetivo se ele mudou. Em cada monitor ele desliga o email do próprio Firecrawl, para o dono não receber duas vezes.

### 7. Ensaio geral

```bash
bin/radar run --dry-run --cliente ~/radar-clientes/padaria-exemplo
```

Mostra a mensagem que seria enviada e grava a prévia do email em `estado/previa/`. Não envia nada e não mexe no estado. Na primeira vez, o radar considera os resultados dos últimos 7 dias, para o dono não começar com a lista vazia.

### 8. Ligar o cron

O cron de muitos servidores corre em UTC. Faça a conta da hora local. Exemplo para Portugal no horário de inverno, em que 09:30 em Lisboa = 09:30 UTC (no verão, 08:30 UTC).

```cron
30 9 * * *  cd ~/radar-super-power && bin/radar run --cliente ~/radar-clientes/padaria-exemplo >> ~/radar-clientes/padaria-exemplo/radar.log 2>&1
*/2 * * * * cd ~/radar-super-power && bin/radar escutar --cliente ~/radar-clientes/padaria-exemplo >> ~/radar-clientes/padaria-exemplo/radar.log 2>&1
```

O `escutar` a cada 2 minutos só fala com o Telegram, não gasta créditos do Firecrawl.

## Comandos

| Comando | O que faz |
|---|---|
| `radar setup` | Simula os monitores e mostra a estimativa de créditos |
| `radar setup --confirmar` | Cria ou atualiza os monitores (acima do orçamento pede `--aceito-custo`) |
| `radar run [--dry-run]` | Recolhe as novidades e envia a pergunta da manhã |
| `radar escutar [--dry-run]` | Lê as respostas do dono (VER, EMAIL ou o número de uma novidade) |
| `radar ver [N] [--data AAAA-MM-DD]` | Mostra os detalhes do último dia no terminal |
| `radar email [destino] [--dry-run]` | Envia o email do último dia |

Todos levam `--cliente <pasta>`.

## Escrever bons objetivos para o juiz

O piloto ensinou três coisas.

- **O juiz deixa passar ruído geográfico.** Num negócio português entraram feiras do Brasil. O setup já acrescenta "considerar só resultados de <país>" ao objetivo, e o `excluir_dominios` filtra de novo no código, porque o objetivo sozinho não chega.
- **O juiz às vezes escreve em inglês.** O setup acrescenta "escrever o motivo e o nome em <língua>".
- **As páginas mudam todo dia sem mudar nada.** Tokens de imagem e IDs de sessão aparecem como mudança. O radar só aceita o que o juiz marcou como relevante.

Um objetivo bom diz o que interessa e o detalhe que o dono precisa. "Alertar quando abrirem inscrições para expositores, com prazo e local" funciona melhor do que "feiras".

O segundo cliente, um bar de vinhos na Galiza, ensinou mais quatro.

- **O concorrente pequeno não tem site.** Bar, restaurante e loja de bairro vivem no Instagram. O radar não lê redes sociais (pedem login e proíbem raspagem, e o setup recusa esses links). Ponha o concorrente numa pesquisa com o nome e a cidade, que apanha o que sai dele na web (eventos, guias, notícias, posts indexados).
- **Há concorrentes com o mesmo nome.** A pesquisa pelo nome de um bar de vinhos trouxe uma loja com o mesmo nome noutra região do país. Confira cada site antes de o pôr na config e escreva no objetivo "ignorar negócios com o mesmo nome noutras regiões".
- **O país é largo demais para um negócio local.** Use `regiao` (por exemplo "Galiza, sobretudo Vigo e Pontevedra"). O setup escreve a região no objetivo em vez do país.
- **Não ponha o ano nas queries.** "feira do vinho 2026" fica velha em janeiro. A janela de pesquisa (7 dias nas semanais) já garante que só entra o que é recente.

A `lingua` é a de quem lê o radar, não a do mercado. Um dono brasileiro com clientes espanhóis usa `lingua: pt-BR` e escreve as queries em espanhol.

## Conta de créditos

Uma página custa até 2 créditos por verificação (leitura e juiz). Uma pesquisa custa cerca de 1 crédito por resultado por verificação. Exemplos com a regra do setup:

| Monitor | Frequência | Créditos por mês |
|---|---|---|
| 5 concorrentes | 3x semana | ~129 |
| 8 concorrentes | diário | ~480 |
| 2 queries × 10 resultados | semanal | ~86 |
| 3 queries × 15 resultados | semanal | ~194 |

É um teto. Quando a página não muda, o juiz não é cobrado.

## Limites da API

O cliente respeita cerca de 10 pedidos por minuto nas leituras e 2 a 3 por minuto ao criar monitores. Se o Firecrawl responder 429, ele espera o tempo pedido (ou 35 segundos) e tenta de novo, até 5 vezes.

## Arquivos de estado

Ficam em `<pasta-do-cliente>/estado/`, em JSON.

- `processados.json`, os checks já lidos de cada monitor
- `vistos.json`, as novidades já enviadas (guardadas 60 dias, para não repetir)
- `dias/AAAA-MM-DD.json`, as novidades de cada dia e se o dono respondeu
- `telegram.json`, a posição da leitura das respostas

## Licença

MIT. Use, copie e adapte à vontade.

## Testes

```bash
npm test
```
