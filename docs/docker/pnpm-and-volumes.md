# Node.js Virtualization, Volume Masking & pnpm CAS

This guide explains how `tc-proto-docker` isolates and optimizes Node.js dependencies across multiple prototype runs. It translates web package management concepts into operating systems fundamentals: dynamic linking, Application Binary Interfaces (ABIs), POSIX filesystem mounts, and inode hard links.

---

## 1. Why Host and Container Cannot Share `node_modules`

In a naive Docker configuration, developers often attempt to bind-mount the entire project directory (`./prototypes/run-100:/app`) including `node_modules`. In a C/C++ or systems environment, this is equivalent to compiling an object file on macOS and attempting to dynamically link it on a Linux system with a different standard C library. It fails immediately.

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

To allow seamless live source code editing from the host while completely isolating container dependencies and build caches, `docker-compose.yml` implements the **Volume Masking** pattern:

```yaml
services:
  base-proto:
    volumes:
      - /app/.nuxt                # Anonymous volume (local build/type cache mask)
      - type: volume
        source: pnpm_store
        target: /root/.local/share/pnpm/store
        volume:
          subpath: store          # Shared global pnpm CAS store

  run-100:
    extends:
      service: base-proto
    volumes:
      - ./prototypes/run-100:/app # Host bind mount
      - type: volume
        source: pnpm_store
        target: /app/node_modules
        volume:
          subpath: run-100/node_modules # Per-run dependency mask on shared volume
```

### How the Linux VFS Mount Table Resolves This

In the Linux Virtual Filesystem (VFS), mounts are organized in a hierarchical tree. When multiple filesystems mount to overlapping directory paths, the most specific (deepest) mount point wins:

1. **Host Bind Mount (`./prototypes/run-100:/app`)**:
   The developer's host directory is mounted at `/app`. Any changes made in an IDE on the host immediately reflect inside `/app` in the container.
2. **Anonymous Volume (`/app/.nuxt`)**:
   Docker mounts a container-local anonymous volume over `/app/.nuxt` for generated TypeScript declarations and Vite caches.
3. **Named Volume Subpath (`pnpm_store` -> `/app/node_modules`)**:
   Docker mounts an isolated directory (`run-100/node_modules`) from the shared `pnpm_store` volume directly over `/app/node_modules`.

```text
Host Filesystem                    Container VFS Hierarchy
----------------                   ------------------------
./prototypes/run-100/              /app/  (Bind mount: sees host files)
  ├── app/                           ├── app/
  ├── server/                        ├── server/
  ├── package.json                   ├── package.json
  ├── (host .nuxt)                   ├── .nuxt/         <-- MASKED! (Anonymous volume)
  └── (host node_modules)            └── node_modules/  <-- MASKED!
                                         (Overlaid by pnpm_store subpath
                                          run-100/node_modules)
```

**Result**:
- The container installs Linux ELF binaries into its isolated volume mount without polluting the host.
- The host filesystem remains completely clean of container-generated root-owned files.
- If the host runs `pnpm install` for local IDE typechecking, the host's `node_modules` remains completely separate from the container's `node_modules`.

---

## 3. Storage Efficiency: pnpm Content-Addressable Storage (CAS) & `EXDEV`

A standard Nuxt 4 prototype installation with Tailwind and database drivers contains ~40,000 files and weighs ~350MB. If 14 prototypes each maintained duplicate `node_modules` copies, the repository would consume over 5 GB of disk space and require repetitive network downloads.

To solve this, `tc-proto-docker` leverages `pnpm` backed by the shared `pnpm_store` Docker named volume.

### How pnpm Inode Hard Links Work (and Why Separate Volumes Fail)

Unlike `npm` or `yarn` (which duplicate package files in every project directory), `pnpm` stores every package exactly once in a global **Content-Addressable Store (CAS)**, indexed by the content checksum.

When a package is installed in `/app/node_modules`:
1. `pnpm` downloads and writes the package files into `/root/.local/share/pnpm/store/v11/files/...`.
2. `pnpm` issues a POSIX `link(2)` system call to create a **hard link** from `/app/node_modules/.pnpm/...` to the physical inode in the store.
3. A hard link is not a copy; it is simply a second directory entry (`dirent`) pointing to the exact same physical disk blocks and filesystem inode.

> [!IMPORTANT]
> **The Cross-Device Link (`EXDEV`) Constraint**: In the Linux kernel (`fs/namei.c:vfs_link`), `link(2)` verifies that the source inode and destination directory reside on the **exact same filesystem superblock** (`inode->i_sb == dir->i_sb`). If `/app/node_modules` were mounted as a standalone anonymous volume (`- /app/node_modules`), it would have a different superblock from `pnpm_store`. The kernel would reject `link(2)` with `EXDEV` (`Invalid cross-device link`), forcing `pnpm` to print a warning and fall back to duplicating the entire store inside `/app/node_modules/.pnpm-store`.

### Unifying Store and `node_modules` via `volume.subpath`

By mounting both `/root/.local/share/pnpm/store` (`subpath: store`) and `/app/node_modules` (`subpath: <run>/node_modules`) from the **same** named volume (`pnpm_store`), both mount points share the identical underlying VFS superblock:

```text
Named Docker Volume: pnpm_store (Single Underlying Filesystem Superblock)
├── store/v11/files/...
│   └── [ Inode #849201: vue@3.5.44/dist/vue.runtime.esm-bundler.js ]
│                 ^                                 ^
│                 | link(2)                         | link(2)
├── run-100/node_modules/.pnpm/             └── run-101/node_modules/.pnpm/
    (mounted at /app/node_modules               (mounted at /app/node_modules
     in container run-100)                       in container run-101)
```

Because `pnpm_store` houses both the central `store` and each prototype's `node_modules` subpath on a single filesystem:
- `link(2)` succeeds across all runs with zero `EXDEV` errors.
- Packages downloaded by `template` or `run-100` are immediately available locally to `run-101` through `run-999` without network transfers or disk duplication.
- `/app/.nuxt` stays on a lightweight anonymous volume because Nuxt's build cache consists only of generated local files, not hard-linked store packages.

### Subpath Initialization & The `pnpm-init` Helper

In Docker Engine (Moby), mounting a named volume via `volume.subpath` enforces a strict precondition: **the target subdirectory must already exist inside the volume storage backend**. If the volume is newly created or wiped (e.g. fresh clone or `make clean-all`), Docker does not automatically generate nested subdirectories and refuses to start the container:

```text
Error response from daemon: cannot access path .../_data/store: lstat .../_data/store: no such file or directory
```

Furthermore, `base-proto` cannot initialize its own subpaths because its service definition already attaches `subpath: store` (a chicken-and-egg trap where container creation fails before any entrypoint can run).

To solve this cleanly, `docker-compose.yml` provides a lightweight internal helper service:

```yaml
pnpm-init:
  profiles: ["internal"]
  image: node:22-slim
  volumes:
    - pnpm_store:/pnpm_store
```

Because `pnpm-init` mounts the **root** of `pnpm_store` without any subpaths, it attaches unconditionally. The control plane (`make up`, `make up-all`, and `make init`) executes a fast (~200ms) one-liner before booting the target prototype container:

```bash
docker compose run --rm -T --no-deps pnpm-init sh -c "mkdir -p /pnpm_store/store /pnpm_store/$run/node_modules"
```

This guarantees all subpaths exist prior to container attachment without hardcoding Docker volume driver paths or requiring host-level `sudo` filesystem permissions.

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

