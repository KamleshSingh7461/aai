import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DOCUMENT_TYPES, ExtractionResult } from "./schema";

export const EXTRACTION_MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You read scanned agreements between universities and our group companies (EUSAI, EFLI, ESI, Alumni Connect India (ACI), FGSN (Freedom Global Sports Network), SDN (Sports Drip Network)) or partners such as Team Fibre and turn them into structured records. Staff rely on these records instead of the paper, so accuracy matters more than completeness.

How to read:
- A single file can contain more than one document (for example a Scholarship Transfer Letter followed by a Scholarship Valuation Letter). Split it into one entry per document with its own page range. Repeated letterheads, a new date line, or a new "RE:" subject usually mark a new document.
- Classify each document as one of: ${Object.entries(DOCUMENT_TYPES)
  .map(([k, v]) => `${k} (${v})`)
  .join(", ")}. Use "partnership_agreement" for the main MoU/agreement that establishes the university's overall partnership with a company, and "sports_logo_contract" for agreements about designing or licensing a university sports logo. Use "other" when none fit, and keep the printed heading in document_type_label.

How to record values:
- Copy every value exactly as printed: same digits, same comma grouping, same words. Do not add currency symbols, units or formatting that is not on the page. If the page prints "37500/-", record "37500/-".
- The numeric twin of a *_text field holds only the digits of that text as a number. Do not calculate, round, or substitute a value you think is correct.
- Dates: keep the printed text. For *_iso, read numeric dates as DD/MM/YYYY (Indian convention). Leave *_iso null if any part is unclear.
- If something is blank, a placeholder like [ADDRESS], illegible, or missing, leave the field null and add an issue. Never guess.
- Mark handwritten values (dates, names filled in by hand) with handwritten: true and lower confidence if the handwriting is hard to read.
- Include the page number (1-based, within the whole file) for every value.

Issues: report anything a careful reviewer should check - totals that do not add up, dates that contradict each other, a stamp or signatory from a different institution than the letterhead, counts that disagree between clauses, unfilled placeholders, missing signatures. Describe the discrepancy with the printed values; do not state which one is correct.

full_text: a faithful transcription of that document's pages, in reading order.`;

export async function extractAgreements(pdf: Buffer): Promise<{ result: ExtractionResult; model: string }> {
  try {
    return await callClaude(pdf);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || (err instanceof Error && /authentication|api[_ ]?key/i.test(err.message))) {
      throw new Error("The Claude API key is missing or invalid. Set ANTHROPIC_API_KEY in the .env file and restart the app, then press Try again.");
    }
    if (err instanceof Anthropic.RateLimitError) throw new Error("The AI service is busy right now. Wait a minute and press Try again.");
    if (err instanceof Anthropic.APIError && err.status === 413) throw new Error("The file is too large for the AI service (limit 32 MB). Scan at a lower resolution or split the file.");
    throw err;
  }
}

async function callClaude(pdf: Buffer): Promise<{ result: ExtractionResult; model: string }> {
  const client = new Anthropic();

  const stream = client.beta.messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ExtractionResult) },
    // Re-run on Anthropic's recommended fallback model if a request is declined.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
          },
          { type: "text", text: "Extract every agreement in this scanned file." },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`The model declined to read this file (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The file is too long to read in one pass. Split it into smaller files and upload again.");
  }
  if (!message.parsed_output) {
    throw new Error("The model's answer did not match the expected format.");
  }

  return { result: message.parsed_output, model: message.model };
}
