# Node.js Virtualization, Volume Masking & pnpm CAS

This guide explains how `tc-proto-docker` isolates and optimizes Node.js dependencies across multiple prototype runs. It translates web package management concepts into operating systems fundamentals: dynamic linking, Application Binary Interfaces (ABIs), POSIX filesystem mounts, and inode hard links.

---

## 1. Why Host and Container Cannot Share `node_modules`

In a naive Docker configuration, developers often attempt to bind-mount the entire project directory (`./prototypes/run-01:/app`) including `node_modules`. In a C/C++ or systems environment, this is equivalent to compiling an object file on macOS and attempting to dynamically link it on a Linux system with a different standard C library. It fails immediately.

Here is why `node_modules` must never be shared between the host and container:

### A. Binary Formats & Executable ABIs
Many foundational Node.js development tools (such as Vite, Rollup, esbuild, SWC, and LightningCSS) rely on compiled native C, C++, or Rust binaries to achieve acceptable performance.
- If the developer machine runs **macOS**, these binaries are compiled as **Mach-O** executables with dynamic links to macOS `.dylib` libraries.
- Inside the Docker container (running Debian or Alpine Linux), the kernel loader (`execve`) requires **ELF (Executable and Linkable Format)** binaries linked to Linux shared objects (`.so`).
- Attempting to execute host-installed native binaries inside the container produces `Exec format error` or `Cannot open shared object file`.

### B. Standard C Library (`glibc` vs `musl` & Version Skew)
Even when both host and container run Linux:
- Linux distributions vary in their standard C library implementation (`glibc` vs `musl`).
- Furthermore, `glibc` enforces strict forward-compatibility: a binary compiled against `glibc 2.38` (common on modern Linux hosts) will fail to resolve symbols when run in a container with `glibc 2.36`, throwing `version GLIBC_2.38 not found`.

### C. POSIX File Permissions & Container UID
Inside Docker containers, processes run by default as `root` (UID `0`, GID `0`).
- If the container executes `pnpm install` directly onto a shared host directory, all created directories and files are owned by UID `0`.
- On the host, the non-root developer user (typically UID `1000`) loses write permissions, preventing code formatters, git operations, or editor IDEs from modifying or deleting files without `sudo`.

---

## 2. The Solution: Docker Volume Masking

To allow seamless live source code editing from the host while completely isolating container dependencies, `docker-compose.yml` implements the **Volume Masking** pattern:

```yaml
services:
  base-proto:
    volumes:
      - pnpm_store:/pnpm-store
      - /app/node_modules        # Anonymous volume (mask)
  
  run-01:
    volumes:
      - ./prototypes/run-01:/app # Host bind mount
```

### How the Linux VFS Mount Table Resolves This

In the Linux Virtual Filesystem (VFS), mounts are organized in a hierarchical tree. When multiple filesystems mount to overlapping directory paths, the most specific (deepest) mount point wins:

1. **Host Bind Mount (`./prototypes/run-01:/app`)**:
   The developer's host directory is mounted at `/app`. Any changes made in an IDE on the host immediately reflect inside `/app` in the container.
2. **Anonymous Volume (`/app/node_modules`)**:
   Docker mounts an isolated, container-managed filesystem directly over `/app/node_modules`.

```text
Host Filesystem                    Container VFS Hierarchy
----------------                   ------------------------
./prototypes/run-01/               /app/  (Bind mount: sees host files)
  ├── app/                           ├── app/
  ├── server/                        ├── server/
  ├── package.json                   ├── package.json
  └── (host node_modules)            └── node_modules/  <-- MASKED!
                                         (Overlaid by anonymous volume;
                                          isolated container filesystem)
```

**Result**:
- The container installs Linux ELF binaries into its private anonymous volume.
- The host filesystem remains completely clean of container-generated root-owned files.
- If the host runs `pnpm install` for local IDE typechecking, the host's `node_modules` remains completely separate from the container's `node_modules`.

---

## 3. Storage Efficiency: pnpm Content-Addressable Storage (CAS)

A standard Nuxt 4 prototype installation with Tailwind and database drivers contains ~40,000 files and weighs ~350MB. If 14 prototypes each maintained duplicate `node_modules` copies, the repository would consume over 5 GB of disk space and require repetitive network downloads.

To solve this, `tc-proto-docker` leverages `pnpm` backed by a shared Docker named volume.

### How pnpm Inode Hard Links Work

Unlike `npm` or `yarn` (which duplicate package files in every project directory), `pnpm` stores every package exactly once in a global **Content-Addressable Store (CAS)**, indexed by the SHA-512 checksum of its content.

When a package is installed in `/app/node_modules`:
1. `pnpm` downloads and writes the package files into `/pnpm-store/v3/files/...`.
2. `pnpm` issues a Linux `link()` system call to create a **hard link** from `/app/node_modules/.pnpm/...` to the physical inode in `/pnpm-store`.
3. A hard link is not a copy; it is simply a second directory entry pointing to the exact same physical disk blocks and filesystem inode.

```text
Named Docker Volume: pnpm_store (/pnpm-store)
[ Inode #849201: vue@3.5.13/dist/vue.runtime.esm-bundler.js ]
          ^                                 ^
          | (hard link)                     | (hard link)
Container: run-01                           Container: run-02
/app/node_modules/.pnpm/vue@3.5.13/       /app/node_modules/.pnpm/vue@3.5.13/
```

### The Shared Docker Store Configuration

In `docker/nuxt/Dockerfile`:
```dockerfile
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_STORE_PATH="/pnpm-store"
```

In `docker-compose.yml`:
```yaml
volumes:
  pnpm_store:
    name: tc_proto_pnpm_store
```

Because `pnpm_store` is shared across all prototype containers:
- Packages downloaded during the template build or by `run-01` are immediately available locally to `run-02` through `run-14`.
- Scaffolding and starting new prototypes is near-instantaneous.
- Disk usage across the entire fleet scales by delta packages rather than full dependency trees.

---

## 4. Host Tooling & Corepack Considerations

If you wish to run TypeScript typechecks or run developer utilities on the host machine:

### Installing pnpm on the Host
We recommend installing pnpm directly via npm rather than using Node's experimental Corepack wrapper:
```bash
npm install -g pnpm@12.16.1
```

### The Corepack Non-Interactive Trap
Node.js ships with `corepack`, a tool to manage package managers. In non-interactive environments (such as CI/CD pipelines, Docker build steps, or Makefile scripts), `corepack` attempts to prompt:
```text
Do you want to continue? [Y/n]
```
Without a TTY, this prompt hangs indefinitely. To prevent this, the platform sets:
```bash
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
```
This environment variable is baked into the Dockerfile and automation scripts.

