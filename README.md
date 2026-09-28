# Agreement Vault

AI-read records of every MoU and agreement between universities and our group companies (EUSAI, ACI, FGSN, SDN, EFLI, ESI and partners).

**University → Company → Agreements.** A regional manager photographs a signed copy (or uploads a scanned PDF). Claude reads every page, splits files that hold more than one document, and extracts the terms exactly as printed. Automatic checks flag anything that doesn't add up, and a person reviews and approves before the record counts as official.

## Set up on a new PC

1. Install **Node.js 22** ([nodejs.org](https://nodejs.org)) and **Git** if they aren't installed.
2. Download the code:
   ```bash
   git clone https://github.com/KamleshSingh7461/aai.git
   ```
3. Go into the folder:
   ```bash
   cd aai
   ```
4. Install the packages:
   ```bash
   npm install
   ```
5. Create your settings file, then put your Claude API key in `ANTHROPIC_API_KEY` inside it (on macOS/Linux use `cp` instead of `copy`):
   ```bash
   copy .env.example .env
   ```
6. Create the database:
   ```bash
   npx prisma db push
   ```
7. Add the six companies (EUSAI, ACI, FGSN, SDN, EFLI, ESI):
   ```bash
   npm run db:seed
   ```
8. Start the app, then open http://localhost:3000:
   ```bash
   npm run dev
   ```

The database (`prisma/dev.db`), uploaded scans (`storage/`) and `.env` are **not** in the repository, so a new PC starts with an empty app; test data stays on the PC where it was created. To load the Alpha College sample, run:

```bash
npx tsx scripts/import-fixture.ts path/to/1767896951_MoU_Scholarship_Valuation_Letter.pdf fixtures/alpha-college-scholarship-letters.json
```

## Working across PCs

Before you stop on one machine, commit your changes and push:

```bash
git add -A
```

```bash
git commit -m "Describe what changed"
```

```bash
git push
```

When you start on the other machine, pull first:

```bash
git pull
```

## How a document flows

1. **Scan / Upload** (`/upload`): camera photos (one per page, combined into a PDF) or a PDF file. The original is stored untouched under `storage/files/<sha256>.pdf`.
2. **AI reading** (`src/lib/extraction/extract.ts`): the PDF goes to `claude-opus-5` with a strict output schema (`schema.ts`). Every value is kept as printed text plus a parsed number or date, with its page number, confidence, and whether it was handwritten.
3. **Checks** (`validate.ts`): printed text vs parsed number, quantity × rate = total, tier totals = combined total, dates vs referenced agreement dates, unfilled `[PLACEHOLDERS]`, handwritten or low-confidence values. Checks **report only**; they never change a value.
4. **Matching** (`matching.ts`): the university and company are linked automatically only when the match is unambiguous. When a reviewer assigns one, the printed spelling is saved as an alias, so the next upload matches by itself.
5. **Review** (`/review`, `/agreements/[id]`): the scan sits next to the extracted data. Clicking any `p.N` jumps the scan to that page. Edits are logged field by field in the change history.

## Vault Agent

The home page (`/`) is the Vault Agent: staff ask questions in plain English and Claude answers by calling read-only tools over the database (`src/lib/agent/tools.ts`, loop in `src/lib/agent/run.ts`, streamed by `src/app/api/agent/route.ts`). It can search agreements, open one, list universities, collect scholarship figures, find missing agreement types, list terms ending soon and search transcriptions. It cannot change records.

## Useful scripts

- `npx tsx scripts/import-fixture.ts <file.pdf> <extraction.json>`: runs a file through the pipeline with a known extraction (no API call). `fixtures/` holds the Alpha College letters, transcribed word for word.
- `npx tsx scripts/check-agent-tools.ts`: runs every Vault Agent tool against the local database (no API call).
- `npx tsx scripts/check-validation.ts`: runs the checks on the IES Valuation Letter values. It should flag the 2024/2025 date mismatch and the 37,500 × 4 ≠ 1,875,000 total.

## Moving to production

- Switch `provider` in `prisma/schema.prisma` to `mysql` or `postgresql` and set `DATABASE_URL`.
- Move `storage/` to S3-compatible storage (only `src/lib/storage.ts` touches files).
- Add sign-in and roles (Regional Manager uploads, Internal staff view, Admin approves) before exposing the app outside the office. Right now there is no login.
