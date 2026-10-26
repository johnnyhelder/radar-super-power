// Email pelo Resend (HTTP direto, sem SDK).
// Plano grátis sem domínio: remetente onboarding@resend.dev, e o Resend só entrega
// no email da própria conta. Por isso o dono cria a conta com o email onde quer ler.

export const REMETENTE_GRATIS = 'Radar <onboarding@resend.dev>';

export async function enviarEmail({ chave, de, para, assunto, html, texto, fetchFn = fetch }) {
  if (!chave) throw new Error('Falta RESEND_API_KEY no .env do cliente.');
  if (!para) throw new Error('Falta RADAR_EMAIL_PARA no .env do cliente.');
  const r = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: de || REMETENTE_GRATIS, to: [para], subject: assunto, html, text: texto }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const dica = !de && r.status === 403
      ? ' No modo grátis sem domínio, RADAR_EMAIL_PARA tem de ser o email da conta do Resend.'
      : '';
    throw new Error(`Resend respondeu ${r.status}, ${json.message || 'sem detalhe'}.${dica}`);
  }
  return json.id;
}
