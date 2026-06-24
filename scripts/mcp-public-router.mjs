import http from "node:http";

const PORT = Number(process.env.MCP_PUBLIC_ROUTER_PORT || 8800);
const HOST = process.env.MCP_PUBLIC_ROUTER_HOST || "127.0.0.1";

const targets = [
  {
    prefix: "/mcp-v2",
    target: new URL("http://127.0.0.1:8787"),
    name: "rag-memory-mcp"
  },
  {
    prefix: "/mcp",
    target: new URL("http://127.0.0.1:8790"),
    name: "scarlett-guardian-mcp"
  },
  {
    prefix: "/preflight",
    target: new URL("http://127.0.0.1:8790"),
    name: "scarlett-guardian-preflight"
  }
];

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "*"
  });
  res.end(JSON.stringify(body));
}

function getRoute(pathname) {
  return targets.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`));
}

async function checkHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function proxyRequest(req, res, route, pathname, search) {
  const targetPath = `${pathname}${search}`;
  const options = {
    hostname: route.target.hostname,
    port: route.target.port,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${route.target.hostname}:${route.target.port}`
    }
  };

  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    writeJson(res, 502, {
      error: "Upstream MCP service unavailable",
      route: route.name,
      detail: error.message
    });
  });

  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/" || url.pathname === "/health") {
    const [guardian, rag] = await Promise.all([
      checkHealth("http://127.0.0.1:8790/health"),
      checkHealth("http://127.0.0.1:8787/health")
    ]);
    writeJson(res, guardian.ok && rag.ok ? 200 : 503, {
      ok: guardian.ok && rag.ok,
      routes: {
        guardian_mcp: "/mcp",
        rag_mcp_v2: "/mcp-v2",
        guardian_preflight: "/preflight"
      },
      guardian,
      rag
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/mcp" || url.pathname === "/mcp-v2")) {
    const route = getRoute(url.pathname);
    writeJson(res, 200, {
      ok: true,
      name: route?.name,
      message: "MCP endpoint is reachable. Send MCP JSON-RPC requests with POST."
    });
    return;
  }

  const route = getRoute(url.pathname);
  if (!route) {
    writeJson(res, 404, {
      error: "No route for path",
      path: url.pathname,
      available_routes: ["/mcp", "/mcp-v2", "/preflight", "/health"]
    });
    return;
  }

  proxyRequest(req, res, route, url.pathname, url.search);
});

server.listen(PORT, HOST, () => {
  console.log(`MCP public router listening on http://${HOST}:${PORT}`);
  console.log("Routes: /mcp -> Guardian 8790, /mcp-v2 -> RAG 8787, /preflight -> Guardian 8790");
});
