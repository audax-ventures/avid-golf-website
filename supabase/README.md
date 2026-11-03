# League leaderboard setup (Supabase)

The live leaderboard on `league.html` and the admin page at `/league-admin` store their data in Supabase. Setup takes about 10 minutes and only needs doing once.

Until these steps are done, the League page keeps showing its "A fresh season" placeholder, so nothing breaks in the meantime.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a new project (Free plan). Choose the **Canada (Central)** region.
2. Save the database password somewhere safe. The website doesn't use it, but Supabase asks for it.

## 2. Create the tables

1. In the project, open **SQL Editor** and choose **New query**.
2. Paste in everything from [`schema.sql`](schema.sql) and click **Run**.

It's safe to run again later if the file is updated.

## 3. Lock down sign-ups and create the admin login

1. Go to **Authentication → Sign In / Providers**. Make sure **Email** is on, and turn **off** "Allow new users to sign up". Only accounts you create can log in.
2. Go to **Authentication → Users → Add user → Create new user**. Enter the admin's email and a password, and tick **Auto Confirm User**.
3. Back in **SQL Editor**, run this with the admin's email to give that account admin rights:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'admin@example.com';
   ```

Repeat steps 2 and 3 for each extra admin. To remove an admin, delete their user under **Authentication → Users**.

## 4. Allow password-reset links

Go to **Authentication → URL Configuration**:

- **Site URL**: the website address, e.g. `https://avidgolf.club`
- **Redirect URLs**: add `https://avidgolf.club/league-admin`

Use the real domain. Without this step, the "Forgot password?" email won't bring the admin back to the admin page.

## 5. Connect the website

1. Go to **Project Settings → API Keys**. Copy the **Publishable key** (starts with `sb_publishable_`). The older **anon public** key also works.
2. Go to **Project Settings → Data API** (or the project's **Connect** button) and copy the **Project URL** (`https://xxxx.supabase.co`).
3. In `dist/content.js`, fill in:

   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'sb_publishable_...',
   ```

4. Commit and deploy.

These two values are meant to be public. The database rules from `schema.sql` are what stop anyone except admins from changing data. **Never** put the `service_role` or secret key in the website.

## Using it

- **Admin page:** `/league-admin`. It isn't linked anywhere on the site, and search engines are told not to list it.
- **Preview with sample data:** add `?preview=demo` to the League page address, e.g. `/league?preview=demo#standings`.
- **Season order:** create the season (it comes with 16 weeks) → add courses under *Weeks & courses* → add leagues and teams → enter scores → turn the week to **Live** when it's ready to show.
- **Flights:** add flights to a league and assign teams whenever you're ready. Until at least one team is in a flight, the site shows a single leaderboard for that league.
- **Playoff race:** the leaderboard's "Playoff race" view counts each team's lowest 10 weekly scores. The number is changeable under *Season settings*.

## Free plan note

Supabase pauses free projects after 7 days with no activity. During the season, weekly score entry and visitors keep it awake. If it does pause in the off-season, click **Restore** in the Supabase dashboard; no data is lost.
