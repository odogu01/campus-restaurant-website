# Deploying UniBites on Vercel

1. Push this repository to GitHub, then import it in Vercel with the repository root as the project root.
2. Leave the framework preset as **Other**. The included `vercel.json` publishes `frontend/public` and rewrites `/api/*` to the Express function.
3. Add these Vercel environment variables for Production, Preview, and Development as appropriate:

   - `DB_URL` — the production MySQL/TiDB connection URL.
   - `JWT_SECRET` — a unique random secret of at least 32 characters.
   - `FRONTEND_URL` — the production URL, for example `https://your-project.vercel.app`.
   - `PAYMENT_ENABLED=false` — unless a real payment provider has been implemented.
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` — only if email notifications are required.

4. Ensure the database server accepts connections from Vercel and apply `backend/schema.sql` to the production database before using the site.
5. Deploy. `/ping` and `/api/status` are the quick post-deployment checks.

## Important upload limitation

Vercel Functions do not provide persistent disk storage. The existing menu and restaurant image upload feature writes files to `backend/uploads`, which is suitable locally but not for production Vercel hosting. Use an object-storage provider (such as Vercel Blob, Cloudinary, or S3) and update `backend/src/config/uploads.js` before allowing production image uploads. Existing image URLs that point to `/uploads/...` must also be migrated to that provider.
