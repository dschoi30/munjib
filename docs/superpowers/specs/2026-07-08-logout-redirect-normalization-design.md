# Logout Redirect Normalization Design

## Context

Munjib already normalizes sign-in redirects because NextAuth can return absolute
URLs based on server-side `NEXTAUTH_URL`, such as `http://localhost:3000/...`,
even when the user is browsing the app through another origin. The lower account
drawer logout path still called `signOut({ callbackUrl: "/login" })`, allowing
NextAuth to perform the redirect itself and reproduce the same localhost-origin
escape after logout.

## Design

Logout should use the same browser-origin app-local redirect contract as sign-in:

- call `signOut()` with `redirect: false` and `callbackUrl: "/login"`
- parse the returned URL against `window.location.origin`
- accept only URLs whose parsed origin matches the current browser origin
- navigate with the app-local path (`/login`) rather than trusting the absolute
  origin returned by NextAuth

The URL parsing helper should be shared by login and logout so future auth entry
points do not reimplement the origin check differently. The browser-origin read
should be guarded so importing or evaluating the helper without `window` does
not throw.

## Testing

Add a component regression test for the lower account drawer: if mocked NextAuth
returns `http://localhost:3000/login` from `signOut({ redirect: false })`, the
browser should navigate to `/login`. Add a small helper test that confirms the
browser-origin reader is safe when `window` is absent.
