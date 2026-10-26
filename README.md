# Acton Citizens' Band

Website for the Acton Citizens' Band, a community concert and marching band
formed in 1872 in Acton, Ontario.

- Website: https://actoncitizensband.ca
- Repository: https://github.com/actonband/Acton-Citizens-Band

The site provides band information, learning and membership inquiries, upcoming
events, calendar subscriptions, and interactive 3D instruments. It uses React 18,
TypeScript, SCSS, Webpack, Three.js, Firebase Firestore, Firebase Authentication,
and Google Analytics.

## Requirements

- Node.js 22 and npm. The test command uses Node's TypeScript stripping support;
  use Node 22.14 or newer within the Node 22 release line.
- Access to the Firebase web app configuration for local development.
- Firebase CLI and Firebase project access for manual deployment.

## Local setup

Clone the repository and install dependencies:

```sh
git clone https://github.com/actonband/Acton-Citizens-Band.git
cd Acton-Citizens-Band
npm ci
```

Copy .env.example to .env, then replace the placeholders with the Firebase web
app configuration. In PowerShell:

```powershell
Copy-Item .env.example .env
```

The configured Firebase project is acton-citizens-band. Environment values used
by the application are embedded at build time. Keep service-account credentials
out of .env and application code. The .env file is ignored by Git.

Start the development server:

```sh
npm run startDev
```

Webpack opens http://localhost:3000. Restart the server after changing .env.
On Windows, if PowerShell blocks npm.ps1, use npm.cmd instead of npm.

## Commands

| Command              | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| npm run startDev     | Start the development server and open the browser            |
| npm start            | Start Webpack's server in production mode; does not deploy   |
| npm run buildDev     | Write a development build to build/                          |
| npm run build        | Write a production build to build/                           |
| npm test             | Run the Node test suite in tests/                            |
| npm run typecheck    | Check application and test TypeScript without emitting files |
| npm run format       | Format source, configuration, and documentation              |
| npm run format:check | Check formatting without changing files                      |
| npm run check        | Run formatting, TypeScript, and tests                        |
| npm audit            | Check dependency advisories, including development tools     |

Application and test files have separate TypeScript configurations. Application code
uses explicit browser/build-time declarations, while tests use Node types. Tests
run through Node's built-in test runner. Test files are outside the application
entry graph and are not copied into the production output.

## Environment configuration

Use .env.example as the complete list of supported variables:

| Variable                               | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| FIREBASE_API_KEY                       | Firebase web API key                               |
| FIREBASE_AUTH_DOMAIN                   | Firebase Authentication domain                     |
| FIREBASE_PROJECT_ID                    | Firebase project ID; acton-citizens-band           |
| FIREBASE_APP_ID                        | Firebase web application ID                        |
| FIREBASE_DATABASE_URL                  | Database URL from the Firebase configuration       |
| FIREBASE_STORAGE_BUCKET                | Storage bucket from the Firebase configuration     |
| FIREBASE_MESSAGING_SENDER_ID           | Messaging sender ID                                |
| FIREBASE_MEASUREMENT_ID                | Firebase measurement ID                            |
| REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID | Analytics tracking ID; omit to skip initialization |
| REACT_APP_DRACO_DECODER_URI            | Public URL of the Draco decoder used by 3D models  |
| REACT_APP_ACCOUNT_OVERRIDE             | Development-only override for account visibility   |

Webpack reads .env locally and also accepts system environment variables. System
variables take precedence. No runtime environment is read from Firebase Hosting;
configuration changes require rebuilding and redeploying.

## Feature flags and account testing

Feature flags are read from the Firestore features collection. The account flag
is the account document with an enabled boolean field. Both account navigation
and the account section use the same flag. Production follows Firestore, and a
missing or unavailable flag leaves accounts hidden.

For development, set this in .env:

```dotenv
REACT_APP_ACCOUNT_OVERRIDE=true
```

