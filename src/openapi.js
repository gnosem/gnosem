// OpenAPI 3.1 spec for Gnosem's REST surface. Served at /openapi.json.
//
// The MCP JSON-RPC endpoint (POST /mcp) is documented here as a single operation with a
// generic request/response shape — OpenAPI doesn't natively describe JSON-RPC method
// dispatch, so per-tool details live in /llms.txt and /.well-known/mcp/server-card.json.
// The REST endpoints (auth, me, export, keys/rotate, health, demo) are fully specified.

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Gnosem API",
    version: "0.1.0",
    summary: "Cross-vendor AI memory over MCP.",
    description:
      "Gnosem is a hosted Model Context Protocol server providing one persistent semantic memory " +
      "store per user, accessible from every MCP-capable AI client. This spec covers the REST surface. " +
      "The MCP JSON-RPC endpoint (POST /mcp) exposes 6 tools — memory_write, memory_search, memory_list, " +
      "memory_forget, memory_supersede, memory_write_bulk — documented in /llms.txt and " +
      "/.well-known/mcp/server-card.json.",
    contact: { name: "CUETV LLC", url: "https://cuetv.us" },
    license: { name: "MIT", identifier: "MIT" },
  },
  servers: [{ url: "https://gnosem.dev", description: "Production" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "gn_[a-f0-9]{32}",
        description:
          "Every user gets an API key on signup formatted as `gn_` + 32 hex characters. " +
          "Pass as `Authorization: Bearer <key>` on every authenticated request.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      SignupRequest: {
        type: "object",
        properties: { email: { type: "string", format: "email", description: "Optional but recommended — used for magic-link login and receipts." } },
      },
      SignupResponse: {
        type: "object",
        required: ["user_id", "api_key"],
        properties: {
          user_id: { type: "string", format: "uuid" },
          api_key: { type: "string", pattern: "^gn_[a-f0-9]{32}$", description: "One-time display; save immediately." },
          note: { type: "string" },
        },
      },
      Me: {
        type: "object",
        required: ["user_id", "plan", "memory_count"],
        properties: {
          user_id: { type: "string", format: "uuid" },
          email: { type: ["string", "null"], format: "email" },
          plan: { type: "string", enum: ["free", "pro"] },
          subscription_status: { type: ["string", "null"] },
          subscription_period_end: { type: ["integer", "null"], description: "ms epoch" },
          memory_count: { type: "integer" },
          memory_limit: { type: ["integer", "null"], description: "null on pro (unlimited)" },
        },
      },
      Export: {
        type: "object",
        required: ["format", "exported_at", "user_id", "plan", "counts", "memories"],
        properties: {
          format: { type: "string", const: "gnosem/export/v1" },
          exported_at: { type: "integer", description: "ms epoch" },
          user_id: { type: "string", format: "uuid" },
          plan: { type: "string" },
          counts: {
            type: "object",
            properties: {
              memories: { type: "integer" },
              includes_forgotten: { type: "boolean" },
              includes_superseded: { type: "boolean" },
            },
          },
          memories: {
            type: "array",
            items: { $ref: "#/components/schemas/Memory" },
          },
        },
      },
      Memory: {
        type: "object",
        required: ["id", "content", "tags", "created_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          content: { type: "string", description: "Raw prose OR LLM-optimized structured facts (depending on `raw` flag on the read tool)." },
          content_raw: { type: "string", description: "Present when the compressed form was returned as `content`." },
          content_optimized: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          written_by: { type: ["string", "null"] },
          session_id: { type: ["string", "null"] },
          created_at: { type: "integer", description: "ms epoch" },
          superseded_by: { type: "string", format: "uuid" },
          forgotten_at: { type: "integer" },
          score: { type: "number", description: "Cosine similarity; only on search results." },
        },
      },
      RotateResponse: {
        type: "object",
        required: ["api_key"],
        properties: {
          api_key: { type: "string", pattern: "^gn_[a-f0-9]{32}$" },
          note: { type: "string" },
        },
      },
      Health: {
        type: "object",
        required: ["ok", "service", "time"],
        properties: {
          ok: { type: "boolean" },
          service: { type: "string", const: "gnosem" },
          time: { type: "integer" },
        },
      },
      DemoSearchRequest: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", maxLength: 500 },
          k: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        },
      },
      DemoSearchResponse: {
        type: "object",
        required: ["matches"],
        properties: {
          matches: { type: "array", items: { $ref: "#/components/schemas/Memory" } },
        },
      },
      JsonRpcRequest: {
        type: "object",
        required: ["jsonrpc", "id", "method"],
        properties: {
          jsonrpc: { type: "string", const: "2.0" },
          id: { oneOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] },
          method: { type: "string", description: "One of: initialize, tools/list, tools/call, ping, notifications/initialized" },
          params: { type: "object" },
        },
      },
      JsonRpcResponse: {
        type: "object",
        required: ["jsonrpc", "id"],
        properties: {
          jsonrpc: { type: "string", const: "2.0" },
          id: { oneOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] },
          result: { type: "object" },
          error: {
            type: "object",
            properties: {
              code: { type: "integer" },
              message: { type: "string" },
              data: {},
            },
          },
        },
      },
    },
  },
  paths: {
    "/signup": {
      post: {
        summary: "Create a new account and receive an API key",
        description: "Rate-limited: 5 per IP per hour. Email is optional but enables magic-link login and Stripe receipts.",
        security: [],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SignupRequest" } } },
        },
        responses: {
          "200": {
            description: "Account created; api_key is shown once and never returned again.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SignupResponse" } } },
            headers: {
              "X-RateLimit-Remaining": { schema: { type: "integer" } },
              "X-RateLimit-Reset": { schema: { type: "integer", description: "epoch seconds" } },
            },
          },
          "409": { description: "Email already registered.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }, headers: { "Retry-After": { schema: { type: "integer" } } } },
          "413": { description: "Request body over 4KB cap." },
        },
      },
    },
    "/me": {
      get: {
        summary: "Get account summary for the authenticated user",
        responses: {
          "200": { description: "Account details.", content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } } },
          "401": { description: "Missing or invalid Bearer token.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/export": {
      get: {
        summary: "Download a portable JSON dump of every memory on the account",
        description: "Response has Content-Disposition: attachment. Format is gnosem/export/v1 — any future host can import.",
        parameters: [
          { name: "include_forgotten", in: "query", schema: { type: "boolean" }, description: "Include soft-deleted memories." },
          { name: "include_superseded", in: "query", schema: { type: "boolean" }, description: "Include historical (superseded) memories." },
        ],
        responses: {
          "200": {
            description: "The full export.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Export" } } },
            headers: { "Content-Disposition": { schema: { type: "string", example: 'attachment; filename="gnosem-export-2026-07-30.json"' } } },
          },
          "401": { description: "Missing or invalid Bearer token." },
        },
      },
    },
    "/keys/rotate": {
      post: {
        summary: "Revoke the current API key and issue a new one",
        description: "All prior keys under the account are revoked. Update every MCP client with the new key before signing out.",
        responses: {
          "200": { description: "New key issued.", content: { "application/json": { schema: { $ref: "#/components/schemas/RotateResponse" } } } },
          "401": { description: "Missing or invalid Bearer token." },
        },
      },
    },
    "/auth/request": {
      post: {
        summary: "Request a magic-link email for dashboard sign-in",
        description: "Rate-limited: 10 per IP per 15 min. Response is intentionally opaque — returns the same message whether the email is registered, not registered, or the send failed. Prevents account enumeration + link leakage.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } },
        },
        responses: {
          "200": { description: "Request accepted (link sent if email registered)." },
          "400": { description: "Missing or invalid email." },
          "429": { description: "Rate limit exceeded." },
          "413": { description: "Request body over 4KB cap." },
        },
      },
    },
    "/auth/verify": {
      get: {
        summary: "Exchange a magic-link token for a session cookie",
        security: [],
        parameters: [{ name: "token", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "302": { description: "Session cookie set; redirects to /dashboard.", headers: { "Set-Cookie": { schema: { type: "string" } }, "Location": { schema: { type: "string" } } } },
          "400": { description: "Token invalid or expired." },
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Clear the session cookie",
        security: [],
        responses: { "204": { description: "Cookie cleared." } },
      },
    },
    "/health": {
      get: {
        summary: "Service health probe",
        description: "No auth. Deliberately shallow — no DB round-trip. Confirms the Worker is warm and routing.",
        security: [],
        responses: {
          "200": { description: "Service is healthy.", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } },
        },
      },
    },
    "/demo/search": {
      post: {
        summary: "Public read-only semantic search over a demo memory graph",
        description: "No auth. Rate-limited by Cloudflare's default DDoS layer. Hard-coded server-side to the demo user_id.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DemoSearchRequest" } } },
        },
        responses: {
          "200": { description: "Matches from the demo store.", content: { "application/json": { schema: { $ref: "#/components/schemas/DemoSearchResponse" } } } },
          "400": { description: "Invalid or too-long query." },
        },
      },
    },
    "/demo/list": {
      get: {
        summary: "List all memories in the demo store (up to 50)",
        security: [],
        responses: {
          "200": { description: "The demo memory list." },
        },
      },
    },
    "/mcp": {
      post: {
        summary: "Model Context Protocol JSON-RPC 2.0 endpoint",
        description:
          "Exposes 6 tools via JSON-RPC: memory_write, memory_search, memory_list, memory_forget, memory_supersede, memory_write_bulk. " +
          "The initialize, tools/list, ping, and notifications/initialized methods do NOT require auth (registry scanners use them). " +
          "tools/call REQUIRES auth. Per-tool schemas are exposed via tools/list and via /.well-known/mcp/server-card.json.",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/JsonRpcRequest" } } },
        },
        responses: {
          "200": { description: "JSON-RPC response.", content: { "application/json": { schema: { $ref: "#/components/schemas/JsonRpcResponse" } } } },
          "400": { description: "Malformed JSON or missing jsonrpc:2.0." },
          "413": { description: "Request body over 256KB cap." },
        },
      },
    },
    "/upgrade": {
      get: {
        summary: "Pricing page (HTML)",
        security: [],
        responses: { "200": { description: "HTML pricing page." } },
      },
    },
    "/api/stripe/webhook": {
      post: {
        summary: "Stripe webhook receiver",
        description: "Signature-verified via stripe-signature header. Handles checkout.session.completed and customer.subscription.* events.",
        security: [],
        responses: { "200": { description: "Event acknowledged." }, "400": { description: "Signature verification failed." } },
      },
    },
  },
};
