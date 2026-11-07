const http = require("node:http");

const PORT = Number(process.env.PORT || 8080);
const HEALTH_CHECK_INTERVAL = 2000;
const HEALTH_CHECK_TIMEOUT = 1000;

const backends = [
  { id: "server-1", host: "app1", port: 3000, healthy: false, activeRequests: 0 },
  { id: "server-2", host: "app2", port: 3000, healthy: false, activeRequests: 0 },
  { id: "server-3", host: "app3", port: 3000, healthy: false, activeRequests: 0 }
];

let algorithm = "round-robin";
let roundRobinIndex = 0;

function checkBackend(backend) {
  return new Promise((resolve) => {
    const healthRequest = http.get(
      {
        hostname: backend.host,
        port: backend.port,
        path: "/health",
        timeout: HEALTH_CHECK_TIMEOUT
      },
      (healthResponse) => {
        healthResponse.resume();
        const isHealthy = healthResponse.statusCode === 200;
        backend.healthy = isHealthy;
        resolve(isHealthy);
      }
    );

    healthRequest.on("timeout", () => {
      healthRequest.destroy(new Error("Health check timeout"));
    });

    healthRequest.on("error", () => {
      backend.healthy = false;
      resolve(false);
    });
  });
}

async function updateHealthStatus() {
  await Promise.all(backends.map(checkBackend));
}

function getHealthyBackends() {
  return backends.filter((backend) => backend.healthy);
}

function selectRoundRobin(availableBackends) {
  const selected = availableBackends[roundRobinIndex % availableBackends.length];
  roundRobinIndex += 1;
  return selected;
}

function selectLeastConnections(availableBackends) {
  const minimum = Math.min(
    ...availableBackends.map((backend) => backend.activeRequests)
  );

  // Em caso de empate, usa Round Robin entre os servidores empatados.
  const candidates = availableBackends.filter(
    (backend) => backend.activeRequests === minimum
  );

  return selectRoundRobin(candidates);
}

function selectBackend() {
  const availableBackends = getHealthyBackends();

  if (availableBackends.length === 0) {
    return null;
  }

  if (algorithm === "least-connections") {
    return selectLeastConnections(availableBackends);
  }

  return selectRoundRobin(availableBackends);
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data, null, 2));
}

const balancer = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  // Endpoint administrativo para consultar o estado do balanceador.
  if (url.pathname === "/__status") {
    return sendJson(response, 200, {
      algorithm,
      healthyServers: getHealthyBackends().length,
      backends: backends.map((backend) => ({
        id: backend.id,
        healthy: backend.healthy,
        activeRequests: backend.activeRequests
      }))
    });
  }

  // Endpoint administrativo para trocar o algoritmo sem reiniciar o projeto.
  if (url.pathname === "/__algorithm") {
    const requestedAlgorithm = url.searchParams.get("name");

    if (!["round-robin", "least-connections"].includes(requestedAlgorithm)) {
      return sendJson(response, 400, {
        error: "Algoritmo invalido.",
        availableAlgorithms: ["round-robin", "least-connections"]
      });
    }

    algorithm = requestedAlgorithm;
    roundRobinIndex = 0;

    return sendJson(response, 200, {
      message: "Algoritmo atualizado.",
      algorithm
    });
  }

  const backend = selectBackend();

  if (!backend) {
    return sendJson(response, 503, {
      error: "Nenhum servidor disponivel.",
      message: "A ShopNow nao possui instancias saudaveis no momento."
    });
  }

  backend.activeRequests += 1;
  let released = false;

  function releaseRequest() {
    if (released) return;
    released = true;
    backend.activeRequests = Math.max(0, backend.activeRequests - 1);
  }

  response.once("finish", releaseRequest);
  response.once("close", releaseRequest);

  const proxyRequest = http.request(
    {
      hostname: backend.host,
      port: backend.port,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `${backend.host}:${backend.port}`,
        "x-shopnow-backend": backend.id
      },
      timeout: 15000
    },
    (backendResponse) => {
      response.writeHead(backendResponse.statusCode || 502, backendResponse.headers);
      backendResponse.pipe(response);
    }
  );

  proxyRequest.on("timeout", () => {
    proxyRequest.destroy(new Error("Backend request timeout"));
  });

  proxyRequest.on("error", (error) => {
    backend.healthy = false;
    releaseRequest();

    console.error(`[LOAD BALANCER] Falha em ${backend.id}: ${error.message}`);

    if (!response.headersSent) {
      sendJson(response, 502, {
        error: "Falha ao comunicar com o servidor.",
        backend: backend.id
      });
    } else {
      response.destroy(error);
    }
  });

  request.on("aborted", () => proxyRequest.destroy());
  request.pipe(proxyRequest);
});

async function start() {
  await updateHealthStatus();

  balancer.listen(PORT, "0.0.0.0", () => {
    console.log(`[LOAD BALANCER] Ativo na porta ${PORT}`);
    console.log(`[LOAD BALANCER] Algoritmo inicial: ${algorithm}`);
    console.log(
      `[LOAD BALANCER] Servidores saudaveis: ${getHealthyBackends().length}/3`
    );
  });

  setInterval(updateHealthStatus, HEALTH_CHECK_INTERVAL);
}

start().catch((error) => {
  console.error("[LOAD BALANCER] Nao foi possivel iniciar:", error);
  process.exit(1);
});
