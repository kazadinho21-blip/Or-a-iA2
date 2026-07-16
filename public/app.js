const textoLista = document.getElementById("textoLista");
const btnGerar = document.getElementById("btnGerar");
const resultado = document.getElementById("resultado");
const corpoTabela = document.getElementById("corpoTabela");
const totalGeralEl = document.getElementById("totalGeral");
const carregando = document.getElementById("carregando");
const erroEl = document.getElementById("erro");

let itensAtuais = []; // guarda o estado atual (inclusive escolhas manuais)

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcularTotal() {
  return itensAtuais.reduce((soma, item) => {
    if (item.status === "resolvido" && item.produto) {
      return soma + item.produto.preco * item.quantidade;
    }
    return soma;
  }, 0);
}

function escolherOpcao(indice, produtoEscolhido) {
  itensAtuais[indice] = {
    ...itensAtuais[indice],
    status: "resolvido",
    produto: produtoEscolhido,
  };
  renderizarTabela();
}

function renderizarTabela() {
  corpoTabela.innerHTML = "";

  itensAtuais.forEach((item, indice) => {
    const tr = document.createElement("tr");

    if (item.status === "resolvido") {
      const subtotal = item.produto.preco * item.quantidade;
      tr.innerHTML = `
        <td>
          <div class="item-nome">${item.produto.item}</div>
          <div class="item-origem">a partir de "${item.textoOriginal}"</div>
        </td>
        <td>${item.quantidade}</td>
        <td>${formatarMoeda(item.produto.preco)}</td>
        <td>${formatarMoeda(subtotal)}</td>
      `;
    } else if (item.status === "ambiguo") {
      tr.classList.add("linha-aviso");
      const avisoTexto =
        item.aviso === "medida_diferente"
          ? `Nenhum item bate exatamente com a medida de "${item.textoOriginal}". Opções próximas (medida diferente):`
          : `Encontrei mais de uma opção para "${item.textoOriginal}". Qual é a correta?`;

      const opcoesHtml = (item.opcoes || [])
        .map(
          (op, i) => `
            <button class="opcao-btn" data-indice="${indice}" data-opcao="${i}">
              ${op.item} — ${formatarMoeda(op.preco)} (${op.unidade})
            </button>`
        )
        .join("");

      tr.innerHTML = `
        <td colspan="4">
          <div class="item-nome">${avisoTexto}</div>
          <div class="opcoes">${opcoesHtml}</div>
        </td>
      `;
    } else {
      tr.classList.add("linha-aviso");
      tr.innerHTML = `
        <td colspan="4">
          <div class="item-nome">Item não encontrado: "${item.textoOriginal}"</div>
        </td>
      `;
    }

    corpoTabela.appendChild(tr);
  });

  // liga os cliques dos botões de opção
  document.querySelectorAll(".opcao-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const indice = Number(btn.dataset.indice);
      const opcaoIdx = Number(btn.dataset.opcao);
      const produtoEscolhido = itensAtuais[indice].opcoes[opcaoIdx];
      escolherOpcao(indice, produtoEscolhido);
    });
  });

  totalGeralEl.textContent = formatarMoeda(calcularTotal());
  resultado.hidden = false;
}

async function gerarOrcamento() {
  const texto = textoLista.value.trim();
  if (!texto) return;

  erroEl.hidden = true;
  resultado.hidden = true;
  carregando.hidden = false;
  btnGerar.disabled = true;

  try {
    const resposta = await fetch("/api/orcamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });

    if (!resposta.ok) throw new Error("Falha ao gerar orçamento");

    const dados = await resposta.json();
    itensAtuais = dados.itens;
    renderizarTabela();
  } catch (err) {
    erroEl.textContent = "Não foi possível gerar o orçamento. Tente novamente.";
    erroEl.hidden = false;
  } finally {
    carregando.hidden = true;
    btnGerar.disabled = false;
  }
}

btnGerar.addEventListener("click", gerarOrcamento);
