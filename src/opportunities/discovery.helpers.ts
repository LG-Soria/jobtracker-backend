import { PostingLocationType, PostingMacroRegion } from './discovery.types';

const latamCountryAliases = [
  'argentina',
  'buenos aires',
  'caba',
  'mexico',
  'colombia',
  'chile',
  'uruguay',
  'peru',
  'brazil',
  'brasil',
  'ecuador',
  'costa rica',
  'latam',
  'latin america',
  'latin-america',
  'south america',
  'sudamerica',
];

const countryLookup: Array<{ pattern: RegExp; code: string; region: PostingMacroRegion; aliases: string[] }> = [
  { pattern: /\b(argentina|buenos aires|caba)\b/i, code: 'AR', region: 'LATAM', aliases: ['argentina', 'buenos aires', 'caba'] },
  { pattern: /\b(mexico|méxico)\b/i, code: 'MX', region: 'LATAM', aliases: ['mexico'] },
  { pattern: /\b(colombia)\b/i, code: 'CO', region: 'LATAM', aliases: ['colombia'] },
  { pattern: /\b(chile)\b/i, code: 'CL', region: 'LATAM', aliases: ['chile'] },
  { pattern: /\b(uruguay)\b/i, code: 'UY', region: 'LATAM', aliases: ['uruguay'] },
  { pattern: /\b(peru|perú)\b/i, code: 'PE', region: 'LATAM', aliases: ['peru'] },
  { pattern: /\b(brazil|brasil)\b/i, code: 'BR', region: 'LATAM', aliases: ['brazil', 'brasil'] },
  { pattern: /\b(united states|usa|us\b|new york|san francisco)\b/i, code: 'US', region: 'NORTH_AMERICA', aliases: ['usa', 'us', 'united states'] },
  { pattern: /\b(canada|toronto|vancouver|montreal)\b/i, code: 'CA', region: 'NORTH_AMERICA', aliases: ['canada', 'toronto', 'vancouver', 'montreal'] },
  { pattern: /\b(estonia|tallinn)\b/i, code: 'EE', region: 'EUROPE', aliases: ['estonia', 'tallinn'] },
  { pattern: /\b(spain|españa)\b/i, code: 'ES', region: 'EUROPE', aliases: ['spain'] },
  { pattern: /\b(portugal)\b/i, code: 'PT', region: 'EUROPE', aliases: ['portugal'] },
  { pattern: /\b(germany)\b/i, code: 'DE', region: 'EUROPE', aliases: ['germany'] },
  { pattern: /\b(france)\b/i, code: 'FR', region: 'EUROPE', aliases: ['france'] },
  { pattern: /\b(united kingdom|uk\b|london)\b/i, code: 'GB', region: 'EUROPE', aliases: ['uk', 'united kingdom'] },
  { pattern: /\b(pakistan|pk\b|lahore|karachi|islamabad)\b/i, code: 'PK', region: 'APAC', aliases: ['pakistan', 'pk', 'lahore', 'karachi', 'islamabad'] },
  { pattern: /\b(india|kolkata|pune|bangalore|bengaluru|mumbai|delhi|hyderabad|chennai)\b/i, code: 'IN', region: 'APAC', aliases: ['india', 'kolkata', 'pune', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'chennai'] },
  { pattern: /\b(singapore)\b/i, code: 'SG', region: 'APAC', aliases: ['singapore'] },
  { pattern: /\b(australia)\b/i, code: 'AU', region: 'APAC', aliases: ['australia'] },
  { pattern: /\b(japan)\b/i, code: 'JP', region: 'APAC', aliases: ['japan'] },
];

