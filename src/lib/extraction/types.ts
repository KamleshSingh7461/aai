// Kept free of runtime dependencies so client components can import it.
// Mirrors the agreement kinds in the old EUSAI admin database, plus "other".
export const DOCUMENT_TYPES = {
  partnership_agreement: "University Partnership Agreement",
  sports_logo_contract: "Sports Logo Contract",
  scholarship_transfer_letter: "Scholarship Transfer Letter",
  scholarship_valuation_letter: "Scholarship Valuation Letter",
  merchandise_store_mou: "Merchandise Store MOU",
  school_spirit_agreement: "School Spirit Agreement",
  outgoing_senior_package_agreement: "Outgoing Senior Package Agreement",
  alumni_establishment_agreement: "Alumni Association Establishment Agreement",
  studio_agreement: "Studio Agreement (FGSN / SDN)",
  other: "Other Agreement",
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;
