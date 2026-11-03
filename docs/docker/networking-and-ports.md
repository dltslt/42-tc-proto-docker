# Networking, Ports & Vite HMR Mechanics

This guide explains the socket topology, network address translation (NAT), and real-time WebSocket communication in `tc-proto-docker`.

---

## 1. Network Sockets & Port Forwarding (C/C++ Perspective)

In low-level network programming, a server opens a socket (`socket()`), binds it to an IP address and port (`bind()`), and listens for incoming TCP handshakes (`listen()`, `accept()`).

In Docker, two distinct network namespaces are involved:
1. **Host Network**: The developer's physical machine or virtual environment (`127.0.0.1`, `localhost`).
2. **Docker Bridge Network (`tc_proto_default`)**: A private virtual network (typically `172.18.0.0/16`) managed by the Docker daemon.

When Docker Compose defines:
```yaml
ports:
  - "3001:3001"
```
The Docker daemon configures Linux kernel **NAT (Network Address Translation)** rules using `iptables` (or launches a user-space `docker-proxy` process). Any TCP SYN packet arriving at host socket `0.0.0.0:3001` is rewritten and forwarded across the virtual bridge to the container socket `172.18.0.X:3001`.

```text
[ Developer Browser ]
      |
      | Connects to http://localhost:3001
      v
[ Host OS Network Stack ]
      |
      | NAT / iptables / docker-proxy
      v
[ Docker Bridge (veth) ]
      |
      | Forwards to 172.18.0.4:3001
      v
[ Container: run-01 ]
      |
      +--> Nitro HTTP Server (listening on 0.0.0.0:3001)
      +--> Vite HMR WebSocket Server (listening on 0.0.0.0:3001)
```

---

## 2. Host Port Allocation & Conflict Avoidance

### Host Port Allocation Matrix

| Service | Container Internal Port | Host Mapped Port | Rationale |
|---|---|---|---|
| `postgres` | `5432` | `5433` (via `$HOST_POSTGRES_PORT`) | Avoids conflict with local PostgreSQL daemons running on host `5432` |
| `mongo` | `27017` | `27017` | Standard MongoDB port mapped 1:1 for host GUI access (Compass) |
| `template` | `3000` | `3000` | Baseline blueprint reference |
| `run-01` | `3001` | `3001` | Prototype run 1 (`3000 + 1`) |
| `run-02` | `3002` | `3002` | Prototype run 2 (`3000 + 2`) |
| `run-NN` | `30NN` | `30NN` | Prototype run N (`3000 + N`, up to `3014`) |

### Why PostgreSQL Host Port is 5433
Port `5432` is the global default for PostgreSQL. Developers frequently run a local PostgreSQL service on their workstation, or have another Docker container bound to `5432`. If `docker-compose.yml` blindly attempted to bind host port `5432`, startup would fail with `bind: address already in use`.

In `tc-proto-docker`:
- **Inside the Docker network**, PostgreSQL listens on standard port `5432`. Containerized prototypes connect to `postgres:5432`.
- **On the host**, PostgreSQL is exposed on port `5433` (configurable via `HOST_POSTGRES_PORT=5433` in `.env`). Developers using host GUI clients (e.g. TablePlus, DBeaver, or `psql`) connect to `localhost:5433`.

---

## 3. The Single-Port Architecture (`$PORT:$PORT`)

Early prototype configurations attempted a split-port design:
- Nuxt inside the container listened on static port `3000`.
- Docker mapped host port `3001` to container port `3000` (`3001:3000`).

While simple HTTP GET requests functioned, **this broke Hot Module Replacement (HMR)**.

### The Vite Hot Module Replacement (HMR) Problem
During development, Nuxt uses Vite. Vite injects a client-side script into the HTML loaded by the browser. This client script opens a persistent **WebSocket connection (`ws://`)** back to the Vite dev server so that code edits in Vue components can be pushed to the browser in real time without refreshing the page.

When internal port `3000` was mapped to external port `3001`:
1. The browser successfully loaded the initial HTML from `http://localhost:3001`.
2. The Vite client script examined the server's listening configuration and attempted to open a WebSocket connection to `ws://localhost:3000`.
3. Port `3000` was either closed or occupied by the `template` container, causing the WebSocket handshake to fail.
4. The browser repeatedly reconnected, printed console errors, and fell back to full-page reloads.

### The Unified Solution
In `tc-proto-docker`, we collapsed internal and external ports into a unified 1:1 mapping:

1. **Calculated Port**: `scripts/scaffold-run.sh` computes `PORT=$((3000 + N))`.
2. **Container Port Mapping**:
   ```yaml
   ports:
     - "$PORT:$PORT"
   environment:
     - PORT=$PORT
   ```
3. **Nuxt & Vite Server Configuration** (`nuxt.config.ts`):
   ```ts
   export default defineNuxtConfig({
     devServer: {
       port: Number(process.env.PORT || 3000),
       host: '0.0.0.0'
     },
     vite: {
       server: {
         hmr: {
           clientPort: Number(process.env.PORT || 3000)
         }
       }
     }
   })
   ```

Because Nuxt binds to `0.0.0.0:$PORT` inside the container, and Docker forwards `$PORT:$PORT`:
- The browser fetches HTML from `http://localhost:3001`.
- The Vite client script opens its WebSocket to `ws://localhost:3001/_nuxt/`.
- Both HTTP requests and WebSocket packets hit the exact same container socket without port translation or proxy divergence.

