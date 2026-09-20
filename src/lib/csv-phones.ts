import { toInternationalDigits } from '@/lib/phone';

export type ParsedCsvRow = {
  raw: string;
  digits: string | null;
  line: number;
  reason?: string;
};

export type CsvParseResult = {
  valid: ParsedCsvRow[];
  invalid: ParsedCsvRow[];
  duplicatesRemoved: number;
};

const HEADER_NAMES = new Set([
  'phone',
  'phones',
  'number',
  'numbers',
  'mobile',
  'mobilenumber',
  'mobile_number',
  'phonenumber',
  'phone_number',
  'whatsapp',
  'whatsappnumber',
  'whatsapp_number',
  'contact',
  'cell',
  'tel',
  'telephone',
  'msisdn',
  'phone no',
  'phone no.',
  'mobile no',
  'mobile no.',
]);

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function isHeaderCell(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\-.]/g, ' ')
    .replace(/\s+/g, ' ');
  return HEADER_NAMES.has(normalized);
}

function detectDelimiter(line: string): ',' | ';' | '\t' {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;

  if (semicolon > comma && semicolon >= tab) {
    return ';';
  }
  if (tab > comma && tab >= semicolon) {
    return '\t';
  }
  return ',';
}

function splitCsvLine(line: string, delimiter: ',' | ';' | '\t'): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(stripBom(current.trim()));
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(stripBom(current.trim()));
  return cells;
}

function extractPhoneCandidate(cell: string): string {
  let trimmed = stripBom(cell.trim());
  if (!trimmed || isHeaderCell(trimmed)) {
    return '';
  }

  // Excel CSV export: ="923001234567"
  if (trimmed.startsWith('="') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(2, -1);
  }

  return trimmed;
}

function findPhoneInLine(
  line: string,
  delimiter: ',' | ';' | '\t',
): { raw: string; digits: string | null; reason?: string } {
  const cells = splitCsvLine(line, delimiter);
  let fallback = '';

  for (const cell of cells) {
    const value = extractPhoneCandidate(cell);
    if (!value) {
      continue;
    }

    const digits = toInternationalDigits(value);
    if (digits) {
      return { raw: value, digits };
    }

    if (!fallback) {
      fallback = value;
    }
  }

  if (!fallback) {
    const trimmed = stripBom(line.trim());
    if (!trimmed || isHeaderCell(trimmed)) {
      return { raw: trimmed, digits: null, reason: 'Empty or header row' };
    }

    const digits = toInternationalDigits(trimmed);
    return {
      raw: trimmed,
      digits,
      reason: digits ? undefined : 'No valid phone number found',
    };
  }

  const digits = toInternationalDigits(fallback);
  return {
    raw: fallback,
    digits,
    reason: digits ? undefined : `Invalid phone: ${fallback}`,
  };
}

function parseLine(
  line: string,
  lineNumber: number,
  delimiter: ',' | ';' | '\t',
): ParsedCsvRow | null {
  const trimmed = stripBom(line.trim());
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const { raw, digits, reason } = findPhoneInLine(trimmed, delimiter);
  if (!raw && !digits) {
    return null;
  }

  return {
    raw,
    digits,
    line: lineNumber,
    reason,
  };
}

export function parsePhoneCsv(text: string): CsvParseResult {
  const normalizedText = stripBom(text);
  const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const delimiter =
    lines.length > 0 ? detectDelimiter(lines[0]) : (',' as const);

  const valid: ParsedCsvRow[] = [];
  const invalid: ParsedCsvRow[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const parsed = parseLine(line, index + 1, delimiter);
    if (!parsed) {
      return;
    }

    if (!parsed.digits) {
      invalid.push(parsed);
      return;
    }

    if (seen.has(parsed.digits)) {
      return;
    }

    seen.add(parsed.digits);
    valid.push(parsed);
  });

  const totalParsed = valid.length + invalid.length;
  const duplicatesRemoved = Math.max(0, lines.length - totalParsed);

  return { valid, invalid, duplicatesRemoved };
}

export function phonesFromCsv(text: string): string[] {
  return parsePhoneCsv(text).valid.map((row) => row.digits as string);
}
