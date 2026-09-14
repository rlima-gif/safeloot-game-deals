import type { EditorialGroundingContext, GeneratedArticleText } from './types';

interface GuardPattern {
  label: string;
  output: RegExp;
  support: RegExp;
}

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

const FACTUAL_GUARD_PATTERNS: GuardPattern[] = [
  {
    label: 'melhora de desempenho não suportada',
    output: /melhor(a|ar)?\s+(o\s+)?desempenho/i,
    support: /melhor(a|ar)?\s+(o\s+)?desempenho|desempenho\s+melhor|performance\s+(melhor|aument|improved)/i,
  },
  {
    label: 'aumento de desempenho não suportado',
    output: /aument(a|ar)?\s+(o\s+)?desempenho/i,
    support: /aument(a|ar)?\s+(o\s+)?desempenho|desempenho\s+(maior|aument)/i,
  },
  {
    label: 'aumento de FPS não suportado',
    output: /aument(a|ar)?\s+(o\s+)?fps|fps\s+(maior|aument|melhor)/i,
    support: /fps\s+(maior|aument|melhor)|taxa de quadros\s+(maior|melhor|aument)/i,
  },
  {
    label: 'melhora de experiência não suportada',
    output: /melhor(a|ar)?\s+a\s+experi[êe]ncia/i,
    support: /melhor(a|ar)?\s+a\s+experi[êe]ncia|experi[êe]ncia\s+melhor/i,
  },
  {
    label: 'jogo melhor/otimizado sem suporte',
    output: /torna o jogo melhor|mais otimizado|reduz\s+stutter|melhor qualidade/i,
    support: /torna o jogo melhor|mais otimizado|reduz\s+stutter|melhor qualidade/i,
  },
  {
    label: 'tecnologia de melhoria de desempenho sem suporte',
    output: /tecnologias?\s+de\s+melhoria\s+de\s+desempenho/i,
    support: /tecnologias?\s+de\s+melhoria\s+de\s+desempenho/i,
  },
];

export interface DeterministicGroundingCheck {
  approved: boolean;
  unsupportedClaims: string[];
}

export function checkDeterministicGrounding(
  context: EditorialGroundingContext,
  generatedText: GeneratedArticleText,
): DeterministicGroundingCheck {
  const unsupportedClaims: string[] = [];
  const factsText = context.facts.join(' ').toLowerCase();
  const factualCopy = `${generatedText.title} ${generatedText.summary} ${generatedText.whyItMatters}`.toLowerCase();
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

  for (const pattern of FACTUAL_GUARD_PATTERNS) {
    if (pattern.output.test(factualCopy) && !pattern.support.test(factsText)) {
      unsupportedClaims.push(`Afirmação factual sem suporte nos fatos: ${pattern.label}.`);
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