export function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function stripHtml(value: string | null | undefined) {
  return normalizeWhitespace(
    (value ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSemanticFingerprint(company: string, title: string) {
  return `${normalizeFingerprintToken(company)}-${normalizeTitleForFingerprint(title)}`.replace(/(^-|-$)/g, '');
}

function normalizeTitleForFingerprint(title: string) {
  return normalizeFingerprintToken(
    title
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\(([^)]*)\)/g, (_, content: string) =>
        /\b(remote|remoto|hybrid|hibrid|full[\s-]?time|part[\s-]?time|contract|freelance|latam|emea|apj|usa|us|uk|pk|argentina|brazil|colombia|mexico|spain|france|germany|portugal|singapore|japan|australia|canada|sao paulo|san francisco|new york)\b/i.test(
          content,
        )
          ? ' '
          : ` ${content} `,
      )
      .replace(/\s+-\s+(remote|remoto|hybrid|hibrid|full[\s-]?time|part[\s-]?time|contract|freelance|latam|emea|apj|usa|us|uk|pk)\b.*$/gi, ' ')
      .replace(/\s+-\s+[A-Z]{2,4}\d*\s*$/g, ' ')
      .replace(/\b(remote|remoto|hybrid|hibrid|full[\s-]?time|part[\s-]?time|contract|freelance)\b/gi, ' '),
  );
}

function normalizeFingerprintToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function extractEmail(value: string | null | undefined) {
  return value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

export function detectLocationType(text: string) {
  if (/\b(hybrid|hibrid)\b/i.test(text)) {
    return 'HYBRID' as PostingLocationType;
  }
  if (/\b(remote|remoto|anywhere|worldwide|global|distributed)\b/i.test(text)) {
    return 'REMOTE' as PostingLocationType;
  }
  if (text.trim()) {
    return 'ONSITE' as PostingLocationType;
  }
  return 'UNKNOWN' as PostingLocationType;
}

export function detectRemoteScope(text: string) {
  if (/\b(latam|latin america|latin-america)\b/i.test(text)) {
    return 'LATAM';
  }
  if (/\b(worldwide|global|anywhere)\b/i.test(text)) {
    return 'GLOBAL';
  }
  if (/\b(emea)\b/i.test(text)) {
    return 'EMEA';
  }
  if (/\b(apac)\b/i.test(text)) {
    return 'APAC';
  }
  return null;
}

export function detectCountryAndRegion(text: string) {
  for (const entry of countryLookup) {
    if (entry.pattern.test(text)) {
      return {
        countryCode: entry.code,
        macroRegion: entry.region,
        aliases: entry.aliases,
      };
    }
  }

  if (/\b(latam|latin america|latin-america|south america|sudamerica)\b/i.test(text)) {
    return {
      countryCode: null,
      macroRegion: 'LATAM' as PostingMacroRegion,
      aliases: [...latamCountryAliases],
    };
  }

  if (/\b(worldwide|global|anywhere)\b/i.test(text)) {
    return {
      countryCode: null,
      macroRegion: 'GLOBAL' as PostingMacroRegion,
      aliases: ['worldwide', 'global', 'anywhere'],
    };
  }

  return {
    countryCode: null,
    macroRegion: 'UNKNOWN' as PostingMacroRegion,
    aliases: [],
  };
}

export function detectRoleSignals(text: string) {
  const signals = new Set<string>();

  if (/\b(front\s*end|frontend|ui|web)\b/i.test(text)) {
    signals.add('frontend');
  }
  if (/\b(full\s*stack|fullstack)\b/i.test(text)) {
    signals.add('fullstack');
  }
  if (/\b(back\s*end|backend|api|server|node)\b/i.test(text)) {
    signals.add('backend');
  }

  return [...signals];
}

export function detectTechSignals(text: string) {
  const technologies = ['react', 'next', 'next.js', 'typescript', 'javascript', 'node', 'python', 'vue', 'angular'];
  return technologies.filter((technology) =>
    new RegExp(`\\b${technology.replace('.', '\\.')}\\b`, 'i').test(text),
  );
}

export function detectSenioritySignals(text: string) {
  const signals = new Set<string>();
  if (/\b(junior|jr\.?)\b/i.test(text)) {
    signals.add('junior');
  }
  if (/\b(mid|semi senior|semi-senior|mid-level)\b/i.test(text)) {
    signals.add('mid');
  }
  if (/\b(senior|sr\.?)\b/i.test(text)) {
    signals.add('senior');
  }
  if (/\b(lead|staff|principal)\b/i.test(text)) {
    signals.add('lead');
  }
  return [...signals];
}

export function normalizeLocationPreferences(locations: string[]) {
  const aliases = new Set<string>();

  for (const location of locations) {
    const normalized = normalizeToken(location);
    if (!normalized || normalized === 'remote' || normalized === 'remoto') {
      continue;
    }

    if (/(latam|latin america|latin-america|south america|sudamerica)/i.test(normalized)) {
      for (const alias of latamCountryAliases) {
        aliases.add(alias);
      }
      continue;
    }

    if (/argentina/i.test(normalized)) {
      aliases.add('argentina');
      aliases.add('buenos aires');
      aliases.add('caba');
      continue;
    }

    aliases.add(normalized);
  }

  return aliases;
}

export function normalizeSeniorityPreference(value: string | null | undefined) {
  const normalized = normalizeToken(value ?? '');
  if (!normalized) {
    return null;
  }

  if (/\b(junior|jr)\b/i.test(normalized)) {
    return 'junior';
  }
  if (/\b(mid|semi senior|semi-senior)\b/i.test(normalized)) {
    return 'mid';
  }
  if (/\b(senior|sr|lead|staff|principal)\b/i.test(normalized)) {
    return 'senior';
  }

  return normalized;
}
