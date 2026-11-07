const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const INSTANCE_ID = process.env.INSTANCE_ID || "local";
let totalRequests = 0;

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((request, response) => {
  totalRequests += 1;

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return sendJson(response, 200, {
      status: "ok",
      instance: INSTANCE_ID
    });
  }

  // Endpoint para criar requisicoes mais demoradas durante o teste.
  // Exemplo: /slow?ms=500
  if (url.pathname === "/slow") {
    const requestedDelay = Number(url.searchParams.get("ms") || 500);
    const delay = Math.min(Math.max(requestedDelay, 0), 10000);

    return setTimeout(() => {
      sendJson(response, 200, {
        message: "Resposta da ShopNow",
        instance: INSTANCE_ID,
        delayMs: delay,
        totalRequests,
        timestamp: new Date().toISOString()
      });
    }, delay);
  }

  return sendJson(response, 200, {
    message: "Bem-vindo a ShopNow!",
    instance: INSTANCE_ID,
    totalRequests,
    path: url.pathname,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${INSTANCE_ID}] Servidor iniciado na porta ${PORT}`);
});

server.on("error", (error) => {
  console.error(`[${INSTANCE_ID}] Erro no servidor:`, error);
  process.exit(1);
});
