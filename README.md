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

## Update Work Order status and Worklog

Open the new page with a work order number:

`https://your-domain.vercel.app/work-order-update.html?wonum=1234`

Optional site parameter:

`https://your-domain.vercel.app/work-order-update.html?wonum=1234&siteid=BEDFORD`

The page:

- Retrieves the work order header from `MXAPIWO`.
- Supports these status values: `WAPPR`, `APPR`, `WSCH`, `WMATL`, `INPRG`, `COMP`, `CLOSE`, and `CAN`.
- Retrieves, creates, and updates worklogs through `MXAPIWORKLOG`.
- Supports `APPTNOTE`, `CLIENTNOTE`, `UPDATE`, and `WORK` log types.
- Allows multiple worklog rows to be staged and submitted together.
- Saves every unsent status/memo/worklog edit in browser `localStorage`, scoped by site + work order number.
- Clears the browser draft after a fully successful submission.
- Shows a confirmation dialog before submission, a blocking loading overlay while waiting for Maximo, and Maximo error text when a request fails.

### Serverless endpoints

- `GET /api/work-order-detail?wonum=...&siteid=BEDFORD`
- `GET /api/worklogs?wonum=...&siteid=BEDFORD`
- `POST /api/worklogs` for individual create/update operations
- `POST /api/work-order-update` for the page's combined status + multi-worklog submission

`api/_maximo.js` centralizes the Maximo root URL and API authentication. You can override the default Maximo API root with an optional Vercel environment variable named `MAXIMO_ROOT` (for example `https://host/maximo/api`).

### Important Maximo configuration note

Maximo REST object structures are configurable. This implementation uses the standard `MXAPIWO` and `MXAPIWORKLOG` names. If your environment renamed, restricted, or customized those object structures/relationships, update the names or selected attributes in the corresponding files under `/api`.
