// Values exactly as printed on the IES University Valuation Letter (page 3).
import { validateDocument } from "../src/lib/extraction/validate";
import type { ExtractedDocument } from "../src/lib/extraction/schema";

const doc: ExtractedDocument = {
  page_start: 3, page_end: 3,
  document_type: "scholarship_valuation_letter",
  document_type_label: "RE: Valuation of Athletic Scholarships Granted to Alumni Association of India",
  title: null,
  university: { name: "IES University Bhopal", address: null, role: "University" },
  company: { name: "EUSAI Team Private Limited", address: null, role: "Addressee" },
  other_parties: [],
  document_date_text: "11 April 2024",
  document_date_iso: "2024-04-11",
  academic_year: "2025-26",
  term_text: null, term_years: null, auto_renewal: null, notice_period_text: null,
  referenced_agreement: { text: "Agreement for the Establishment of Alumni Association", date_text: "11 April 2025", date_iso: "2025-04-11", section: "11.1" },
  scholarship_tiers: [{
    name: "Half-Fee Scholarship", quantity_text: null, quantity: null, duration_text: null, duration_years: null,
    value_per_scholarship_per_year_text: "37500/-", value_per_scholarship_per_year: 37500,
    total_annual_value_text: null, total_annual_value: null, total_multi_year_value_text: null, total_multi_year_value: null,
    inclusions: [{ item: "50% of tuition fees", value_text: "37500/-" }, { item: "50% of other standard student fees", value_text: "NA" }], page: 3,
  }],
  scholarship_totals: {
    combined_annual_value_text: "37500/-", combined_annual_value: 37500,
    combined_multi_year_value_text: "1875000/-", combined_multi_year_value: 1875000,
    currency_as_printed: "/-", page: 3,
  },
  financial_terms: [], obligations: [], key_fields: [], signatories: [], stamps: [],
  summary: "", issues: [],
  full_text: "Combined four-year value: 1875000/-",
};

for (const f of validateDocument(doc, 3)) console.log(`[${f.severity}] ${f.message}`);
