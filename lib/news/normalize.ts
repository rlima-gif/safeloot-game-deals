import type { RawNewsItem } from './sources/config';

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&nbsp;/gi, ' ');
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function cleanSourceContent(rawHtmlOrText: string): string[] {
  if (!rawHtmlOrText) return [];

  let text = decodeHtmlEntities(rawHtmlOrText);

  text = text
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const containerMatch =
    text.match(
      /<(?:article|div)[^>]*(?:entry-content|post-content|article-content|article__body|article-body|newsPostContent)[^>]*>([\s\S]*?)<\/(?:article|div)>/i,
    ) || text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  const target = containerMatch ? containerMatch[1] : text;

  let rawChunks: string[] = [];
  if (/<p[^>]*>/i.test(target)) {
    const matches = target.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const m of matches) rawChunks.push(m[1]);
  } else {
    rawChunks = target.split(/\n\s*\n/);
  }

  const cleanParagraphs: string[] = [];

  for (const chunk of rawChunks) {
    let p = decodeHtmlEntities(
      chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    if (!p || p.length < 25) continue;

    // Filter out social share, headers, bylines, ads, newsletter, keywords
    if (
      /(copy link|share this article|join the conversation|follow us)/i.test(p)
    )
      continue;
    if (
      /^(imagem|foto|crédito|source|fonte|photo|image credit|watch on|por|by)\s*[:-]/i.test(
        p,
      )
    )
      continue;
    if (
      /^\d{1,2}[./]\d{1,2}[./]\d{2,4}\s+(às\s+)?\d{1,2}:\d{2}/i.test(p)
    )
      continue;
    if (
      /^(leia mais|confira também|veja mais|leia também|read more|confira os detalhes abaixo)\b/i.test(
        p,
      )
    )
      continue;
    if (
      /^(e você, imaginou|o que você achou|deixe seu comentário|comente abaixo|de fato, o mundo dá voltas)/i.test(
        p,
      )
    )
      continue;
    if (
      /(cancelar|diretor|entrevista|franquia|game|iizuka|ip|jogo|mascote|mercado|salvo|sega|série|sonic)\s+(cancelar|diretor|entrevista)/i.test(
        p,
      )
    )
      continue;
    if (
      /(sign in|iniciar sessão|store home|loja início|discovery queue|lista de descobrimento|wishlist|lista de desejos|points shop|loja de pontos|news hub|discussões|oficina|mercado|transmissões|suporte steam|acordo de assinatura do steam|termos legais|política de privacidade|baixar o steam)/i.test(
        p,
      )
    )
      continue;
    if (
      /(low games|lowgames\.com|descontos em jogos, acessórios, consoles|gift cards e muito mais)/i.test(
        p,
      )
    )
      continue;
    if (
      /(read the full article here|image credit:|\(image credit:|\(?imagem:|photo:)/i.test(
        p,
      )
    )
      continue;
    if (
      /(alterar idioma|baixe o aplicativo móvel|ver versão para computadores|todos os direitos reservados|relatar um problema com a tradução|simp\. |tradicional)/i.test(
        p,
      )
    )
      continue;

    // Clean inline noise prefixes
    p = p.replace(/^imagem:\s*[^.]*?\s+/i, '');
    p = p.replace(/\s*confira os detalhes abaixo!/i, '');

    if (p.length >= 25 && !cleanParagraphs.includes(p)) {
      cleanParagraphs.push(p);
    }
  }

  return cleanParagraphs;
}

export function computeNewsItemHash(item: {
  sourceId: string;
  articleId?: string;
  articleUrl: string;
  title: string;
}): string {
  const str = `${item.sourceId}:${item.articleId || ''}:${item.articleUrl.toLowerCase().trim()}:${item.title.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(36)}_${str.length}`;
}

export function normalizeTimestamp(input: string | number | undefined): string {
  if (!input) return new Date().toISOString();
  let date: Date;
  if (typeof input === 'number') {
    date = new Date(input < 1e11 ? input * 1000 : input);
  } else {
    date = new Date(input);
  }
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function cleanUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let clean = url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '')
    .replace(/^["']|["']$/g, '');
  if (clean.startsWith('//')) {
    clean = `https:${clean}`;
  }
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return undefined;
  }
  return clean;
}

export function normalizeRawNewsItem(item: Partial<RawNewsItem> & { sourceId: string; sourceName: string; articleUrl: string; title: string }): RawNewsItem {
  const collectedAt = item.collectedAt ? normalizeTimestamp(item.collectedAt) : new Date().toISOString();
  const publishedAt = item.publishedAt ? normalizeTimestamp(item.publishedAt) : collectedAt;
  const cleanSnippet = item.snippet ? stripHtml(item.snippet).slice(0, 4000) : undefined;
  const cleanTitle = stripHtml(item.title).slice(0, 300);

  return {
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    sourceType: item.sourceType || 'official',
    articleId: item.articleId || item.articleUrl,
    articleUrl: item.articleUrl,
    title: cleanTitle,
    snippet: cleanSnippet,
    publishedAt,
    collectedAt,
    appId: item.appId && Number.isInteger(item.appId) && item.appId > 0 ? item.appId : undefined,
    imageUrl: cleanUrl(item.imageUrl),
  };
}
