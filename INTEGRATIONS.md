# SafeLoot — integrações de preços e conteúdo

Atualizado em 10/09/2026. Sem novas dependências. O frontend mantém a direção Violeta.

## O que está funcionando

- Consultas diretas existentes: Steam, GOG, Hype Games, GamersGate e resgates da Epic. BRL deve vir explicitamente da fonte; valores em USD ficam separados e não participam do menor preço em reais.
- Crítica: nota Metacritic fornecida pelo catálogo Steam, com link validado para a fonte. Nota de usuários não substitui nota profissional. Ausência de nota é apresentada sem estimativa.
- Ordem: crítica → comparação → histórico → trailer. Compra rápida permanece na lateral e na barra mobile.
- YouTube: carregamento por clique, domínio de privacidade aprimorada, link externo alternativo. Cyberpunk 2077 e Hades possuem IDs verificados; outros jogos mostram um estado de ausência e link para os vídeos da Steam.
- Kinguin/Eneba: diretório e bloco separado de marketplaces. **Não há consulta automática de preços dessas duas lojas nesta entrega.** As APIs comerciais exigem acesso e validação do contrato de preços de consumidor; inserir uma chave por si só ainda não ativa um conector.

## Conector ITAD preparado, ainda inativo

O conector resolve o jogo pelo Steam AppID, consulta preços no país BR e aceita apenas BRL. Preserva URLs de afiliados; remove ofertas expiradas, cupons e moedas incompatíveis. Consultas de preços possuem cache de cinco minutos, limitado a 500 jogos por processo. Fontes diretas têm precedência sobre duplicatas.

O gráfico usa registros da **Steam Brasil**, separados por período (90/180/365 dias). Não é o histórico combinado de todas as lojas nem uma linha artificial criada com a mínima histórica. Sem credenciais, não há pontos fictícios.

