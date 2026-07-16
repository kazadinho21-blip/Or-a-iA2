# Orçamento Rápido — deploy no Render

## O que este projeto faz
Site interno onde você cola uma lista de orçamento em texto livre. A IA identifica
os itens e quantidades; o código busca cada item na sua tabela de produtos e faz
a conta (sem depender da IA para o cálculo). Quando um item é ambíguo ou não bate
a medida exata, o site te mostra as opções mais próximas para você escolher.

## Estrutura
- `server.js` — servidor Express (API + serve o site)
- `produtos.json` — sua tabela de produtos (gerada a partir da planilha)
- `public/` — a página (HTML, CSS, JS)

## Passo a passo no Render

1. **Suba este projeto para um repositório no GitHub** (crie um repositório novo,
   ex: `orcamento-web`, e envie todos os arquivos desta pasta, exceto `node_modules`
   e `.env`).

2. **Crie uma conta no Render** (render.com) se ainda não tiver.

3. No painel do Render, clique em **New +** → **Web Service**.

4. Conecte sua conta do GitHub e selecione o repositório que você acabou de criar.

5. Configure o serviço:
   - **Name**: orcamento-web (ou o nome que preferir)
   - **Region**: escolha a mais próxima (ex: Ohio, que costuma ter boa latência pro Brasil)
   - **Branch**: main
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (para uso pessoal, o plano gratuito já atende)

6. Em **Environment Variables**, adicione:
   - `ANTHROPIC_API_KEY` = sua chave da API da Anthropic (console.anthropic.com)

7. Clique em **Create Web Service**. O Render vai instalar as dependências e subir
   o site — isso leva alguns minutos na primeira vez.

8. Quando terminar, o Render te dá uma URL pública, tipo
   `https://orcamento-web.onrender.com`. Acesse essa URL no navegador (ou salve
   como atalho no celular) para usar o site.

## Atualizando a tabela de produtos depois

Sempre que os preços mudarem:
1. Atualize sua planilha
2. Gere um novo `produtos.json` (posso te ajudar a criar um script pra isso, ou
   você pode me mandar a planilha nova que eu já gero o arquivo pronto)
3. Suba o novo `produtos.json` para o mesmo repositório no GitHub
4. O Render detecta a mudança e reimplanta automaticamente

## Observação sobre o plano gratuito do Render

No plano free, o site "dorme" depois de um tempo sem uso e demora alguns segundos
para acordar na próxima vez que você acessa. Para um uso pessoal e esporádico,
isso normalmente não é problema — mas se quiser resposta instantânea toda vez,
existe um plano pago (a partir de uns poucos dólares por mês) que mantém o
serviço sempre ativo.
