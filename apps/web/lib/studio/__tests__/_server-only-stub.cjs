// Stub for `server-only` so node:test can import server-side modules
// (which import `server-only` to fail-loudly when bundled into a Client
// Component). See ./upstream.test.ts for the resolver patch.
module.exports = {};