| Development override | Account visibility                             |
| -------------------- | ---------------------------------------------- |
| true                 | Show accounts regardless of the Firestore flag |
| false                | Hide accounts regardless of the Firestore flag |
| Blank                | Follow Firestore                               |

The override only applies to npm run startDev and development builds. Production
builds, including npm start, always follow Firestore. It changes UI visibility;
authentication and event queries still connect to the configured Firebase project.
Keep features/account.enabled=false while accounts are not in use.

History and the X social link also use Firestore feature flags. Events are read
from the events collection. Event member notes are intentionally public.

## Validation and manual deployment

Before deployment:

```sh
npm ci && npm run check && npm run build
```

In Windows PowerShell 5, run each command separately and continue only after it
succeeds; that shell does not support &&. Use npm.cmd if script execution is blocked.

Deploy the built site to Firebase Hosting:

```powershell
firebase.cmd login
firebase.cmd deploy --only hosting --project acton-citizens-band
```

On other shells, use firebase instead of firebase.cmd. Hosting serves build/;
the --only hosting option limits this command to website deployment. Building
alone does not publish the site.

## GitHub Actions deployment

The repository contains these workflows:

- .github/workflows/firebase-hosting-merge.yml: build/check and live deployment
  for pushes to main.
- .github/workflows/firebase-hosting-pull-request.yml: build/check and preview
  deployment for pull requests from this repository.

Both install dependencies, check formatting, run tests and TypeScript checks, then
build before deployment.
They currently reference the GitHub Actions secret
FIREBASE_SERVICE_ACCOUNT_ACTON_CITIZENS_BAND. This is the service-account JSON
credential created by Firebase's GitHub setup, and must have access to the
acton-citizens-band Firebase project.

Before enabling automated deployment, complete the build environment setup:

1. Under repository Settings > Secrets and variables > Actions > Variables, add
   the public Firebase configuration values using the names in .env.example.
   The minimum required configuration is FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN,
   FIREBASE_PROJECT_ID, and FIREBASE_APP_ID. Include the Draco decoder URL and
   any other configuration used by the site.
2. Both workflows already map repository variables into the build environment and
   pin Node 22. Missing required Firebase values stop the workflow with an error.
3. Verify the deployment secret exists and matches FIREBASE_SERVICE_ACCOUNT_ACTON_CITIZENS_BAND.
4. Validate a pull-request preview, then merge to main for live deployment.

The local .env is not uploaded to GitHub. A successful build alone does not prove
that Firebase configuration was supplied; verify the preview loads live data.
See [deployment notes](docs/deployment.md) for additional configuration details.

## Project layout

```text
src/
  App.tsx                    Application shell, navigation, theme, feature loading
  App.scss                   Application styles
  components/
    auth/                    Account and email-link authentication UI
    home/                    Band information, events, calendar, account sections
    instruments/             Three.js models, pointer and device-tilt behavior
  utils/                     Firebase, analytics, feature flags, storage utilities
public/                      Static HTML, images, fonts, and 3D models
tests/                      Node tests (calendar, tilt, flags, email, storage)
.github/workflows/           Firebase Hosting deployment workflows
build/                       Generated production/development output; Git-ignored
```

## Content and assets

Most band information is maintained in src/components/home/. Events and feature
flags are maintained in Firestore. Event times are displayed in America/Toronto. Static assets live in public/ and are copied
to the build. Preserve model and asset attribution when replacing content; the
site footer contains the existing trumpet model credit.

## Code conventions

React components use PascalCase filenames; utility modules and tests use camelCase.
Use .tsx for JSX and .ts for non-JSX code when adding files. Existing filenames
are preserved. Prettier and .editorconfig define formatting. Keep imports matched
to filename casing for Linux CI. The Webpack configuration uses .cjs because it
loads plugins with CommonJS; application source uses ES modules.

Production builds clean build/ and use content hashes for JavaScript and CSS.
Do not edit generated files. No open-source license is currently declared; asset
attributions do not grant a blanket license to this repository.
