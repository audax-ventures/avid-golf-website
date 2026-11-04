// Contact form -> email, sent through Resend.
// Secrets (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY  required
//   CONTACT_TO      optional, defaults to info@avidgolf.club
//   CONTACT_FROM    optional, defaults to "AVID Golf Website <website@avidgolf.club>"
//                   (the domain must be verified in Resend)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request' });
  }

  // Hidden field that people never see. Bots that fill it get a quiet "ok".
  if (clean(data.website, 200)) return reply(200, { ok: true });

  const name = clean(data.name, 100).replace(/\s+/g, ' ');
  const email = clean(data.email, 200);
  const message = clean(data.message, 3000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(400, { error: 'Please fill in your name, a valid email and a message.' });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return reply(500, { error: 'Email is not set up yet.' });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('CONTACT_FROM') || 'AVID Golf Website <website@avidgolf.club>',
      to: [Deno.env.get('CONTACT_TO') || 'info@avidgolf.club'],
      reply_to: email,
      subject: `Website inquiry — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}\n\n—\nSent from the contact form at avidgolf.club. Reply to this email to answer ${name} directly.`,
    }),
  });

  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    return reply(502, { error: 'The message could not be sent.' });
  }
  return reply(200, { ok: true });
});
