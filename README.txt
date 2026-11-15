RECURRING CHARGES TRACKER
=========================

A simple recurring charge organizer that shows one button per charge with the
next due date. Tap a charge to view its amount, payment source, frequency,
notes, and next due date. You can add, edit, delete, export, and import charges.

No financial accounts are connected. No monthly or yearly spending totals.

PUBLISH TO GITHUB PAGES (no build step required)
------------------------------------------------
1. Create a new PUBLIC GitHub repository, e.g. recurring-charges.
2. Upload ALL files and the icons folder in this ZIP to the ROOT of the repo.
   Keep index.html, app.js, style.css, sw.js, and manifest.webmanifest together.
3. Open Settings > Pages in the repository.
4. Under Build and deployment, choose Deploy from a branch.
5. Choose main and /(root), then Save.
6. Open the site URL supplied by GitHub Pages after deployment.
   A project site typically looks like:
   https://YOUR-USERNAME.github.io/recurring-charges/
7. On your phone or iPad, open the site in the browser and use the browser's
   Add to Home Screen / Install App option.

FOR TESTING ON WINDOWS
----------------------
You can open index.html locally to try most features. For installation as a
web app, service worker, and reliable offline mode, publish to HTTPS via
GitHub Pages or run a local development server.

IMPORTANT: YOUR DATA
--------------------
Your entries are stored in each browser's local storage. They do NOT sync
between your PC, iPad, and Android phone automatically. The GitHub repository
only holds the app code, NOT your personal charges.

Use 'Back up or transfer your charges' > Download Backup to save a JSON file,
and Import Backup on another device. Import REPLACES existing entries on that
device. Do not clear browser site data without saving a backup first.

An automatic secure Supabase syncing feature can be added later.
Avoid entering complete bank account numbers or credit card numbers.

DUE DATE RULES
--------------
The date entered is the first tracked due date. As time passes, the displayed
next due date is calculated automatically based on that date and frequency.
For a monthly bill entered on January 31, February is clamped to the last
calendar day of February, and March returns to March 31.

This tracker does not process or verify payments.