Os [termos do ITAD](https://github.com/IsThereAnyDeal/API/blob/master/TERMS_OF_SERVICE.md) restringem aplicações concorrentes. Para SafeLoot, obtenha autorização explícita do provedor antes de habilitar. Após isso, configure no servidor:

```dotenv
ITAD_API_KEY=chave_obtida_no_provedor
ITAD_USE_APPROVED=true
```

Nunca use prefixo `NEXT_PUBLIC_`/`VITE_` para credenciais. Reinicie o servidor após configurar. Em hospedagem, use o mecanismo de segredos do ambiente; não comite chaves. Preços e histórico ao vivo do ITAD não foram testados com credencial nesta entrega. Ofertas pagas da Epic via ITAD dependem dessa ativação e da cobertura regional do provedor.

## Cobertura e acesso

| Fonte | API / método | Custo e cadastro | Brasil / BRL | Endpoint / referência |
|---|---|---|---|---|
| Steam | Endpoint público da loja, sem contrato oficial para preços | Sem chave; não há cobrança por chamada documentada para esse endpoint | `cc=BR`; validar `price_overview.currency` | `https://store.steampowered.com/api/appdetails?appids=1091500&cc=BR&l=brazilian` |
| GOG | Catálogo público não documentado; sem garantia de estabilidade | Sem chave e sem cobrança observada | `countryCode=BR&currencyCode=BRL`; validar retorno | `https://catalog.gog.com/v1/catalog?query=Cyberpunk&limit=20&countryCode=BR&currencyCode=BRL&locale=en-US` |
| Epic | Endpoint público de promoções usado pela loja; não confundir com API de desenvolvedores | Dados básicos sem chave; sem cobrança observada | `country=BR`, validar moeda e janela de resgate | `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR` |
| Nuuvem | Leitura direta do HTML da página do produto; também existe API oficial para parceiros selecionados | Leitura pública sem chave; API oficial exige aprovação e token, custo comercial a confirmar | Metadados BRL, preço em centavos, estoque, título e plataforma PC validados | `/br-pt/item/{slug}`; [API oficial](https://docs.nuuvem.com/) |
| Kinguin | API oficial eCommerce, além de recursos de sellers | Conta, solicitação e aprovação comercial; condições/custos a confirmar | Não assumir BRL nem preço final do consumidor a partir de valor de parceiro | `GET https://gateway.kinguin.net/esa/api/v1/products`, header `X-Api-Key`; [guia oficial](https://github.com/kinguinltdhk/Kinguin-eCommerce-API/blob/master/quickstart/README.md) |
| Eneba | API GraphQL de parceiros | Conta comercial, credenciais/token; condições/custos a confirmar | Catálogo atacadista pode diferir do varejo; BRL final não confirmado | [documentação oficial](https://api.eneba.com/documentation/guide/getting-started/), sandbox `https://api-sandbox.eneba.com/graphql/` |
| ITAD | API oficial | Cadastro de aplicativo/chave; acesso público sujeito a limites e termos, autorização específica para este comparador | `country=BR`; filtrar `currency=BRL` | `GET /games/lookup/v1?appid=…`, `POST /games/prices/v3?country=BR&deals=false&vouchers=false&capacity=0` com corpo `[UUID]`, `GET /games/history/v2?id=UUID&country=BR&shops=61&since=ISO`; [documentação](https://docs.isthereanydeal.com/) |
| Metacritic | Sem API pública própria utilizada; metadados da Steam | Sem chave adicional nesta implementação | Nota PC, não depende de moeda | Campo `metacritic` do Steam appdetails; link à crítica original |
| OpenCritic | Alternativa via RapidAPI, não necessária à implementação Metacritic | Chave e assinatura do plano; franquia gratuita atual não confirmada | Nota não depende de moeda | [planos do provedor](https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api/pricing) |
| YouTube | Embed oficial; Data API opcional para descoberta futura | Embed por ID sem cadastro/chave; Data API exige projeto/chave e cotas | Não depende de moeda | `https://www.youtube-nocookie.com/embed/VIDEO_ID`; [player](https://developers.google.com/youtube/player_parameters), [Data API](https://developers.google.com/youtube/v3/getting-started) |

Integrações usam `fetch` nativo. Não foi instalada biblioteca de scraping, gráficos ou vídeo. Scraping não é tratado como única alternativa para Kinguin/Eneba.

## Ampliar trailers sem chave

Cadastre no servidor `YOUTUBE_TRAILERS_JSON` como objeto por Steam AppID. Cada entrada requer `videoId` (11 caracteres), `publisher` e `sourceUrl` HTTPS da publicação oficial. Confirme o canal/publicação antes de cadastrar. Configuração inválida cai na curadoria existente sem derrubar a página. Exemplo:

```json
{"1091500":{"videoId":"BO8lX3hDU30","publisher":"CD PROJEKT RED","sourceUrl":"https://www.cdprojekt.com/en/media/news/gameplay-trailer-for-cyberpunk-2077-released/"}}
```

A curadoria é explícita; o site não apresenta o primeiro resultado de uma busca como trailer oficial. Busca automática via YouTube Data API e OpenCritic não estão implementados nem são necessários para exibir o embed e a nota atuais.


## Documento incremental aplicado

1. **Lojas e keys:** cadastro único em `lib/stores.ts`, com 15 lojas oficiais e 10 keyshops/marketplaces. Filtros Todas/Oficiais/Keys na comparação e no diretório. Cadastrar uma loja não significa obter automaticamente preços dela: cada fonte continua precisando de integração real. Campos opcionais em `LiveOffer` permitem preço final com taxas, pagamento, parcelamento, cupom, cashback e ativação no Brasil, apresentados somente quando fornecidos.
2. **Monetização:** ofertas da comparação, compra rápida e lista usam `/go/{store}/{offer}?appid=…&title=…`. O servidor refaz a consulta e resolve a oferta por ID/loja; não aceita um destino arbitrário enviado pelo navegador. Links afiliados têm identificação visível. As URLs de agregadores preservam o rastreamento original.
3. **Histórico:** gráfico existente reutilizado. A análise exige registros válidos em BRL da Steam cobrindo 90 dias, com ao menos três eventos no período incluindo o preço de abertura. Médias são ponderadas pelo tempo, não uma média simples dos eventos de mudança. Mínima/diferença são relativas ao período conhecido, não a toda a vida do jogo.
4. **Vale comprar agora:** nota determinística e metodologia visível, baseada na proximidade da mínima, média, desconto e frequência de quedas. Não aparece nota numérica sem dados suficientes. Como ITAD está inativo, o estado atual informa essa ausência.
5. **Alertas:** regras locais por AppID para limite de preço, desconto e novo mínimo. `enabled:false` explícito: nenhuma notificação ou monitoramento externo foi ativado.
6. **Cloud:** componente reutilizável e metadados opcionais com fonte; estado padrão “Disponibilidade em nuvem ainda não verificada.” Provedores podem ser cadastrados como dados, sem refazer o componente.
7. **Deck/Linux:** Linux nativo é informado apenas quando a Steam o declara. Campos Deck/ProtonDB estão preparados, mas ocultos sem dados. Linux nativo não é apresentado como verificação Steam Deck.
8. **Assinaturas:** componente recebe qualquer provedor com fonte confirmada; não mostra card vazio nem presume Game Pass/EA Play/Ubisoft+/PS Plus.
9. **Brasil:** ranking usa BRL, separa USD, permite Brasil/LATAM/Global e sinalização explícita de ativação quando conhecida. Preço regional não vira automaticamente uma promessa de ativação.
10. **Descoberta:** atalhos reutilizam filtros de descontos, até R$20, populares e grátis. Seções de mínimas históricas, quedas históricas e melhores keys não foram preenchidas por falta de uma base confirmada dessas ofertas.
11. **Compras:** lista local com até 20 jogos, atualização de preços, remoção, filtro por tipo de loja e menor subtotal das ofertas salvas. Jogos sem oferta aparecem como não cobertos; não entram como gratuitos no cálculo. Sem checkout próprio.
12. **Arquitetura:** componentes e rotas existentes preservados; extensões pequenas, tipos genéricos e nenhuma dependência adicionada. Não foi criado banco ou API fictícia.

### Configuração opcional de afiliados

`STORE_AFFILIATES_JSON` é um objeto por ID do cadastro de lojas. Cada entrada aceita `affiliate_url`, `affiliate_id` e `tracking_parameters`. A URL afiliada usa `{url}` para receber o destino codificado e `{affiliate_id}` para o identificador. Sem configuração, mantém o destino original. Exemplo ilustrativo de formato (substituir somente após adesão real ao programa):

```json
{"steam":{"affiliate_id":"ID_DO_PROGRAMA","tracking_parameters":{"ref":"{affiliate_id}"}}}
```

O exemplo não afirma que a Steam oferece esse parâmetro/programa; cada loja deve usar os parâmetros efetivamente documentados pelo parceiro. Não ative parâmetros inventados. A configuração permanece no servidor e não faz compras, publica campanhas ou envia dados pessoais.

### Persistência

Favoritos existentes continuam intactos. A lista usa `safeloot-shopping-v1`; alertas usam `safeloot-alert-{appid}` no navegador. Não há sincronização entre dispositivos ou envio externo. A lista informa que os preços são da última consulta e permite atualizar; taxas desconhecidas impedem tratar o subtotal como garantia do checkout.


## Correção Nuuvem e opções de terceiros

Nuuvem agora é consultada diretamente na página brasileira do produto, sem ITAD e sem chave. A leitura valida preço BRL contra os metadados do mesmo produto, disponibilidade de compra, nome/edição, plataforma PC e vencimento de promoção. Cache de cinco minutos. O slug é derivado do título e endereços excepcionais (como remakes) têm mapeamento de identificadores em `lib/nuuvem.ts`. Títulos com endereços diferentes podem precisar de novo mapeamento; não se afirma cobertura integral do catálogo.

Verificado ao vivo: Resident Evil 4 (Steam AppID 2050650), Nuuvem R$32,99 na consulta de 10/09/2026, launcher Steam e redirect para o produto correto. Esse valor não está fixado no código de produção. Cyberpunk 2077 PC não tinha preço disponível na página consultada: a versão Xbox não foi usada como substituta.

A comparação agora oferece um seletor visível com as 25 lojas oficiais e terceiras cadastradas, respeitando Todas/Oficiais/Keys. Cada opção mostra o preço confirmado ou “Sem preço confirmado”. Uma loja sem cotação continua acessível com “Consultar na loja”, sem simular uma oferta. Keyshops ainda dependem de fontes de preço reais; o seletor não afirma que esses preços foram integrados.

Correção da pesquisa anterior: a Nuuvem possui documentação oficial de API para parceiros selecionados em https://docs.nuuvem.com/. Ela requer aprovação/token; isso é diferente da leitura pública do produto usada nesta entrega.

## Vitrines de descoberta — 11/09/2026
`/api/discovery` consulta fontes independentemente, com timeout de 10 segundos e cache de cinco minutos. Steam usa a busca pública regional BR, descontos e tags reais; Nuuvem lê o catálogo brasileiro e sua segunda página, excluindo cartões-presente e plataformas sem PC. Epic reutiliza os resgates ativos. Valores de Steam e GMG precisam concordar com os preços BRL visíveis. Não há conversão de outras moedas.

Na verificação local: 40 achados Steam abaixo de R$10, 35 roguelikes, 20 indies, 15 ofertas Nuuvem e 2 resgates Epic. As seleções podem compartilhar jogos. GMG retornou HTTP406 no runtime local: seu parser está implementado, mas a vitrine não exibe preços enquanto a consulta estiver indisponível; há acesso direto à loja. Nenhum preço de fixture é usado em produção. Catálogos públicos podem mudar e não representam cobertura integral.

`/go/discovery/:id` resolve apenas ofertas existentes no cache atualizado, recusa resgates vencidos e usa a política de afiliados existente. `node tests/discovery-check.mjs` valida parsers, moeda, disponibilidade, falha de fontes e redirects, com o preview local em execução.

## Ficha automática dos jogos — 11/09/2026

Implementação: `lib/game-profile.ts`, `lib/steam-data.ts`, `/api/game-profile?id=<Steam AppID>` e `components/game-profile.tsx`. O identificador Steam já existente no catálogo é a identidade canônica; não é necessário cadastrar a ficha ou as imagens manualmente. Jogos sem Steam AppID ainda precisam de um mapeamento de identidade antes de usar esta rota.

### Fontes escolhidas
- **Steam Store appdetails**: capa, sinopse em português quando publicada, screenshots, desenvolvedora, publicadora, lançamento, gêneros, categorias, modos, sistemas operacionais, idiomas e requisitos. Endpoint público não documentado, sem chave, sujeito a alterações. A consulta brilha para o catálogo PC já usado no SafeLoot. Plataformas e datas são explicitamente identificadas como Steam, sem afirmar cobertura de consoles.
- **Site oficial informado pela Steam**: descoberta de links/embeds YouTube. Somente HTTPS, sem credenciais/portas/IP literal, consulta DNS para recusar endereços privados, sem seguir redirects e com limite de1MB. Não executa JavaScript da página. Sites que dependem de JavaScript ou redirecionamento podem não retornar trailer.
- **Anúncios oficiais Steam**: [ISteamNews](https://partner.steamgames.com/doc/webapi/ISteamNews), feed `steam_community_announcements`, até100 anúncios. As publicadoras às vezes promovem outros jogos nesse feed; por isso os IDs de vídeo passam pela validação de título no YouTube oEmbed.
- **YouTube oEmbed**: valida existência, título e canal de vídeos encontrados nas fontes oficiais. O título deve corresponder ao jogo e identificar trailer/teaser/gameplay. O iframe usa youtube-nocookie e só é montado após clicar; o link direto permanece disponível para restrições de reprodução.
- **YouTube Data API, opcional**: configure `YOUTUBE_API_KEY` somente no servidor para habilitar busca adicional quando as fontes oficiais não entregarem um trailer. Usa [search.list](https://developers.google.com/youtube/v3/docs/search/list) com `videoEmbeddable=true` e `videoSyndicated=true`; chave/cota pertencem ao projeto Google. Vídeos encontrados dessa forma aparecem como “Trailer no YouTube”, sem declarar origem oficial apenas pelo título. Sem chave, esta etapa é ignorada e as outras fontes continuam funcionando.

### Alternativas avaliadas
[IGDB](https://api-docs.igdb.com/) oferece metadados, imagens e IDs de vídeo, mas requer credenciais Twitch e avaliação dos termos para uso comercial. [RAWG](https://rawg.io/apidocs) exige chave e atribuição, com limites/condições do plano. Não foram adicionadas dependências dessas plataformas: a Steam já identifica precisamente os jogos atuais e entrega os principais campos, e site oficial/anúncios/YouTube complementam a mídia sem custo de cadastro por jogo. Nenhuma integração IGDB/RAWG é anunciada como ativa.

### Cache e falhas
- Steam bruta: cinco minutos,200 entradas em memória e coalescimento de consultas simultâneas, compartilhado com preços. Não retorna preço vencido quando a fonte falha.
- Ficha editorial:24 horas; última ficha válida pode ser usada por até sete dias em falha, identificada visualmente. Memória limitada a200 fichas, Cache API do runtime quando disponível; não é um banco de dados permanente/global. Reinícios sem Cache API perdem o cache.
- Falhas sem ficha anterior têm intervalo de cinco minutos antes de nova consulta. Falhas de mídia não derrubam a ficha. Campos ausentes são omitidos; nenhum texto, requisito, screenshot ou plataforma é inventado.
- Dados externos são tratados como texto React, sem HTML injetado. Screenshots usam apenas CDNs Steam reconhecidas. Chaves nunca retornam ao cliente. Cadastro/overrides antigos de trailer continuam como opção, mas não são necessários para a descoberta automática.

### Validação
LOK Digital: seis screenshots, desenvolvedoras Letibus Design/Icedrop Games, publicadora Draknek and Friends, Windows/macOS, sinopse, requisitos e trailer `ofCYQGRWcS4` localizado automaticamente em `https://lok-digital.com/`. Testes cobrem identificação do vídeo, fontes parciais, saneamento, requests simultâneos, cache fresco, fallback vencido, indisponibilidade sem cache e rota inválida. O iframe correto foi montado no preview; reprodução audiovisual não pôde ser confirmada no navegador integrado (player em branco), com link direto funcional mantido.
