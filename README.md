# UGEC Canada website

Node.js + Express + SQLite. One server serves the public website, the JSON API and the admin panel.
Pages are built on the server (so search engines and link previews see them) and then run in the browser.

```
server/            API, auth, database, SEO, email, backups
  index.js         entry point (security headers, routes, server rendering, sitemap)
  render.js        builds each page on the server with the same templates and page code as the browser
  content.js       reads the public site content (settings, programs, posts, team) from the database
  db.js            the database: MySQL on GoDaddy, SQLite on your computer (tables auto-created)
  async.js         lets routes wait for the database safely
  seed.js          starter content (only runs on an empty database)
  resources.js     what the admin can edit (add a field here and it appears in admin)
  uploads.js       photos and logos uploaded in admin (stored in data/uploads/)
  backup.js        automatic daily backups (data/backups/)
  mailer.js        lead alerts and confirmation emails (needs SMTP settings)
  routes/public.js public API + lead capture
  routes/admin.js  admin API (login, users, activity, CRUD, leads, CSV export, settings, uploads, backups)
public/            the website (no build step; plain ES modules)
  index.html       page shell
  css/site.css     styles
  fonts/           the two site fonts (served from here, not Google)
  templates/       ALL the page HTML, in plain .html files (edit these to change what pages say or look like)
    pages/         one file per page: home, about, already, book, program, partner, contact, blog, post, legal
    components/    pieces used on several pages: logo, header menu, footer, book menu, forms, program cards
    legal/         the text of each legal page
  js/main.js       entry point: loads data and templates, takes over the page the server sent
  js/router.js     moves between pages in the browser
  js/events.js     clicks, dropdowns, form submit
  js/core/         pages.js (which URL shows which page), state, settings (menu, booking types), helpers,
                   template engine (tpl.js), referral capture
  js/components/   prepare data for the shared templates (forms, program cards, filter chips, header/footer)
  js/pages/        one small file per page that prepares the data its template shows
public/admin/      the admin panel at /admin
scripts/package-godaddy.js   builds ugec-godaddy.zip for GoDaddy (npm run package)
data/ugec.db       the local database (on GoDaddy: MySQL)
data/uploads/      photos and logos uploaded in admin
data/backups/      automatic daily backups (created on first start)
```

## Run locally
```
npm install
# create a .env file with SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start                # http://localhost:3000   admin: /admin
```
Requires Node 20+. The first start creates the database, loads the starter programs, forms, team and
posts, and creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. After that, change the password in
Admin > Account and remove `ADMIN_PASSWORD` from `.env`.

## What the team can do in /admin
- **Leads**: view, search, filter, set status, add notes, delete, **Export CSV**.
- **Programs**: add, edit, remove, unpublish; update fees, intakes, provider, and every field on the program page.
- **Colleges / providers**, **Blog**, **Team**: add and edit. Team photos are uploaded in the Team editor.
- **Forms**: turn forms on or off, add, remove, reorder and edit the questions (label, type of answer, required,
  dropdown choices), set a notification email per form.
- **Site settings**: logo (header and footer of every page) and its size (slider with a live header preview), site icon, link preview image, home and About page photos,
  announcement banner, contact details, Stripe booking link, immigration professional and licence number, confirmation
  emails, province and category text. The Email box at the top shows whether email is set up and sends a test email.
- **Admin users**: give each team member their own login, remove a login, see recent activity (who changed what),
  download a backup.

Lists such as the FAQ, client stories, category descriptions and form questions are edited as separate boxes
(Add, Remove, move up and down), so nobody needs to type JSON. To add a new kind of list, describe its boxes with `LIST(...)`
in `server/resources.js`. A dropdown question can take its choices from the programs list.

