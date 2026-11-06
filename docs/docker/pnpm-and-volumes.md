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
      - pnpm_store:/pnpm_store    # Single shared named volume mount

  run-100:
    extends:
      service: base-proto
    volumes:
      - ./prototypes/run-100:/app # Host bind mount
      - /app/node_modules         # Anonymous volume (dependency mask: symlinks only)
```

### How the Linux VFS Mount Table Resolves This

In the Linux Virtual Filesystem (VFS), mounts are organized in a hierarchical tree. When multiple filesystems mount to overlapping directory paths, the most specific (deepest) mount point wins:

1. **Host Bind Mount (`./prototypes/run-100:/app`)**:
   The developer's host directory is mounted at `/app`. Any changes made in an IDE on the host immediately reflect inside `/app` in the container.
2. **Anonymous Volume (`/app/.nuxt`)**:
   Docker mounts a container-local anonymous volume over `/app/.nuxt` for generated TypeScript declarations and Vite caches.
3. **Anonymous Volume Mask (`/app/node_modules`)**:
   Docker mounts an anonymous volume directly over `/app/node_modules`. This masks the host directory, ensuring container-installed symlinks and root UID permissions do not pollute the developer's host workspace.

```text
Host Filesystem                    Container VFS Hierarchy
----------------                   ------------------------
./prototypes/run-100/              /app/  (Bind mount: sees host files)
  ├── app/                           ├── app/
  ├── server/                        ├── server/
  ├── package.json                   ├── package.json
  ├── (host .nuxt)                   ├── .nuxt/         <-- MASKED! (Anonymous volume)
  └── (host node_modules)            └── node_modules/  <-- MASKED! (Anonymous volume:
                                                             symlinks to /pnpm_store)
```

---

## 3. Storage Architecture: pnpm Three-Layer Model & `EXDEV` Mechanics

A standard Nuxt 4 prototype installation with Tailwind and database drivers contains ~40,000 files and weighs ~350MB. If 25 prototypes each maintained duplicate `node_modules` copies, the repository would consume over 10 GB of disk space and require repetitive network downloads.

To solve this, `tc-proto-docker` leverages `pnpm` backed by a shared `pnpm_store` Docker named volume.

### Understanding pnpm's Three Storage Layers

| Layer | Container Path | Systems / C Analogy | Inode / Link Mechanics |
| :--- | :--- | :--- | :--- |
| **1. CAS Store** | `/pnpm_store/store/v11/files/...` | Object database (like `.git/objects`) | Content-addressed physical files; stored once. |
| **2. Virtual Store** | `/pnpm_store/<run>/pnpm/...` | Dynamic linker structure | Per-project directory of real package files. **Hardlinked** (`link(2)`) to CAS. |
| **3. Top-Level `node_modules`** | `/app/node_modules/vue` | Shared library symlinks (`lib.so`) | **Symlinks** (`symlink(2)`) pointing across mounts to the Virtual Store. |

### The Linux Kernel VFS `EXDEV` Trap

In POSIX filesystems and the Linux kernel (`fs/namei.c:do_linkat`), creating a hard link via `link(2)` enforces a fundamental kernel boundary:

```c
if (old_path.mnt != new_path.mnt)
    return -EXDEV;
```

Even if two bind mounts originate from the **exact same Docker volume** (e.g. using `volume.subpath: store` and `volume.subpath: run-100/node_modules`), Linux treats them as two distinct `vfsmount` objects. **The kernel strictly forbids hard links across mount boundaries with `EXDEV: Invalid cross-device link`.**

When hardlinks fail:
- `pnpm v12` does not crash; instead, it silently falls back to **cloning (copying)** all ~220 MB of package files per container (`Packages are cloned from the content-addressable store`).
- If invoked without `--store-dir`, pnpm falls back to creating an isolated store at `<project>/node_modules/.pnpm-store/v11`, duplicating hundreds of megabytes per run.

### The Single-Mount Solution: Unifying CAS and Virtual Store

To satisfy `old_path.mnt == new_path.mnt`, the container mounts `pnpm_store` **once** at `/pnpm_store`:

```text
Docker Volume: pnpm_store (Single Mount Point: /pnpm_store)
├── corepack/                               (Shared binary cache)
├── store/v11/files/...                     (CAS raw files)
│     └── [ Inode #3890390: package.json ]
│                   ^             ^
│            link(2)|             |link(2)
├── run-100/pnpm/───+             └── run-101/pnpm/
│     (Virtual store)                   (Virtual store)
│           ^                                 ^
│           | symlink(2)                      | symlink(2)
Container run-100: /app/node_modules   Container run-101: /app/node_modules
(Anonymous Volume Mask)                (Anonymous Volume Mask)
```

1. **Both CAS (`/pnpm_store/store`) and Virtual Store (`/pnpm_store/<run>/pnpm`) reside on `/pnpm_store`**.
2. Because they share the identical `vfsmount`, POSIX `link(2)` succeeds natively with zero `EXDEV` errors.
3. Direct dependencies in `/app/node_modules` point to the virtual store via **symlinks**. Symlinks (`symlink(2)`) cross mount boundaries effortlessly.
4. Second and subsequent runs add only ~7.8 MB to the volume (strictly directory table entries and local `.bin` shims) rather than 419 MB of copied package files—a **98.2% storage reduction**.

---

## 4. Configuration Precedence & Corepack Caching

### How pnpm Resolves Settings

pnpm resolves its configuration options in strict hierarchical order:

1. **CLI flags** (e.g. `--store-dir`, `--virtual-store-dir`)
2. **Environment variables**
3. **Project config** (`pnpm-workspace.yaml`, `.npmrc`)
4. **Global config** (`~/.config/pnpm/config.yaml`)
5. **Built-in defaults**

> [!WARNING]
> **The `command:` Flag Trap**: Placing `--store-dir` as a flag inside Compose's `command:` string only applies during normal container boot (`docker compose up`). Any one-off execution—such as `make seed` (`docker compose exec`), `make init` (`docker compose run`), or `pnpm add <pkg>`—omits the flag. Under defaults, pnpm detects cross-mount paths, drops a duplicate store inside `node_modules/.pnpm-store`, and wipes previous installations.

### Environment Variable Contract (`pnpm_config_*`)

To guarantee identical configuration across `up`, `run`, `exec`, and interactive shells without cluttering scripts with flags, settings are defined in Compose `environment:`:

- **`pnpm v12` Requirement**: Starting in pnpm 11+, legacy `npm_config_*` prefixes are completely ignored (`undefined`). pnpm strictly requires `pnpm_config_*`.

In `base-proto`:
```yaml
environment:
  - COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  - COREPACK_HOME=/pnpm_store/corepack
  - pnpm_config_store_dir=/pnpm_store/store
```

In child runs:
```yaml
environment:
  - pnpm_config_virtual_store_dir=/pnpm_store/run-100/pnpm
```

### Corepack Binary Persistence

Node's built-in `corepack` inspects the pinned `packageManager` field in `package.json` (e.g. `pnpm@12.16.1`). By default, it downloads the binary to an ephemeral container path, causing every fresh container creation or `docker compose run` step to re-download `pnpm` from the internet.

By configuring `COREPACK_HOME=/pnpm_store/corepack`:
- Corepack caches the downloaded binary in `/pnpm_store/corepack`.
- Subsequent container launches execute the cached binary instantly with zero network delay.
- `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` suppresses interactive TTY confirmation prompts in automated scripts.
- The former `pnpm-init` helper service is completely obsolete, as mounting the volume root requires no pre-existing subdirectories.

