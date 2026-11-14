# Orchast API

NestJS API for Orchast. Sign-in is Google or Microsoft through Supabase Auth. There is no email and password sign-in. The first successful visit registers the account. Later visits sign in to the same account.

The API listens on [http://localhost:1918](http://localhost:1918). Swagger UI is at [http://localhost:1918/docs](http://localhost:1918/docs). The web app stays on port 1818.

```bash
pnpm install
copy .env.example .env
pnpm start:dev
```

Fill in `.env` before the second command. The process refuses to start while `SUPABASE_URL`, the two keys, or `COOKIE_SECRET` are missing.

## How a sign-in works

```
Browser  →  GET /auth/google          Nest stores a one-time PKCE verifier in an httpOnly cookie
Browser  →  Supabase  →  Google       Google only talks to Supabase
Browser  ←  GET /auth/callback?code=  Nest exchanges the code, sets session cookies
Browser  →  http://localhost:1818/auth/callback?status=success&isNewUser=true|false
```

Microsoft is the same flow at `GET /auth/microsoft`. Supabase calls that provider Azure.

Session cookies:

| Cookie | What it holds | Sent to |
| --- | --- | --- |
| `orchast_oauth` | PKCE verifier, for 10 minutes | `/auth` |
| `orchast_access` | Supabase access token | every API route |
| `orchast_refresh` | Supabase refresh token | `/auth` |

`GET /auth/me` accepts the access cookie or `Authorization: Bearer`. Other clients can `POST /auth/refresh` with `{ "refreshToken": "..." }` and receive the rotated tokens in the JSON body.

## 1. Create the Supabase project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) and create a project.
2. Wait until the project status is healthy.
3. Open **Project Settings → API** (or **API Keys**).
4. Copy these into `.env`:

| Dashboard | `.env` |
| --- | --- |
| Project URL | `SUPABASE_URL` |
| Publishable key (`sb_publishable_...`) | `SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_...`) | `SUPABASE_SECRET_KEY` |

Older projects label those keys **anon** and **service_role**. Paste them into the same two variables. Supabase is retiring those names. The secret key bypasses row level security. It stays in this API only, never in the web app.

Generate the cookie secret and paste it into `COOKIE_SECRET`:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

Leave `SUPABASE_JWT_SECRET` empty. New projects sign tokens with a key this API fetches from Supabase. You only fill that variable if a later step tells you to.

## 2. Turn off email and password

Supabase still accepts email sign-ups on its own URL until you disable that provider. This API does not expose it, and the dashboard should not either.

1. Open **Authentication → Sign In / Providers** (some projects say **Providers**).
2. Open **Email** and turn the provider off. Save.
3. Leave **Allow new users to sign up** on. That switch is what makes a first Google or Microsoft visit create an account. Turning it off blocks registration.

Confirm Google and Azure are the only enabled providers when you finish the next two sections.

## 3. Google

The redirect URI you register at Google is Supabase's callback, not this API.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Open **Google Auth Platform** (older consoles call this **APIs & Services → OAuth consent screen**).
3. Choose **External**, set the app name to Orchast, and set a support email you can read.
4. Add the scopes `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile`.
5. While the app is in **Testing**, add the Google account you will sign in with as a test user. Otherwise Google refuses the login.
6. Open **Clients** (or **Credentials**) → **Create client** → **OAuth client ID** → **Web application**.
7. Under **Authorized redirect URIs**, add exactly:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

`YOUR_PROJECT_REF` is the subdomain of `SUPABASE_URL`. Do not put `http://localhost:1918` here. Google sends the user back to Supabase, and Supabase then sends them to this API.

8. Copy the client ID and client secret.
9. In Supabase, open **Authentication → Sign In / Providers → Google**, enable it, paste both values, and save.

