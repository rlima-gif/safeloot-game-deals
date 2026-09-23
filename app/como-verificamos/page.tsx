/* Native document links preserve the existing SafeLoot navigation contract. */
/* oxlint-disable next/no-html-link-for-pages */
export default function VerificationPage() {
  return (
    <main className="integration-doc">
      <a href="/">← Voltar ao SafeLoot</a>
      <h1>Preço bom começa com informação confiável.</h1>
      <p>
        O SafeLoot é um consultor brasileiro para comprar jogos de PC.
        Comparamos ofertas; a compra acontece na loja escolhida.
      </p>
      <h2>O que entra no ranking</h2>
      <p>
        Somente ofertas confirmadas em reais de lojas oficiais e revendedoras
        autorizadas (segundo dados públicos das próprias lojas e distribuidoras),
        com produto e região compatíveis. Verificamos título, edição, plataforma,
        moeda, disponibilidade e link direto da oferta. O SafeLoot compara informações
        públicas; não somos intermediários nem garantimos a entrega ou execução por terceiros.
      </p>
      <h2>Nuuvem e outras fontes</h2>
      <p>
        O catálogo brasileiro fornece candidatos. A página de produto precisa
        confirmar os dados antes de entrar na comparação. Divergências, moeda
        diferente, mudança no formato da página ou falha na consulta retiram a
        oferta do ranking.
      </p>
      <h2>Histórico observado, sem passado inventado</h2>
      <p>
        Guardamos preços confirmados em reais por produto e loja. Consultas
        repetidas ao mesmo preço atualizam a última verificação; mudanças geram
        um novo registro. O gráfico liga observações reais e não garante o preço
        entre consultas. Sem registros suficientes, mostramos “Histórico sendo
        construído”. Mínimas se referem ao período e às lojas observadas pelo
        SafeLoot.
      </p>
      <h2>Comprar agora ou esperar?</h2>
      <p>
        A análise atual exige ao menos três registros e cobertura de 90 dias da
        Steam Brasil. A nota considera proximidade da mínima (60%), comparação
        com média ponderada no tempo (25%) e desconto atual (15%). Não prevê
        promoções futuras. Sem cobertura suficiente, não atribuímos uma nota.
      </p>
      <h2>Keys e preços internacionais</h2>
      <p>
        Keyshops ficam em uma seção separada. Se o preço não está integrado,
        informamos isso antes do clique. Região, edição, vendedor e taxas
        precisam ser conferidos. Valores em dólar nunca são convertidos para
        participar do ranking em reais.
      </p>
      <h2>Como podemos ganhar dinheiro</h2>
      <p>
        Links identificados como afiliados podem gerar comissão para o SafeLoot.
        A comissão não altera a ordem dos preços. Cupons, cashback e vantagens
        de pagamento só aparecem quando confirmados por uma fonte.
      </p>
      <h2>Favoritos e alertas</h2>
      <p>
        Favoritos e regras de alerta são salvos neste navegador. Alertas locais
        dependem de você abrir o SafeLoot para consultar os preços; não enviam
        e-mail nem notificações externas.
      </p>
      <p>
        <strong>Preços podem mudar. Confirme o valor final na loja.</strong>
      </p>
      <a href="/lojas">Ver lojas e integrações →</a>
    </main>
  );
}
