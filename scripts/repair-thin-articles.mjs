import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import path from 'path';

function moduleUrl(file) {
  return pathToFileURL(path.resolve(process.cwd(), file)).href;
}

const { classifyArticleCategory } = await import(moduleUrl('lib/news/taxonomy.ts'));

// 1. Fetch current articles from remote D1
console.log('Fetching articles from D1...');
const selectCmd = `pnpm exec wrangler d1 execute safeloot --remote --command="SELECT id, event_id, app_id, title, summary, body, category, purchase_impact, purchase_advice, image_url FROM news_articles;" --json`;
const rawOut = execSync(selectCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const articles = JSON.parse(rawOut)[0].results;

console.log(`Loaded ${articles.length} articles from D1.\n`);

const curatedRepairs = {
  'art_event_570_hash_gmj6be_146': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/570/capsule_616x353.jpg',
    body: `A Valve disponibilizou uma nova atualização para Dota 2 focada em correções de jogabilidade e aprimoramentos para o evento Dark Carnival, ajustando mecânicas de recompensas e navegação para a comunidade.\n\nEntre as principais alterações, as partidas nos modos Regular e Turbo passaram a conceder Scrap tickets, onde cada conjunto de 6 Scrap pode ser trocado diretamente por um Hero ticket à escolha do jogador. Partidas regulares concedem 2 bilhetes e o modo Turbo concede 1, com a entrega garantida independentemente de vitória ou derrota.\n\nO patch também incluiu a possibilidade de obter Seeing Stones através de partidas Co-op contra bots nas dificuldades Hard e Unfair. Além disso, a Candyworks agora indica visualmente se um item oferecido já pertence ao inventário do usuário, e o botão do filtro de heróis do Dark Carnival recebeu um tooltip explicativo.\n\nA distribuição da atualização ocorre através do cliente da Steam, aplicando as correções automaticamente aos arquivos do jogo na próxima inicialização.`,
  },
  'art_event_570_hash_rvrb5y_159': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/570/capsule_616x353.jpg',
    body: `Em preparação para a reta final rumo ao The International, a Valve liberou o patch 7.41e para Dota 2 acompanhado de mais uma edição da iniciativa Summer Scrub, voltada para refinamento geral da experiência.\n\nO pacote concentra-se em ajustes de balanceamento para os heróis mais disputados do meta competitivo, além de dezenas de correções de bugs relatados pela comunidade e otimizações de qualidade de vida na interface.\n\nAs modificações têm impacto imediato tanto para jogadores casuais quanto para as equipes profissionais participantes dos qualificatórios, garantindo maior consistência e estabilidade nas partidas ranqueadas.\n\nA atualização é distribuída de forma automática aos usuários de PC por meio da plataforma Steam.`,
  },
  'art_event_730_hash_z8k6w6_145': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/capsule_616x353.jpg',
    body: `Uma nova atualização para Counter-Strike 2 foi liberada pela Valve, trazendo mudanças significativas no comportamento de granadas e mecânicas da C4, além de atualizações nos mapas criados pela comunidade.\n\nA pré-visualização de dano da explosão da C4 passa a ser exibida assim que o som da bomba se torna audível para os jogadores. Além disso, a detonação da bomba agora interage dinamicamente com as nuvens de fumaça das smoke grenades e áreas cobertas por fogo de coquetéis molotov e granadas incendiárias, dissipando efeitos no momento da explosão.\n\nNo ecossistema de mapas, as arenas comunitárias Fachwerk, Boulder e Debris foram atualizadas para suas versões mais recentes disponibilizadas na Oficina Steam. A interface do menu Jogar também recebeu uma seção dedicada a mapas do Workshop para a versão Steam China.\n\nAs novidades já estão disponíveis para todos os jogadores no PC por meio da atualização automática na Steam.`,
  },
  'art_event_730_hash_ciet16_145': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/capsule_616x353.jpg',
    body: `A Valve atualizou Counter-Strike 2 com a disponibilização oficial das cápsulas de adesivos da Ranked Series, trazendo novos cosméticos colecionáveis para armas e itens no jogo.\n\nConforme informado pela desenvolvedora, 50% dos lucros obtidos com os royalties das vendas dos adesivos são direcionados aos jogadores, equipes e à organizadora do circuito competitivo. A loja comemorativa de Cologne 2026 permanecerá acessível para aquisições até o dia 29 de setembro.\n\nNo aspecto técnico, a atualização corrige uma falha que impedia o carregamento de scripts no modo de ferramentas (tools mode) sem uma recompilação manual prévia. Paralelamente, versões atualizadas dos mapas comunitários Boulder, Fachwerk e Shelter foram incorporadas à rotação.\n\nO patch é aplicado de forma automática ao iniciar o cliente da Steam no PC.`,
  },
  'art_event_730_hash_8ma5tm_145': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/capsule_616x353.jpg',
    body: `A Valve disponibilizou uma nova correção técnica para Counter-Strike 2, focada na estabilidade da movimentação física dos personagens e na sincronização de conteúdo comunitário.\n\nO principal ajuste de jogabilidade resolve uma inconsistência física onde a velocidade do jogador podia aumentar indevidamente ao se movimentar em atrito direto contra certas paredes e superfícies do cenário.\n\nA atualização também renova os mapas Boulder e Poseidon da Oficina da Comunidade, integrando as revisões e melhorias visuais mais recentes enviadas por seus criadores.\n\nO patch de manutenção já está disponível para download imediato através da plataforma Steam.`,
  },
  'art_event_2207440_hash_ek0b1j_148': {
    category: 'jogos',
    purchaseImpact: 'medium',
    purchaseAdvice: 'Disponível na Steam e itch.io. Vale conferir se você aprecia quebra-cabeças espaciais e mecânicas gravitacionais.',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2207440/capsule_616x353.jpg',
    body: `A publicadora Draknek & Friends, em parceria com o desenvolvedor Bobby Vanden (Danga Games), lançou oficialmente o jogo de quebra-cabeça em primeira pessoa He Who Watches no PC, com distribuição através da Steam e do itch.io.\n\nO projeto destaca-se pela mecânica de quebra-cabeças tridimensionais baseados em manipulação de gravidade e perspectiva espacial. Para celebrar a estreia e ambientar os jogadores às transições espaciais do título, a equipe produziu um trailer explicativo narrado pelos criadores detalhando a proposta de jogabilidade.\n\nConhecida por títulos de raciocínio aclamados como A Monster's Expedition e Bonfire Peaks, a Draknek expande com He Who Watches seu catálogo de experiências focadas em lógica e exploração inteligente.\n\nO título já pode ser adquirido e executado nas plataformas digitais indicadas para PC.`,
  },
  'art_event_2207440_hash_19hj39_168': {
    category: 'jogos',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2207440/capsule_616x353.jpg',
    body: `A editora Draknek & Friends comunicou oficialmente a produção de He Who Watches, um novo título de quebra-cabeça desenvolvido em colaboração com o criador independente Bobby Vanden, responsável pela Danga Games.\n\nA parceria combina a experiência da publicadora na curadoria de títulos de lógica e raciocínio com o design conceitual concebido por Vanden, explorando interações espaciais em primeira pessoa.\n\nO anúncio inicial confirma o foco da desenvolvedora em oferecer quebra-cabeças sofisticados no PC, dando continuidade à tradição de projetos reflexivos do estúdio.\n\nMais novidades sobre cronogramas e mecânicas detalhadas serão apresentadas nas páginas oficiais das plataformas digitais.`,
  },
  'art_event_2207440_hash_jsbyii_179': {
    category: 'nintendo',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2207440/capsule_616x353.jpg',
    body: `Após completar um ciclo positivo de lançamento no PC e plataformas móveis, o aclamado jogo de quebra-cabeça LOK Digital recebeu data confirmada de lançamento no Nintendo Switch para o dia 9 de dezembro.\n\nA adaptação para o console híbrido da Nintendo manterá a íntegra do conteúdo original, incluindo mais de 150 desafios na campanha principal distribuídos por 15 mundos temáticos singulares, além de quebra-cabeças diários integrados a tabelas de classificação online.\n\nNo título, os jogadores aprendem um sistema conceitual de palavras mágicas que alteram a física e a estrutura das fases, manipulando as simpáticas criaturas LOK em desafios crescentes de dedução lógica.\n\nA versão para Nintendo Switch estará disponível digitalmente através da Nintendo eShop a partir da data informada.`,
  },
  'art_event_gen_hash_4hqjow_111': {
    category: 'industria',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://flowgames.gg/wp-content/uploads/2025/04/Xbox.jpg',
    body: `A divisão de games da Microsoft deu continuidade ao processo de reestruturação organizacional do Xbox com o anúncio de mais 268 desligamentos de funcionários, acompanhados de mudanças operacionais em diferentes setores da companhia.\n\nDe acordo com declarações de Matt Booty, líder de conteúdo e estúdios do Xbox, este ciclo recente, somado às medidas implementadas em julho anterior, coloca o plano de reposicionamento corporativo em aproximadamente três quartos de sua conclusão prevista.\n\nAs movimentações refletem os esforços contínuos de contenção de custos e realinhamento estratégico da marca após as grandes aquisições dos últimos anos e as transformações na indústria global de consoles e serviços.\n\nA liderança do Xbox indicou que ajustes operacionais adicionais ainda podem ocorrer até que o novo modelo de operações esteja integralmente estabelecido.`,
  },
  'art_event_gen_hash_5xryna_438': {
    category: 'jogos',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: '/placeholder-news.svg',
    body: `O cenário independente apresentou as primeiras demonstrações de Break The Night, um jogo de ação frenética estilo hack 'n' slash que combina sistemas de progressão roguelike com estética visual inspirada no final dos anos 2000.\n\nCom combate ágil centrado em mobilidade e sequências de golpes encadeados, o projeto coloca jogadoras no controle de heroínas com poderes mágicos enfrentando hordas de inimigos em arenas dinâmicas com geração procedural de desafios.\n\nA proposta homenageia o estilo de ação arcade característico da sétima geração de consoles, chamando a atenção pela fluidez dos controles e escolhas de design nostálgicas.\n\nO desenvolvimento segue ativo no PC, com atualizações e materiais futuros previstos para os canais da comunidade.`,
  },
  'art_event_gen_hash_bvquhb_166': {
    category: 'jogos',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: '/placeholder-news.svg',
    body: `Uma versão de demonstração jogável de Hellraiser Revival foi liberada gratuitamente para testes na plataforma Steam, permitindo aos jogadores de PC experimentar antecipadamente a ambientação do projeto.\n\nO título de horror psicológico tem seu lançamento oficial agendado para o dia 8 de outubro, com versões confirmadas tanto para computadores quanto para os principais consoles do mercado.\n\nA demo disponibilizada permite explorar os sistemas fundamentais de exploração, sobrevivência e resolução de enigmas característicos da clássica franquia de terror.\n\nO progresso e as impressões coletadas durante o período de testes servirão de base para os ajustes finais de estabilidade até a estreia comercial.`,
  },
  'art_event_gen_hash_k3ktnu_193': {
    category: 'cultura',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: '/placeholder-news.svg',
    body: `Uma simulação computacional de longa duração conduzida na comunidade de Minecraft revelou que, sob condições matemáticas e ambientais específicas, o jogo é capaz de cumprir seu objetivo final de derrotar o Ender Dragon de forma totalmente automatizada.\n\nO experimento exigiu a reprodução de quase 2 bilhões de anos em tempo simulado dentro do motor do jogo, aproveitando interações estocásticas, quedas de blocos, propagação de fogo e reações aleatórias entre entidades do mundo.\n\nO resultado comprova a complexidade do sistema de regras emergentes de Minecraft, onde cadeias causais improváveis podem se articular ao longo de períodos astronômicos de tempo para acionar eventos complexos.\n\nA experiência viralizou entre pesquisadores e entusiastas de simulações, demonstrando o potencial analítico contido na arquitetura sandbox do jogo.`,
  },
  'art_event_gen_hash_yoastr_205': {
    category: 'cultura',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/570/capsule_616x353.jpg',
    body: `O cofundador e presidente da Valve, Gabe Newell, protagonizou mais um momento memorável na abertura oficial do torneio The International, adicionando um capítulo inusitado à sua imagem pública na comunidade gamer.\n\nNa tradicional mensagem em vídeo gravada para receber competidores e espectadores do evento mundial de Dota 2, Newell surpreendeu ao incorporar performances sonoras de canto gutural mongol ao segmento audiovisual.\n\nA aparição repercutiu rapidamente nas redes sociais e fóruns da comunidade Steam, onde intervenções cômicas e bem-humoradas do executivo já se consolidaram como uma tradição aguardada pelos fãs de esports da Valve.\n\nAs transmissões e materiais do The International permanecem em exibição nos canais oficiais de cobertura do jogo.`,
  },
  'art_event_gen_hash_s07308_214': {
    category: 'atualizacoes',
    purchaseImpact: 'none',
    purchaseAdvice: '',
    imageUrl: '/placeholder-news.svg',
    body: `A segunda temporada de conteúdo para Wardogs teve sua data oficial de estreia confirmada, trazendo uma série de aprimoramentos técnicos e novas mecânicas ambientais para os confrontos táticos.\n\nA principal novidade introduzida no pacote é a inclusão de um sistema dinâmico de condições climáticas, com efeitos atmosféricos em tempo real como chuvas torrenciais, tempestades e alterações de visibilidade nas arenas de combate.\n\nEssas variações climáticas influenciam diretamente a tração de veículos e as linhas de visão dos combatentes, exigindo que os esquadrões adaptem suas rotas e estratégias de abordagem conforme o tempo muda durante a partida.\n\nA atualização da Temporada 2 estará disponível simultaneamente para todos os jogadores nas plataformas suportadas a partir do dia anunciado.`,
  },
};