## Lead emails
Without email settings, leads are saved in Admin > Leads but nobody is emailed. To turn email on, add your email
provider's SMTP details to `.env`, restart, then use Admin > Site settings > "Send a test
email to me". Once it works:
- each new lead is emailed to `NOTIFY_EMAIL` (or the form's own address in Admin > Forms, or the contact email);
  replying to that email replies to the person who sent the form;
- the person gets a short "we received your request" email (switch off in Site settings).

## Referral partners and commission tracking
1. Admin > **Referral partners** > Add. Each partner gets a code (for example `SITASHARMA`) and a link: `https://ugec.ca/?ref=SITASHARMA`.
2. "Show in the Who referred you? list" decides whether the name appears in the public dropdown. Leave it off for partners
   who should only be credited through their own link.
3. Every client form (except the institution partner form) asks **Who referred you?** The client picks a partner, picks
   "Someone else" and types a name, or arrives through a link (the code is remembered in their browser for 30 days).
4. Admin > **Referrals** shows each partner's leads, bookings, applications, enrolments and commission totals (pending, approved, paid).
   Open a lead (Admin > Leads) to confirm or change the partner, set the commission status and amount (CAD), and export to CSV.
5. Partners who have referred leads cannot be deleted; untick Active to stop new referrals while keeping the history.

6. **Referral partner portal** (`/referral-portal`, linked in the footer): partners have their **own sign-in**, separate
   from the admin panel, and see only their own referrals: first name and last initial, date, what they asked about,
   each person's progress (Received, Contacted, Consultation booked, Applied, Enrolled, or Closed, from the lead status)
   and their commission. Never contact details or messages. To give a partner access: add their email in
   Admin > Referral partners, then Admin > Referrals > **Send sign-in invite**. They get a link (valid 7 days, one use) to
   choose their own password; it is emailed if email is set up, and shown so you can also send it yourself. The same
   button sends a password reset; partners can also use "Forgot your password?" (needs email). Untick "Can sign in to the
   referral partner portal" on a partner to remove access; changing a password signs out their other devices.

Commission is tracked, not calculated or paid by the system, and the Stripe consultation payment is not linked to leads.
Treat client-picked referrals as claims to verify before approving a commission.

## Editing the site
- Change what a page says or how it is laid out: edit its file in `public/templates/pages/` (plain HTML).
  Shared pieces (logo, footer, menus, forms, program cards) are in `public/templates/components/`; legal text is in `public/templates/legal/`.
- Template placeholders: `{{name}}` inserts a value, `{{#if name}}...{{else}}...{{/if}}` shows a part only when it is set,
  `{{#each list}}...{{/each}}` repeats for each item, `{{> components/name}}` includes another template, `{{!-- note --}}` is a comment.
  Values available everywhere include `{{site.email}}`, `{{site.phoneDisplay}}`, `{{site.location}}` and `{{waGeneral}}` (WhatsApp link).
- Change the menu, booking types or disclaimer: `public/js/core/config.js`.
- Add a page: create `templates/pages/<name>.html` and `js/pages/<name>.js` (returns `t('pages/<name>', data)`), add it to
  `js/core/pages.js`, and add a title in `server/seo.js` so search engines see it.
- The files in `js/pages/`, `js/components/` and `js/core/` (except router, events, main, referral) also run on the server,
  so they must not use `window` or `document`.
- If a template has a mistake (for example a missing `{{/if}}`), the page shows "Something went wrong" and the browser console
  (F12 > Console) or the server window names the file and the problem.
- No build step is needed: refresh the browser after saving. Templates are re-read on every request while developing;
  after changing a `.js` file, restart (or use `npm run dev`, which restarts automatically).

## Site map
`/` Home, `/about`, `/pr-leading-courses` (all programs, filter by province and category; `/already-in-canada` redirects here), `/educational-assistance`, `/immigration-assistance`, `/programs/<slug>`,
`/book-consultation?type=educational|already|trades|immigration` (one page, the form changes with the type),
`/partner-with-us`, `/blog`, `/contact`, `/legal/<page>`. Old URLs (`/study-in-canada`, `/educational-consultation`,
`/immigration-consultation`) redirect automatically. The booking types are listed in `BOOKING` at the top of `public/js/core/config.js`;
each type uses the form of the same key in Admin > Forms.

## Deploy
**GoDaddy (what UGEC uses):** `npm run package` and upload `ugec-godaddy.zip` to GoDaddy Node.js Hosting (or connect the app
to this GitHub repo), turn on its MySQL database and set `NODE_ENV=production`, `SESSION_SECRET`, `SITE_URL`, `ADMIN_EMAIL`
and `ADMIN_PASSWORD`. Do not add SMTP settings there: GoDaddy blocks outside email and the site uses its email service.

### Which database
- **MySQL** when `DB_HOST` is set (GoDaddy sets `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` itself).
  Uploaded photos then go to `public/assets/uploads` (the folder GoDaddy keeps), email goes through GoDaddy's email
  service, and backups are downloaded from Admin > Admin users.
- **SQLite** otherwise: one file, `data/ugec.db`. Used locally, nothing to install. Automatic daily backups.
Both create their tables on first start. All queries go through `server/db.js` (`db.get`, `db.all`, `db.run`), written
so they work on both.

### Other hosts
Any host that runs Node and keeps a **persistent disk** works (Render, Railway, Fly.io, a VPS).
1. Set env vars: `NODE_ENV=production`, `SESSION_SECRET` (long random), `SITE_URL=https://ugec.ca`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DB_PATH` pointing at the persistent disk (for example `/var/data/ugec.db`).
   Uploads and backups are kept in folders next to the database, so they are on that disk too.
2. Start command: `npm start`. Serve over HTTPS (the host usually does this); cookies are `Secure` in production.
3. Point the `ugec.ca` DNS at the host. Submit `https://ugec.ca/sitemap.xml` in Google Search Console.
4. Backups: a copy of the database is made automatically every day (latest 14 kept, see `BACKUP_DIR` / `BACKUP_KEEP`) and
   every uploaded photo is copied too. They live on the same disk as the site, so also use Admin > Admin users >
   "Download a backup now" regularly and keep the file somewhere else.

## Security notes
Passwords are hashed with scrypt; sessions are signed, HttpOnly, SameSite=Strict cookies; login and form
submissions are rate limited; forms have a honeypot; uploads are checked to be real images; the CSV export neutralises
spreadsheet formulas; all output is HTML-escaped; a strict Content-Security-Policy is set. Each admin has their own login
and changes are recorded in the activity log. Leads contain personal information: give admin access only to people who
need it, remove logins when someone leaves, and follow your privacy policy for retention.

## Before launch
- Verify every program, fee and guarantee with the institution.
- Add the RCIC licence number in Site settings. Replace the sample blog posts and have the legal pages reviewed.
- Set up email (see "Lead emails") so new leads reach the team.
- Add real photos and the logo. Team photos: Admin > Team > Edit > Upload. Logo, site icon, link preview image, home page
  hero photo and About page photo: Admin > Site settings > Upload.
