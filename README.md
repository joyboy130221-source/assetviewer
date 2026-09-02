# Maximo Asset Viewer

Open the deployed page with an asset query parameter:

`https://assetviewer.vercel.app/?assetId=V6-0404`

The value of `assetId` is safely inserted into the Maximo `oslc.where` filter. The response is read from `member[0]`; the page shows a summary and every attribute returned by the API.

## Deploy to Vercel

1. Extract this ZIP and open the `assetviewer` folder.
2. Import the folder/repository into Vercel, or run `npx vercel`.
3. In **Vercel → Project Settings → Environment Variables**, create:
   - Name: `MAXIMO_API_KEY`
   - Value: your Maximo API key
   - Environments: Production, Preview, and Development as needed
4. Redeploy after adding the environment variable.
5. Test: `https://your-domain.vercel.app/?assetId=V6-0404`

The API key is intentionally kept in a server-side environment variable. Do not put it in `app.js`, because browser visitors could read it.

## Create a work order

Open `https://your-domain.vercel.app/work-order.html`, or click **Create Work Order** from the Asset Viewer. If opened from an asset page, the asset number is filled automatically.

The form sends these original Maximo JSON attributes through the server-side `/api/work-order` endpoint: `siteid`, `orgid`, `assetnum`, `location`, `description`, `wopriority`, `worktype`, `failurecode`, `reportedby`, and `reportdate`.

`reportdate` is selected with a date-time picker and converted to Maximo's `yyyy-MM-dd'T'HH:mm:ssXXX` format using the user's browser time-zone offset, for example `2026-09-03T08:00:00+07:00`.

## Local development

1. Install the Vercel CLI: `npm install -g vercel`
2. Create `.env.local` containing `MAXIMO_API_KEY=your_key_here`
3. Run `vercel dev`
4. Visit `http://localhost:3000/?assetId=V6-0404`

## Notes

- The Maximo site is fixed to `BEDFORD` in `api/asset.js`.
- The included response header allows the page to be embedded in an iframe.
- Whether the Vercel server can call Maximo depends on the Maximo endpoint being reachable from the public internet and accepting the configured key.
