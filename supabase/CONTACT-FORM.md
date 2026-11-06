# Website form email setup (Resend + Supabase)

Two forms send straight to **info@avidgolf.club**:

- the **contact form** on the Contact page (**Send Message**);
- the **event inquiry form** on the Events page (**Send Inquiry**).

This is how it works:

1. A visitor submits either form.
2. The website sends it to one small Supabase Edge Function called `contact`, which handles both forms (code: [`functions/contact/index.ts`](functions/contact/index.ts)).
3. The function sends the email through Resend. **Reply** in your inbox goes straight to the visitor.

The Resend key stays secret inside Supabase and never appears in the website.

Until the steps below are done, both forms show a "didn't send" message, followed by the email address and phone number. Finish the setup **before** publishing the new Contact and Events pages.

## 1. Resend account and domain (about 10 minutes, then wait for DNS)

1. Sign up at [resend.com](https://resend.com). The free plan covers 3,000 emails a month (100 a day).
2. Go to **Domains → Add Domain** and enter `avidgolf.club`.
3. Resend lists a few DNS records (TXT and MX). Add them wherever the avidgolf.club DNS is managed (the domain registrar or host). They sit on a `send` subdomain and a `resend._domainkey` record, so they **don't affect your existing email**.
4. Click **Verify**. This usually takes a few minutes, but DNS can take a few hours.
5. Go to **API Keys → Create API Key**. Choose **Sending access**, limit it to `avidgolf.club`, and copy the key (starts with `re_`). It's only shown once.

## 2. Add the key to Supabase

In the same Supabase project the leaderboard uses:

1. Go to **Edge Functions → Secrets**.
2. Add `RESEND_API_KEY` and paste in the `re_...` key.

Optional secrets:

- `CONTACT_TO`: a different inbox for messages. The default is `info@avidgolf.club`. For more than one inbox, use a different address or set up forwarding.
- `EVENTS_TO`: a separate inbox for event inquiries only. The default is the same inbox as `CONTACT_TO`.
- `CONTACT_FROM`: who the email is "from". The default is `AVID Golf Website <website@avidgolf.club>`. It must be on the verified domain.

## 3. Deploy the function

**Option A: Supabase dashboard (no tools needed)**

1. Go to **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `contact`.
3. Replace the sample code with everything in [`functions/contact/index.ts`](functions/contact/index.ts) and click **Deploy**.
4. Open the function's **Details** (settings), turn **off "Verify JWT"** (also called "Enforce JWT verification"), and save.

**Option B: Supabase CLI**

```sh
supabase functions deploy contact --no-verify-jwt --project-ref brujexxxuvffmnormscx
```

JWT verification has to be off because the website uses the new `sb_publishable_` key, which isn't a JWT. The function checks its own input and only ever emails the AVID inbox.

## 4. Test it

Send a test from each form. Each should arrive at info@avidgolf.club within a minute:

- contact form: subject "Website inquiry — (name)";
- event form: subject "Event inquiry — (event type) — (date) — (name)", with every detail from the form listed in the email.

If it doesn't arrive:

- **Supabase → Edge Functions → contact → Logs** shows any error from Resend.
- **Resend → Emails** lists every send and whether it was delivered.
- Check the spam folder the first time, and mark the message "Not spam".
