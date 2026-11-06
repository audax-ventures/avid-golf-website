// Website forms -> email, sent through Resend.
// Handles the contact form and the event inquiry form ({ form: 'event' }).
// Secrets (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY  required
//   CONTACT_TO      optional, defaults to info@avidgolf.club
//   EVENTS_TO       optional, inbox for event inquiries, defaults to CONTACT_TO
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

// One-line fields: no line breaks, so they can't add fake lines to the email.
const line = (value: unknown, max: number) => clean(value, max).replace(/\s+/g, ' ');

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// "2026-12-12" -> "Saturday, December 12, 2026"
function prettyDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// "18:30" -> "6:30 PM"
function prettyTime(value: string) {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

type Email = { to: string; subject: string; text: string; replyTo: string };

function contactEmail(data: Record<string, unknown>): Email | string {
  const name = line(data.name, 100);
  const email = line(data.email, 200);
  const message = clean(data.message, 3000);
  if (!name || !message || !validEmail(email)) return 'Please fill in your name, a valid email and a message.';
  return {
    to: Deno.env.get('CONTACT_TO') || 'info@avidgolf.club',
    replyTo: email,
    subject: `Website inquiry — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}\n\n—\nSent from the contact form at avidgolf.club. Reply to this email to answer ${name} directly.`,
  };
}

function eventEmail(data: Record<string, unknown>): Email | string {
  const f = {
    name: line(data.name, 100),
    email: line(data.email, 200),
    phone: line(data.phone, 40),
    eventType: line(data.eventType, 60),
    date: line(data.date, 20),
    time: line(data.time, 10),
    guests: line(data.guests, 10),
    duration: line(data.duration, 40),
    rentals: line(data.rentals, 60),
    rentalHand: line(data.rentalHand, 60),
    food: line(data.food, 60),
    details: clean(data.details, 2500),
  };
  const required = [f.name, f.eventType, f.date, f.time, f.guests, f.duration, f.rentals, f.food];
  if (required.some((v) => !v) || !validEmail(f.email)) return 'Please fill in all the required fields.';

  const rows: [string, string][] = [
    ['Name', f.name],
    ['Email', f.email],
    ['Phone', f.phone || 'Not provided'],
    ['Event type', f.eventType],
    ['Preferred date', prettyDate(f.date)],
    ['Preferred time (Winnipeg)', prettyTime(f.time)],
    ['Number of guests', f.guests],
    ['Booking length', f.duration],
    ['Rental clubs', f.rentals],
    ['Rental club preference', f.rentals === 'No' ? 'Not needed' : f.rentalHand || 'Not specified'],
    ['Menu / food preorder', f.food],
  ];
  const shortDate = prettyDate(f.date).replace(/^\w+, /, '');
  return {
    to: Deno.env.get('EVENTS_TO') || Deno.env.get('CONTACT_TO') || 'info@avidgolf.club',
    replyTo: f.email,
    subject: `Event inquiry — ${f.eventType} — ${shortDate} — ${f.name}`,
    text:
      `New event inquiry from the website\n\n` +
      rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
      `\n\nOther requests or details:\n${f.details || 'None provided'}` +
      `\n\n—\nSent from the event form at avidgolf.club. Reply to this email to answer ${f.name} directly.`,
  };
}

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

  const built = data.form === 'event' ? eventEmail(data) : contactEmail(data);
  if (typeof built === 'string') return reply(400, { error: built });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return reply(500, { error: 'Email is not set up yet.' });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('CONTACT_FROM') || 'AVID Golf Website <website@avidgolf.club>',
      to: [built.to],
      reply_to: built.replyTo,
      subject: built.subject,
      text: built.text,
    }),
  });

  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    return reply(502, { error: 'The message could not be sent.' });
  }
  return reply(200, { ok: true });
});
