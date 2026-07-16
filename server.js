// server.js
// Site de orçamento: você cola a lista, a IA extrai os itens,
// o código busca na tabela de produtos e faz a conta.
//
// Regras implementadas:
// - IA só extrai item + quantidade, nunca calcula preço.
// - Busca por palavras-chave (não por frase inteira), ignorando palavras
//   de encaixe ("de", "comum", etc.) e aceitando abreviações do catálogo
//   (ex: "GALV." bate com "Galvanizado").
// - Medidas numéricas (frações, mm, polegadas) são um critério adicional:
//   se algum candidato tiver EXATAMENTE a medida pedida, só esses entram
//   na lista final — um item de medida diferente nunca é escolhido
//   automaticamente, mesmo que o nome seja parecido.
// - Quando sobra mais de uma opção compatível (ambíguo) ou nenhuma bate
//   a medida exata, o servidor devolve as opções mais próximas para você
//   escolher manualmente no site — nunca escolhe sozinho.

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Upload em memória (não grava em disco), limite de 15MB por arquivo
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const TIPOS_ACEITOS = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "document",
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const LIMITE_SCORE = 0.5; // ajuste aqui se quiser resultados mais ou menos rígidos

// ==== CARREGA A LISTA DE PRODUTOS ====
const produtos = JSON.parse(fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8"));

const STOPWORDS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "COM", "SEM", "PARA",
  "E", "OU", "COMUM", "UM", "UMA", "UNS", "UMAS", "A", "O", "AS", "OS",
]);

// Remove acentos, uniformiza frações ("2 1/2" -> "2.1/2", igual ao catálogo)
function prepararTexto(texto) {
  const semAcento = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let t = semAcento.toUpperCase();
  t = t.replace(/(\d+)\s+(\d+\/\d+)/g, "$1.$2");
  t = t.replace(/[^A-Z0-9/. ]/g, " ");
  return t;
}

function normalizarTokens(texto) {
  return prepararTexto(texto).split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
}

// Dois tokens "batem" se forem iguais ou se um for prefixo do outro
// (isso cobre abreviações do catálogo, tipo GALV. / GALVANIZADO)
function tokensBatem(a, b) {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

function isMedidaToken(tok) {
  return /\//.test(tok) || /^\d+(\.\d+)?(MM|CM|POL)?$/.test(tok);
}

function contarAcertos(qTokens, cTokens) {
  let n = 0;
  for (const qt of qTokens) if (cTokens.some((ct) => tokensBatem(qt, ct))) n++;
  return n;
}

// Coeficiente de Dice: penaliza candidatos muito mais longos/curtos que a busca
function pontuar(qTokens, cTokens) {
  const acertos = contarAcertos(qTokens, cTokens);
  return (2 * acertos) / (qTokens.length + cTokens.length);
}

// Pré-computa os tokens de cada produto uma única vez (performance)
const catalogo = produtos.map((p) => ({ produto: p, tokens: normalizarTokens(p.item) }));

function buscarProduto(textoItem) {
  const qTokens = normalizarTokens(textoItem);
  if (qTokens.length === 0) return { status: "nao_encontrado" };

  const medidaTokensQuery = qTokens.filter(isMedidaToken);

  const pontuados = catalogo.map((c) => ({
    produto: c.produto,
    tokens: c.tokens,
    score: pontuar(qTokens, c.tokens),
  }));
  pontuados.sort((a, b) => b.score - a.score);

  const acimaLimite = pontuados.filter((p) => p.score >= LIMITE_SCORE);
  if (acimaLimite.length === 0) return { status: "nao_encontrado" };

  let pool = acimaLimite;
  let avisoMedida = false;

  if (medidaTokensQuery.length > 0) {
    const comMedidaOk = acimaLimite.filter((p) =>
      medidaTokensQuery.every((mt) => p.tokens.some((ct) => tokensBatem(mt, ct)))
    );
    if (comMedidaOk.length > 0) {
      pool = comMedidaOk;
    } else {
      // Nenhum candidato tem a medida exata pedida — nunca escolhe
      // automaticamente um de medida diferente, mostra como ambíguo.
      avisoMedida = true;
    }
  }

  if (pool.length === 1) {
    return { status: "resolvido", produto: pool[0].produto };
  }

  return {
    status: "ambiguo",
    aviso: avisoMedida ? "medida_diferente" : null,
    opcoes: pool.slice(0, 5).map((p) => p.produto),
  };
}

// ============================================================
// IA SÓ EXTRAI ITEM + QUANTIDADE (nunca calcula preço)
// Aceita texto colado, e/ou uma imagem/PDF (foto da lista, print, PDF de orçamento)
// ============================================================
async function extrairItensComIA({ texto, arquivo }) {
  const systemPrompt = `Você extrai itens e quantidades de uma lista de orçamento. A lista pode vir
como texto colado, como foto/print de uma lista escrita à mão ou impressa, ou como um PDF.
Responda APENAS com um JSON válido, sem texto antes ou depois, no formato:
[{"item": "nome do item, incluindo medidas e material", "quantidade": numero}]
Se a quantidade não for informada, use 1. Não invente itens que não estejam visíveis no
texto/imagem/PDF. Preserve números de medida (frações, mm, polegadas) exatamente como
aparecem na fonte. Se a imagem ou PDF estiver ilegível ou não contiver uma lista de itens,
responda com um array vazio: []`;

  const conteudo = [];

  if (arquivo) {
    const tipoBloco = TIPOS_ACEITOS[arquivo.mimetype];
    const base64 = arquivo.buffer.toString("base64");

    if (tipoBloco === "image") {
      conteudo.push({
        type: "image",
        source: { type: "base64", media_type: arquivo.mimetype, data: base64 },
      });
    } else if (tipoBloco === "document") {
      conteudo.push({
        type: "document",
        source: { type: "base64", media_type: arquivo.mimetype, data: base64 },
      });
    }
  }

  conteudo.push({
    type: "text",
    text: texto && texto.trim() ? texto : "Extraia os itens e quantidades da lista anexada.",
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: conteudo }],
    }),
  });

  const data = await response.json();
  const textoResposta = data.content?.[0]?.text?.trim() || "[]";

  try {
    return JSON.parse(textoResposta);
  } catch {
    console.error("IA não retornou JSON válido:", textoResposta);
    return [];
  }
}

// ============================================================
// ROTA PRINCIPAL: recebe texto e/ou arquivo (imagem/PDF), devolve itens processados
// ============================================================
app.post("/api/orcamento", upload.single("arquivo"), async (req, res) => {
  try {
    const texto = req.body.texto;
    const arquivo = req.file;

    if ((!texto || !texto.trim()) && !arquivo) {
      return res.status(400).json({ erro: "Envie um texto, uma imagem ou um PDF com a lista de itens." });
    }

    if (arquivo && !TIPOS_ACEITOS[arquivo.mimetype]) {
      return res.status(400).json({
        erro: "Formato de arquivo não suportado. Envie imagem (JPG, PNG, WEBP, GIF) ou PDF.",
      });
    }

    const itensExtraidos = await extrairItensComIA({ texto, arquivo });

    const itensProcessados = itensExtraidos.map(({ item, quantidade }) => {
      const resultado = buscarProduto(item);
      return {
        textoOriginal: item,
        quantidade: quantidade || 1,
        ...resultado,
      };
    });

    res.json({ itens: itensProcessados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao processar o orçamento." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(Servidor rodando na porta ${PORT}));
