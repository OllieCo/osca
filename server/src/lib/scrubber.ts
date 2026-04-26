// PII detection and classification.
// Shared origin: MySchool scrubber.ts — identical logic, no browser dependencies.

import type { FieldType } from "../types/index.js"

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(\+?61\s?)?(\(0\d\)\s?|0\d\s?)?\d{4}\s?\d{4}/g
const TFN_RE = /\b\d{3}\s\d{3}\s\d{3}\b|\b\d{8,9}\b/g
const ABN_RE = /\b\d{2}\s\d{3}\s\d{3}\s\d{3}\b/g
const DOB_RE = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g
// EQ ID: 10 digits followed by exactly 1 letter (e.g. 1234567890A) — CONFIRMED against OneSchool TRAIN
const EQ_ID_RE = /\b\d{10}[A-Za-z]\b/g
// EQ Staff Employee ID: 5 letters followed by exactly 1 digit (e.g. SMITJ1) — CONFIRMED against OneSchool TRAIN
const STAFF_ID_RE = /\b[A-Za-z]{5}\d\b/g

export function classifyField(label: string, value: string): FieldType {
  const l = label.toLowerCase()

  if (/\bqsn\b|\beq\s*id\b|student\s*number|student\s*id/i.test(l)) return "qsn"
  if (/\bstaff\s*id\b|\bemployee\s*(id|number)\b|\bpayroll\s*(#|number|no\.?)?/i.test(l)) return "staffid"
  if (/\btfn\b|tax\s*file/i.test(l)) return "tfn"
  if (/\babn\b|business\s*number/i.test(l)) return "abn"
  if (/\bname\b|surname|given\s*name|first\s*name|last\s*name|full\s*name/i.test(l)) return "name"
  if (/email|e-mail/i.test(l)) return "email"
  if (/phone|mobile|fax|contact\s*number/i.test(l)) return "phone"
  if (/\bdob\b|date\s*of\s*birth|birth\s*date|born/i.test(l)) return "dob"
  if (/address|street|suburb|postcode|state|locality/i.test(l)) return "address"
  if (/\bid\b|identifier|\bnumber\b|ref|case|file|record/i.test(l)) return "id"

  EMAIL_RE.lastIndex = 0
  ABN_RE.lastIndex = 0
  TFN_RE.lastIndex = 0
  PHONE_RE.lastIndex = 0
  EQ_ID_RE.lastIndex = 0
  STAFF_ID_RE.lastIndex = 0

  if (EQ_ID_RE.test(value)) return "qsn"
  if (STAFF_ID_RE.test(value)) return "staffid"
  if (EMAIL_RE.test(value)) return "email"
  if (ABN_RE.test(value)) return "abn"
  if (TFN_RE.test(value)) return "tfn"
  if (PHONE_RE.test(value)) return "phone"

  return "unknown"
}

export function containsPII(text: string): boolean {
  const patterns = [EQ_ID_RE, STAFF_ID_RE, EMAIL_RE, PHONE_RE, TFN_RE, ABN_RE, DOB_RE]
  return patterns.some((re) => {
    re.lastIndex = 0
    return re.test(text)
  })
}