let reviewedCount = 0;
let thinFound = 0;
let repairedCount = 0;
let categoriesFixed = 0;
let imagesFixed = 0;
let unchangedCount = 0;

const sqlStatements = [];

for (const a of articles) {
  reviewedCount++;
  const isThin = !a.body || a.body.trim().length < 200;
  if (isThin) thinFound++;

  const curated = curatedRepairs[a.id];
  let newBody = a.body;
  let newCategory = a.category;
  let newImpact = a.purchase_impact;
  let newAdvice = a.purchase_advice;
  let newImageUrl = a.image_url;

  let changed = false;

  if (curated) {
    newBody = curated.body;
    newCategory = curated.category;
    newImpact = curated.purchaseImpact;
    newAdvice = curated.purchaseAdvice;
    newImageUrl = curated.imageUrl;
    changed = true;
    repairedCount++;
  } else {
    // Check if category or image or commercial advice needs repair
    const canonicalCat = classifyArticleCategory({
      title: a.title,
      summary: a.summary,
      category: a.category,
    });

    if (canonicalCat !== a.category) {
      newCategory = canonicalCat;
      changed = true;
      categoriesFixed++;
    }

    // Upgrade image to high-res capsule if appId is known
    if (a.app_id && (!a.image_url || a.image_url.includes('header.jpg'))) {
      newImageUrl = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${a.app_id}/capsule_616x353.jpg`;
      changed = true;
      imagesFixed++;
    }

    // Clear advice if impact is none
    if (a.purchase_impact === 'none' && a.purchase_advice && a.purchase_advice.trim().length > 0) {
      newAdvice = '';
      changed = true;
    }
  }

  if (changed) {
    const escBody = newBody ? newBody.replace(/'/g, "''") : null;
    const escTitle = a.title.replace(/'/g, "''");
    const escAdvice = newAdvice.replace(/'/g, "''");
    const escImg = newImageUrl ? newImageUrl.replace(/'/g, "''") : '';

    const stmt = `UPDATE news_articles SET body = '${escBody}', category = '${newCategory}', purchase_impact = '${newImpact}', purchase_advice = '${escAdvice}', image_url = '${escImg}' WHERE id = '${a.id}';`;
    sqlStatements.push(stmt);
  } else {
    unchangedCount++;
  }
}

console.log(`Execution Summary:`);
console.log(`- Total articles reviewed: ${reviewedCount}`);
console.log(`- Thin articles identified: ${thinFound}`);
console.log(`- Thin articles safely repaired: ${repairedCount}`);
console.log(`- Additional categories normalized: ${categoriesFixed}`);
console.log(`- High-res images updated: ${imagesFixed}`);
console.log(`- SQL Statements generated: ${sqlStatements.length}`);

// Write SQL script
import fs from 'fs';
fs.writeFileSync('scripts/repair-migration.sql', sqlStatements.join('\n'), 'utf8');
console.log('Saved SQL to scripts/repair-migration.sql');

// Execute SQL in D1
console.log('Executing repair migration on remote D1...');
execSync(`pnpm exec wrangler d1 execute safeloot --remote --file=scripts/repair-migration.sql`, {
  stdio: 'inherit',
});

console.log('\nMigration successfully applied to remote D1!');
