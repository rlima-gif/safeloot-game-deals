import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type ClassificationResult,
  type GeneratedArticleText,
  type VerificationResult,
  type NewsCategory,
  type PurchaseImpact,
  CANONICAL_CATEGORIES,
} from './types';
import {
  validateEditorResponse,
  validateWriterResponse,
  validateVerifierResponse,
} from './openai-provider';

export interface CloudflareAiRunOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: { type: 'json_object' | 'json_schema'; [key: string]: unknown };
  max_tokens?: number;
}

export type CloudflareAiRunFn = (
  model: string,
  inputs: CloudflareAiRunOptions,
) => Promise<Record<string, unknown> | { response?: string | Record<string, unknown> }>;

export class CloudflareWorkersAINewsAIProvider implements NewsAIProvider {
  readonly providerType = 'cloudflare' as const;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly customAiRun?: CloudflareAiRunFn;

  constructor(options: {
    model?: string;
    timeoutMs?: number;
    customAiRun?: CloudflareAiRunFn;
  } = {}) {
    this.model = options.model || process.env.NEWS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';
    this.timeoutMs = options.timeoutMs || (process.env.NEWS_AI_TIMEOUT_MS ? Number(process.env.NEWS_AI_TIMEOUT_MS) : 12000);
    this.customAiRun = options.customAiRun;
  }

