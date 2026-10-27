# Firebase Hosting deployment

The configured Firebase project and Hosting site are both acton-citizens-band.
Both workflows use Node 24, map repository variables into the build environment,
and validate required Firebase configuration before installing/building.

In GitHub Settings > Secrets and variables > Actions > Variables, add the public
browser configuration values from your local .env, using the same names:

- FIREBASE_API_KEY (required)
- FIREBASE_AUTH_DOMAIN (required)
- FIREBASE_PROJECT_ID (required; acton-citizens-band)
- FIREBASE_APP_ID (required)
- FIREBASE_DATABASE_URL
- FIREBASE_STORAGE_BUCKET
- FIREBASE_MESSAGING_SENDER_ID
- FIREBASE_MEASUREMENT_ID
- REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID (optional)

These are browser configuration values, embedded in the built application.
Account visibility follows the Firestore features/account document (enabled: true or false).
Keep enabled: false to hide accounts in production. Local .env remains ignored by git. Webpack reads system variables
in CI and .env locally; system variables take precedence.

Keep FIREBASE_SERVICE_ACCOUNT_ACTON_CITIZENS_BAND as a GitHub Actions SECRET. This is the name
referenced by both workflows, matching the secret reported by the repository owner. The credential must have deployment access to
acton-citizens-band. Do not put this credential in public variables or .env.

Both workflows run npm ci, npm run format:check, npm test, npm run typecheck, and npm run build
before deployment. Node 24 and repository-variable mappings are configured. Main-branch pushes deploy live; same-repository PRs deploy
preview channels. Fork PRs do not receive deployment credentials. This change
does not itself push or deploy anything.

## Email-link sign-in

The web flow uses Firebase's default email-action domain and returns to /#account
on the origin that requested the email. No custom linkDomain or mobile Dynamic
Links configuration is needed for this browser-only flow.

Before enabling accounts, enable Email/Password and Email link sign-in in Firebase
Authentication. Under Authentication > Settings > Authorized domains, add each
hostname used for sign-in (production custom domain and any development/preview
hostnames you actually use). Localhost may need to be added explicitly for local
testing. Preview hostnames are distinct from the production hostname.

With accounts enabled locally, verify successful sending, returning from a real
email, opening on another browser (email confirmation prompt), expired links,
network errors, and blocked browser storage. Blocked storage means the returning
user must confirm their email again; sending should still work. Unit tests use
fake senders and do not send real email or verify Firebase Console settings.

## Local account testing

Run npm run startDev. Set REACT_APP_ACCOUNT_OVERRIDE=true in .env to show the
account section and navigation even when Firestore disables it or is unavailable.
Set false to force it hidden, or leave blank to follow Firestore. Restart the dev
server after changing .env. This override is ignored by production builds, including
npm start and npm run build. It only changes account UI visibility; Firebase Auth
still connects to the configured project. The old REACT_APP_ACCOUNT_ENABLED flag
is no longer used.