## 4. Microsoft

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) or [portal.azure.com](https://portal.azure.com/) → **Microsoft Entra ID → App registrations → New registration**.
2. Name it Orchast.
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. That is the `common` tenant, so both work accounts and Outlook/Hotmail accounts can register.
4. Redirect URI: platform **Web**, value:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

5. Register, then copy **Application (client) ID**.
6. **Certificates & secrets → New client secret**. Copy the **Value** column immediately. The secret ID is not the secret.
7. In Supabase, open **Authentication → Sign In / Providers → Azure**:
   - Enable it.
   - Client ID: the Application (client) ID.
   - Client secret: the secret **Value**.
   - Azure Tenant URL: `https://login.microsoftonline.com/common`
8. Save.

Microsoft Graph's `User.Read`, `email`, `profile`, and `openid` permissions are enough. Supabase requires the email scope, and this API already requests `openid email profile`.

## 5. Allow this API's callback

Supabase will not redirect to a URL you have not listed.

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `http://localhost:1818` (the web app).
3. Under **Redirect URLs**, add exactly:

```text
http://localhost:1918/auth/callback
```

Add the production API callback the same way when you deploy, for example `https://api.orchast.com/auth/callback`. Change `APP_URL` and `FRONTEND_URL` to those origins. No trailing slash.

If the browser and the API are served from different sites, set `COOKIE_DOMAIN` to the parent domain (`.orchast.com`) so the session cookie is sent to both. On localhost, leave `COOKIE_DOMAIN` empty.

## 6. Create the profiles table

The SQL is in `supabase/migrations/20261114190000_profiles.sql`.

1. Open **SQL Editor → New query**.
2. Paste the file and run it.

It creates `public.profiles`, lets a signed-in user read their own row, and copies each new auth user into that table. This API also upserts the row after sign-in, using the secret key. Sign-in still completes if you skip this step. `GET /auth/me` reads the token, not the table. The log line `Profile was not saved` means the SQL has not been run.

## 7. Try a sign-in

```bash
pnpm start:dev
```

Open [http://localhost:1918/docs](http://localhost:1918/docs) and confirm **Health** and **Auth** are listed.

In the same browser, open:

- [http://localhost:1918/auth/google](http://localhost:1918/auth/google)
- [http://localhost:1918/auth/microsoft](http://localhost:1918/auth/microsoft)

Finish the provider screen. The browser then lands on `http://localhost:1818/auth/callback?status=success&isNewUser=true` the first time, and `isNewUser=false` after that. The web app does not have that page yet, so you will see the app's 404. The session cookies are already set.

Go back to [http://localhost:1918/docs](http://localhost:1918/docs), open `GET /auth/me`, and execute it. Swagger is on the same host, so the browser sends the cookie. You should see your id, email, name, avatar, and provider.

`POST /auth/sign-out` clears the cookies and revokes the Supabase session.

If Google succeeds and `GET /auth/me` then returns 401 with an invalid token, the project is still on the legacy JWT secret. In **Project Settings → JWT Keys** (or **JWT Settings**), copy that secret into `SUPABASE_JWT_SECRET` and restart. Prefer the dashboard's migration to JWT signing keys, then clear `SUPABASE_JWT_SECRET`.

## What the web app will call

The app on port 1818 does not use this API yet. When it does, a button is a navigation, not a form post:

```html
<a href="http://localhost:1918/auth/google">Continue with Google</a>
<a href="http://localhost:1918/auth/microsoft">Continue with Microsoft</a>
```

After the redirect to `/auth/callback`, read `status` and `isNewUser`, then call the API with cookies:

```ts
await fetch('http://localhost:1918/auth/me', { credentials: 'include' });
```

`credentials: 'include'` is required. The API only allows the origin in `FRONTEND_URL`.

To start the flow without leaving the page first:

```ts
const response = await fetch('http://localhost:1918/auth/google?format=json', {
  credentials: 'include',
});
const { url } = await response.json();
window.location.href = url;
```

The `format=json` response sets the verifier cookie, so the redirect has to happen in that same browser.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | no | Process is up |
| `GET` | `/auth/providers` | no | Google and Microsoft |
| `GET` | `/auth/google` | no | Start Google. `?format=json` returns `{ url, provider }` |
| `GET` | `/auth/microsoft` | no | Start Microsoft |
| `GET` | `/auth/callback` | no | Supabase returns the browser here |
| `GET` | `/auth/me` | yes | Current user |
| `POST` | `/auth/refresh` | refresh cookie or body | Rotate the session |
| `POST` | `/auth/sign-out` | no | Revoke the session and clear cookies |

## Checks

```bash
pnpm test
pnpm test:e2e
pnpm run build
```
