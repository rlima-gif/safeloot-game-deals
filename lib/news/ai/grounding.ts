import type { EditorialGroundingContext, GeneratedArticleText } from './types';

const NEUTRAL_PURCHASE_PATTERNS: RegExp[] = [
  /não muda de forma relevante a decisão de compra/i,
  /nao muda de forma relevante a decisao de compra/i,
];

const PURCHASE_VALUE_PATTERNS: RegExp[] = [
  /vale mais a pena comprar/i,
  /boa notícia/i,
  /boa noticia/i,
  /vale a pena comprar/i,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Output risk patterns (normalized, accent-insensitive).
// Each pattern covers singular/plural and common Portuguese inflections.
const DESEMPENHO_RE =
  /(melhor\w*|aument\w*|ganho\w*|maior(?:es)?|otimiz\w*|impulsion\w*|elev\w*|increment\w*)\s+(de\s+|do\s+|no\s+|em\s+|o\s+|a\s+)?desempenho|desempenho\s+(melhor\w*|aument\w*|ganho\w*|maior(?:es)?|otimiz\w*)|\bmais\s+(de\s+)?desempenho/;

const FPS_RE =
  /(melhor\w*|aument\w*|ganho\w*|maior(?:es)?)\s+(de\s+|do\s+|no\s+|em\s+|o\s+)?fps|fps\s+(melhor\w*|aument\w*|ganho\w*|maior(?:es)?)|melhoria\w*\s+de\s+fps|taxa de quadros\s+\w{0,30}?(melhor\w*|aument\w*|maior(?:es)?)|\bmais\s+(de\s+)?fps/;

const EXPERIENCIA_RE =
  /(melhor\w*|melhoria\w*|aument\w*)\s+(a\s+|de\s+|da\s+)?experiencia|experiencia\s+\w{0,30}?(melhor\w*|aument\w*)/;

const OTIMIZ_RE = /otimiz\w*/;

const STUTTER_RE = /stutt\w*|engasg\w*/;

const QUALIDADE_RE =
  /(melhor\w*|melhoria\w*|aument\w*)\s+(a\s+|de\s+|da\s+)?qualidade|qualidade\s+\w{0,30}?(melhor\w*|aument\w*)/;

export interface DeterministicGroundingCheck {
  approved: boolean;
  unsupportedClaims: string[];
}

export function checkDeterministicGrounding(
  context: EditorialGroundingContext,
  generatedText: GeneratedArticleText,
): DeterministicGroundingCheck {
  const unsupportedClaims: string[] = [];
  const factsText = normalize(context.facts.join(' '));
  const factualCopy = normalize(`${generatedText.title} ${generatedText.summary} ${generatedText.whyItMatters}`);
  const purchaseText = generatedText.purchaseAdvice.toLowerCase();

  // purchaseAdvice may use purchaseImpact directly.
  if (context.purchaseImpact === 'none') {
    const neutral = NEUTRAL_PURCHASE_PATTERNS.some((pattern) => pattern.test(purchaseText));
    if (purchaseText.includes('decisão de compra') || purchaseText.includes('decisao de compra')) {
      if (!neutral && !factsText.includes('decisão de compra') && !factsText.includes('decisao de compra')) {
        unsupportedClaims.push('Conselho de compra extrapola o impacto neutro aprovado.');
      }
    }
    for (const pattern of PURCHASE_VALUE_PATTERNS) {
      if (pattern.test(purchaseText) && !factsText.match(pattern)) {
        unsupportedClaims.push('Julgamento de valor de compra não suportado para purchaseImpact=none.');
        break;
      }
    }
  }

  // Factual copy: an improvement claim about desempenho/FPS/experiência/otimização/stutter/qualidade
  // is allowed ONLY when the approved facts explicitly state the same kind of consequence.
  // Technology names alone (FSR, XeSS, DLSS, frame generation) never count as support.
  const checks: Array<{ label: string; output: RegExp; supported: boolean }> = [
    {
      label: 'melhoria de desempenho sem suporte nos fatos',
      output: DESEMPENHO_RE,
      supported: DESEMPENHO_RE.test(factsText),
    },
    {
      label: 'melhoria de FPS sem suporte nos fatos',
      output: FPS_RE,
      supported: FPS_RE.test(factsText),
    },
    {
      label: 'melhoria de experiência sem suporte nos fatos',
      output: EXPERIENCIA_RE,
      supported: EXPERIENCIA_RE.test(factsText),
    },
    {
      label: 'otimização sem suporte nos fatos',
      output: OTIMIZ_RE,
      supported: OTIMIZ_RE.test(factsText),
    },
    {
      label: 'redução de stutter sem suporte nos fatos',
      output: STUTTER_RE,
      supported: STUTTER_RE.test(factsText),
    },
    {
      label: 'melhoria de qualidade sem suporte nos fatos',
      output: QUALIDADE_RE,
      supported: QUALIDADE_RE.test(factsText),
    },
  ];

  for (const check of checks) {
    if (check.output.test(factualCopy) && !check.supported) {
      unsupportedClaims.push(`Afirmação factual sem suporte nos fatos: ${check.label}.`);
    }
  }

  // Claim-level basis validation: declared fact:N references must exist.
  if (generatedText.claims) {
    for (const claim of generatedText.claims) {
      for (const basis of claim.basis) {
        const factMatch = basis.match(/^fact:(\d+)$/);
        if (factMatch) {
          const index = Number(factMatch[1]);
          if (!Number.isInteger(index) || index < 0 || index >= context.facts.length) {
            unsupportedClaims.push(`Claim referencia fato inexistente: "${claim.text}".`);
          }
        }
      }
    }
  }

  return {
    approved: unsupportedClaims.length === 0,
    unsupportedClaims,
  };
}
