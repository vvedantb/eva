/** Pidfiles and sockets that survive sandbox auto-stop and block a new dockerd. */
export const DOCKER_STALE_RUNTIME_PATHS = [
  "/var/run/docker.pid",
  "/var/run/docker.sock",
  "/run/docker/containerd/containerd.pid",
  "/run/docker/containerd/containerd.sock",
  "/run/docker/containerd/containerd.sock.ttrpc",
  "/run/docker/containerd/containerd-debug.sock",
] as const;

/** Polls `docker info` until it succeeds or the attempt budget ends. */
export function buildDockerInfoWaitLoop(attempts: number): string {
  return `for i in $(seq 1 ${attempts}); do docker info >/dev/null 2>&1 && break; sleep 1; done`;
}

/** Starts dockerd detached so the caller can wait on `docker info`. */
export function buildDockerdBackgroundStart(): string {
  return "sudo setsid dockerd </dev/null >/tmp/dockerd.log 2>&1 &";
}

/** Relaxes the docker socket so the eva user can talk to a root dockerd. */
export function buildDockerSockPerms(): string {
  return "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true";
}

/** Removes leftover dockerd/containerd pidfiles and sockets. */
export function buildDockerdStaleRuntimeCleanup(ignoreErrors = false): string {
  const suffix = ignoreErrors ? " || true" : "";
  return `sudo rm -f ${DOCKER_STALE_RUNTIME_PATHS.join(" ")} 2>/dev/null${suffix}`;
}

/**
 * Serializes concurrent dockerd bootstraps and exits early once another caller
 * got dockerd up. A new session runs several at once (createSandbox, the turn's
 * validateSandbox, seeded-runtime restore); without the lock each one that saw
 * `docker info` fail ran `pkill -9 dockerd` and killed the others' half-started
 * daemon. Lives on the caller's fd 9 for the rest of the script.
 */
export function buildDockerBootstrapLock(waitSeconds: number): string[] {
  return [
    `exec 9>/tmp/eva-docker-bootstrap.lock`,
    `flock -w ${waitSeconds} 9 || true`,
    'if docker info >/dev/null 2>&1; then echo "bootstrap-docker:already-running"; exit 0; fi',
  ];
}

/** Kills half-alive dockerd/containerd before a restart. */
export function buildDockerdProcessCleanup(ignoreErrors = false): string[] {
  const suffix = ignoreErrors ? " || true" : "";
  return [
    `sudo pkill -9 dockerd 2>/dev/null${suffix}`,
    `sudo pkill -9 containerd 2>/dev/null${suffix}`,
  ];
}

/** Seed-run one-liner: start dockerd if needed, wait, then fail the stage. */
export function buildSeedRunDockerStartCommand(): string {
  return (
    `docker info >/dev/null 2>&1 || ${buildDockerdBackgroundStart()} ` +
    `${buildDockerInfoWaitLoop(60)}; ${buildDockerSockPerms()}; ` +
    `docker info >/dev/null 2>&1 || { echo "SEEDRUN-FAILED:docker-start"; exit 1; }`
  );
}
