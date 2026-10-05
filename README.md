# AVID Golf website

A responsive, multi-page website for AVID Golf, an indoor golf simulator business in Winnipeg, Manitoba.

Live preview: https://avid-golf-homepage.riley847668.chatgpt.site

## Run locally

The website uses plain HTML, CSS and JavaScript. No package installation or build step is required.

From the repository root, run:

```sh
python3 -m http.server 4173 --directory dist
```

Then open http://localhost:4173 in your browser.

## Project layout

- `dist/` — the complete website, ready for static hosting.
- `dist/assets/` — photos, logos, and other image assets.
- `dist/content.js` — editable integration links, fitting brands, clinics, demo days, approved testimonials, league leaderboard, and weekly winners.
- `.openai/hosting.json` — configuration for the existing Sites deployment; contains no credentials.

Pages include Home, Hours & Pricing, Coaching & Clinics, Club Fittings, Memberships, League, Store, Our Technology, Events, Photo Gallery and Contact.

## Updating the website

Edit each page's HTML and its styles. Shared presentation and behaviour live in `style.css`, `pages.css`, `refresh.css`, `script.js`, `pages.js` and `refresh.js`; individual pages have additional styles and scripts.

To connect Toast gift cards, set `toastGiftCardUrl` in `dist/content.js`. Until then the existing gift-card checkout is used.

To display league standings, publish only the intended public standings tab from Google Sheets and put its embed URL in `leaderboardEmbedUrl`. Optionally add `leaderboardPublicUrl` and entries in `weeklyWinners`. Never put private spreadsheet links, credentials, or API keys into client-side files.

## Current content and behaviour

- Foresight Falcons are described as an upcoming upgrade, not as installed equipment.
- Coach portraits and information remain placeholders pending approved content.
- League details, clinics, demo days, testimonials and other unconfirmed content need owner approval before publication.
- Contact and event forms prepare an email for the visitor to review and send using their email application. They do not submit to a server, reserve dates, or send automatically.
- The homepage cinematic hero uses an AI-generated still image with CSS camera motion. It is not a swing video or a photograph of the actual AVID venue. Motion can be paused, and reduced-motion preferences are supported.
- Club inventory is currently handled by inquiry, not an online catalogue or checkout.

## Hosting

Publish the contents of `dist/` with a static host. The existing live preview is managed through Sites. Saving code to GitHub does not itself update that live deployment; there is no automatic GitHub deployment workflow configured here.

## Asset provenance

AVID brand and venue materials were supplied or sourced from the existing AVID website. Falcon and GSPro visuals were sourced from their official websites. The cinematic golfer image was generated for this design. Third-party brand assets remain subject to their owners' rights; this repository does not grant a separate redistribution licence.