  private async runAi(messages: Array<{ role: 'system' | 'user'; content: string }>, schemaName: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let runner = this.customAiRun;

      if (!runner) {
        let env: { AI?: { run: CloudflareAiRunFn } } | null = null;
        try {
          const imported = await import('cloudflare:workers');
          env = imported.env as unknown as { AI?: { run: CloudflareAiRunFn } };
        } catch {
          // Outside Workers runtime
        }

        if (!env?.AI || typeof env.AI.run !== 'function') {
          throw new Error('Cloudflare Workers AI binding (env.AI) não está disponível neste ambiente.');
        }

        runner = env.AI.run.bind(env.AI);
      }

      const rawResult = await Promise.race([
        runner(this.model, {
          messages,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error(`Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`)),
          );
        }),
      ]);

      if (!rawResult || typeof rawResult !== 'object') {
        throw new Error(`Resposta inválida do Cloudflare Workers AI (${schemaName}).`);
      }

      let textContent = '';

      if ('response' in rawResult) {
        if (typeof rawResult.response === 'string') {
          textContent = rawResult.response.trim();
        } else if (rawResult.response && typeof rawResult.response === 'object') {
          return rawResult.response as Record<string, unknown>;
        }
      } else if ('text' in rawResult && typeof rawResult.text === 'string') {
        textContent = rawResult.text.trim();
      } else if ('result' in rawResult && typeof rawResult.result === 'object') {
        return rawResult.result as Record<string, unknown>;
      }

      if (!textContent) {
        throw new Error(`Cloudflare Workers AI retornou saída textual vazia (${schemaName}).`);
      }

      const match = textContent.match(/\{[\s\S]*\}/);
      const jsonStr = match ? match[0] : textContent;

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`JSON malformado do Cloudflare Workers AI (${schemaName}).`);
      }

      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult> {
    const systemPrompt = `Você é o Editor do SafeLoot, curador de notícias para jogadores de PC no Brasil.
Sua tarefa é analisar o evento e retornar estritamente um objeto JSON.
Categorias válidas: ${CANONICAL_CATEGORIES.join(', ')}.
Impactos de compra válidos: none, low, medium, high.

Regras:
1. Extraia apenas fatos fundamentados nas fontes. NUNCA invente fatos.
2. Se a notícia for baseada em rumores, vazamentos ou fontes não oficiais, defina rumor=true.
3. Se rumor=true, safeToPublish DEVE ser false.
4. Se o evento não se encaixa nas categorias principais, use "other".
5. importance deve ser número de 0 a 100.
6. confidence deve ser número de 0.0 a 1.0.

Retorne JSON no formato:
{
  "safeToPublish": boolean,
  "category": string,
  "importance": number,
  "confidence": number,
  "purchaseImpact": "none" | "low" | "medium" | "high",
  "rumor": boolean,
  "facts": string[]
}`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').slice(0, 300)}`,
      )
      .join('\n\n');

    const userPrompt = `Evento: ${eventTitle}\n\nItens das fontes:\n${itemsSummary}`;

    const raw = await this.runAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'EditorClassification',
    );

    const validated = validateEditorResponse(raw);
    return {
      ...validated,
      providerType: 'cloudflare',
    };
  }

  async write(
    facts: string[],
    context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact },
  ): Promise<GeneratedArticleText> {
    const systemPrompt = `Você é o Redator do SafeLoot. Escreva em Português do Brasil de forma natural, útil, direta e sem sensacionalismo ou clickbait.

Contrato rígido entre CÓPIA FATUAL e JULGAMENTO DE COMPRA:
- title, summary e whyItMatters são CÓPIA FATUAL: contenham somente afirmações diretamente fundamentadas nos fatos aprovados, identidade do jogo e categoria.
- purchaseAdvice é JULGAMENTO DE COMPRA: pode usar purchaseImpact aprovado além dos fatos.
- NUNCA deduza consequências técnicas a partir de conhecimento geral do modelo. Exemplo: "Suporte a AMD FSR 3 foi adicionado" NÃO autoriza automaticamente "FSR 3 melhora o desempenho", "FSR 3 aumenta FPS", "FSR 3 melhora a experiência" ou "é uma boa notícia" a menos que esses efeitos estejam explicitamente presentes nos fatos/contexto aprovado.
- Para purchaseImpact=none, linguagem neutra como "Isso não muda de forma relevante a decisão de compra" é permitida; "é uma boa notícia", "melhora a experiência" ou "vale mais a pena comprar" exigem suporte separado nos fatos.
- Cada afirmação gerada deve declarar sua base declarada em claims[]: fact:N, category, purchaseImpact ou gameIdentity.
- Use APENAS os fatos aprovados. NUNCA invente preços, descontos, suporte de plataforma, DRM ou disponibilidade.
- Se o impacto na compra for "none", mantenha a dica de compra neutra.

Retorne JSON no formato:
{
  "title": string,
  "summary": string,
  "whyItMatters": string,
  "purchaseAdvice": string,
  "claims": [{"text": string, "basis": string[]}]
}`;

    const userPrompt = `Jogo: ${context.gameTitle || 'PC'}\nCategoria: ${context.category}\nImpacto na Compra: ${context.purchaseImpact}\nFatos Aprovados:\n${facts.map((f) => `- ${f}`).join('\n')}`;

    const raw = await this.runAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'WriterText',
    );

    return validateWriterResponse(raw);
  }

  async verify(context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact; facts: string[] }, generatedText: GeneratedArticleText): Promise<VerificationResult> {
    const systemPrompt = `Você é o Verificador de Fatos do SafeLoot.
Sua única função é checar se TODAS as declarações no texto gerado (título, resumo, por que importa e conselho de compra) são 100% suportadas pelo contexto editorial aprovado.

Contexto aprovado disponível:
- fatos aprovados
- categoria aprovada
- impacto na compra aprovado
- identidade do jogo aprovada

Regras de aprovação:
- Afirmações derivadas diretamente dos fatos aprovados: APROVAR.
- Enunciados neutros sobre decisão de compra quando purchaseImpact=none, por exemplo "Isso não muda de forma relevante a decisão de compra": APROVAR.
- Linguagem de impacto proporcional ao purchaseImpact aprovado (alto/médio/baixo/nenhum): APROVAR.
- Menção fiel da categoria e identidade do jogo do contexto aprovado: APROVAR.
- Qualquer preço, desconto, disponibilidade, plataforma, DRM, data ou causalidade de desempenho/qualidade NÃO presente nos fatos/contexto: REPROVAR e listar como unsupportedClaims.

Retorne JSON no formato:
{
  "approved": boolean,
  "unsupportedClaims": string[]
}`;

    const userPrompt = `Contexto Editorial Aprovado:\nJogo: ${context.gameTitle || 'PC'}\nCategoria: ${context.category}\nImpacto na Compra: ${context.purchaseImpact}\nFatos Aprovados:\n${context.facts.map((f) => `- ${f}`).join('\n')}\n\nTexto Gerado:\nTítulo: ${generatedText.title}\nResumo: ${generatedText.summary}\nPor que importa: ${generatedText.whyItMatters}\nConselho de compra: ${generatedText.purchaseAdvice}`;

    const raw = await this.runAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'VerifierCheck',
    );

    return validateVerifierResponse(raw);
  }
}
