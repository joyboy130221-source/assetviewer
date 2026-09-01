# Vercel Asset ID Viewer

A small public static web application that reads `assetId` from the URL query string.

## Example

After deploying to Vercel:

```text
https://your-app.vercel.app/?assetId=ASSET-001
```

The page displays:

```text
Current Asset Id is
ASSET-001
```

## Local test

You can open `index.html` directly, but for the URL parameter it is easier to run a simple HTTP server.

For example:

```bash
npx serve .
```

Then open:

```text
http://localhost:3000/?assetId=ASSET-001
```

## Deploy to Vercel

1. Upload this folder to GitHub, GitLab, or Bitbucket.
2. In Vercel, create a New Project.
3. Import the repository.
4. Framework Preset: `Other`.
5. No build command is required.
6. Deploy.

You can also deploy with the Vercel CLI:

```bash
npm install -g vercel
vercel
```

## iframe example

```html
<iframe
  src="https://your-app.vercel.app/?assetId=ASSET-001"
  width="100%"
  height="300"
  style="border:0;"
></iframe>
```

The included `vercel.json` sets a CSP `frame-ancestors *` policy so the page can be embedded by other sites.

For production, it is safer to replace `*` with the exact parent application domain, for example:

```text
frame-ancestors 'self' https://your-parent-app.example.com
```
