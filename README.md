This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Quick local test

```bash
node scripts/local-test.mjs
```

Creates a throwaway PostgreSQL cluster in `.localdb` on port 5545 using your installed PostgreSQL, writes `.env`, installs dependencies, migrates, creates an admin and an accountant sign-in (saved to `local-test-login.txt`), then starts the dev server on port 3001 and opens the browser. It uses a different port and database from the Gem Certificate System, so both can run at the same time. Stop the server and delete `.localdb` to undo it. On Windows you can double-click `Run local test.bat` instead.

## Security and CVE maintenance

- Versions are pinned exactly (`.npmrc` `save-exact`, `engine-strict`). Next.js 16.4.3 and React 19.3.1 include the fixes for the October 2026 advisories (`use cache`, image optimizer/sharp, React Flight, DoS).
- The image optimizer is disabled and Cache Components / `use cache` are not enabled, which removes those attack surfaces.
- Authorization is never done in `proxy.ts`. Every page, action and route handler re-checks the session through `src/server/auth/dal.ts`.
- Dependabot (weekly, Next/React grouped) and a daily CI run with `npm audit` surface new CVEs. When one lands: bump the pinned version, run `npm ci && npm run audit:prod && npm test && npm run build`, deploy.
- Release notes to watch: https://nextjs.org/blog and https://github.com/vercel/next.js/security/advisories
- Not in scope yet: file uploads (photos/documents), user-management UI, per-IP rate limiting (do this at the reverse proxy).
