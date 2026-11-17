# openmrs-mcp

A read-only MCP server for OpenMRS. It runs over stdio and ships as an `.mcpb` extension for Claude Desktop.

Supported OpenMRS version: 2.2 and later.

## Build and test

```
npm install
npm run build        # tsc -> dist/
npm test             # vitest (builds dist/ itself for the stdio test)
npm run typecheck
```

## Pack

```
npm run pack
```

This builds into `build/mcpb` with production dependencies only, then writes `openmrs-mcp.mcpb` in the repo root.

## Install in Claude Desktop

Settings -> Extensions -> Advanced settings -> Extension Developer -> "Install Extension...", then pick `openmrs-mcp.mcpb`. Claude Desktop asks for the OpenMRS URL (with the webapp path, e.g. `https://host/openmrs`), the username and the password.

The server reads `OPENMRS_URL`, `OPENMRS_USERNAME` and `OPENMRS_PASSWORD` from the environment (only `src/stdio.ts` reads them).

## Live test against a local OpenMRS

Start the reference application:

```
TAG=nightly docker compose -p openmrs-mcp-nightly -f ../openmrs-distro-referenceapplication/docker-compose.yml up -d
```

When it is up, run the live test against `http://localhost/openmrs` (user `admin`, password `Admin123`):

```
OPENMRS_LIVE=1 npx vitest run test/live.test.ts
```

## Limits

- No two-factor login and no SSO. Basic authentication only.
- Passwords that contain `:` are not supported.
- `https://` is required, except for `localhost`, `127.0.0.1` and `::1`.
- The server only reads (GET requests). It can read anything the account's privileges allow, including admin resources.
