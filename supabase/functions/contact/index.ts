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

type Email = { to: string; subject: string; text: string; html: string; replyTo: string };

// Visitor input goes into the HTML email, so it must be escaped.
const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A simple branded layout with inline styles, which is what email apps support.
// The plain text version is sent alongside it.
function htmlEmail(o: {
  heading: string;
  rows: [string, string][];
  noteLabel: string;
  note: string;
  name: string;
  email: string;
  subject: string;
  source: string;
}) {
  const font = 'Arial,Helvetica,sans-serif';
  const rows = o.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e4e8df;color:#60675f;font-size:14px;width:42%;vertical-align:top">${esc(k)}</td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e4e8df;color:#111613;font-size:14px;font-weight:bold;vertical-align:top">${esc(v)}</td></tr>`,
    )
    .join('');
  const replyLink = `mailto:${encodeURIComponent(o.email)}?subject=${encodeURIComponent('Re: ' + o.subject)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f6f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d4d8d0;border-radius:8px;font-family:${font}">
<tr><td style="padding:20px 28px;border-bottom:4px solid #4fdb39">
<img src="https://www.avidgolf.club/assets/logo.png" width="56" height="55" alt="AVID Golf" style="display:block;border:0">
</td></tr>
<tr><td style="padding:24px 28px 8px">
<p style="margin:0 0 4px;color:#078321;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${esc(o.source)} form</p>
<h1 style="margin:0 0 16px;color:#111613;font-size:22px;line-height:1.3">${esc(o.heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
</td></tr>
<tr><td style="padding:16px 28px 8px">
<p style="margin:0 0 8px;color:#60675f;font-size:14px">${esc(o.noteLabel)}</p>
<div style="background:#f1f5f0;border-left:4px solid #4fdb39;padding:14px 16px;color:#111613;font-size:15px;line-height:1.5">${esc(o.note).replace(/\n/g, '<br>')}</div>
</td></tr>
<tr><td style="padding:20px 28px 28px">
<a href="${replyLink}" style="display:inline-block;background:#078321;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:6px">Reply to ${esc(o.name)}</a>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e4e8df;color:#60675f;font-size:12px;line-height:1.5">
Sent from the ${esc(o.source.toLowerCase())} form at avidgolf.club. Replying to this email goes straight to ${esc(o.name)}.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function contactEmail(data: Record<string, unknown>): Email | string {
  const name = line(data.name, 100);
  const email = line(data.email, 200);
  const message = clean(data.message, 3000);
  if (!name || !message || !validEmail(email)) return 'Please fill in your name, a valid email and a message.';
  const subject = `Website inquiry — ${name}`;
  return {
    to: Deno.env.get('CONTACT_TO') || 'info@avidgolf.club',
    replyTo: email,
    subject,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}\n\n—\nSent from the contact form at avidgolf.club. Reply to this email to answer ${name} directly.`,
    html: htmlEmail({
      source: 'Contact',
      heading: `New message from ${name}`,
      rows: [['Name', name], ['Email', email]],
      noteLabel: 'Message',
      note: message,
      name,
      email,
      subject,
    }),
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
  const subject = `Event inquiry — ${f.eventType} — ${shortDate} — ${f.name}`;
  return {
    to: Deno.env.get('EVENTS_TO') || Deno.env.get('CONTACT_TO') || 'info@avidgolf.club',
    replyTo: f.email,
    subject,
    html: htmlEmail({
      source: 'Event',
      heading: `New event inquiry from ${f.name}`,
      rows,
      noteLabel: 'Other requests or details',
      note: f.details || 'None provided',
      name: f.name,
      email: f.email,
      subject,
    }),
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
      html: built.html,
    }),
  });

  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    return reply(502, { error: 'The message could not be sent.' });
  }
  return reply(200, { ok: true });
});
