# Quick Cal File

Generate downloadable `.ics` calendar files from a clean, modern web UI. Works great with Apple Calendar, Google Calendar, and Outlook.

## Features

- Weekly repeats across selected weekdays (e.g., Tue/Thu)
- Timed or all-day events
- Single `.ics` containing all occurrences (one VEVENT per date)
- Fully client‑side; no accounts, no tracking

## Local usage

Open `index.html` in your browser. No build step required.

## Deploy to GitHub Pages

1. Create a new GitHub repository named `QuickCalFile` (or any name).
2. Add these files and push to the `main` branch.
3. In the repository, go to Settings → Pages → Build and deployment.
4. Set Source to `Deploy from a branch`, then select `main` and `/ (root)`.
5. Click Save. Your site will be available at `https://<your-username>.github.io/<repo-name>/`.

## Notes

- Times are exported as floating local times (no TZID), which Apple Calendar and most clients interpret in your default calendar timezone.
- All-day events use non-inclusive DTEND per RFC 5545.
- For complex rules (exceptions, monthly patterns), you can extend `app.js` to build an RRULE instead of individual VEVENTs.


