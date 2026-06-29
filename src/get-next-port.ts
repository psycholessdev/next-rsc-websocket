export function getNextPort(defaultPort = 3000): number {
  const args = process.argv;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // next dev -p 3000
    // next start -p 3000
    if ((arg === "-p" || arg === "--port") && args[i + 1]) {
      const port = Number(args[i + 1]);
      if (Number.isInteger(port) && port > 0) {
        return port;
      }
    }

    // next dev --port=3000
    const match = arg.match(/^--port=(\d+)$/);
    if (match) return Number(match[1]);
  }

  return defaultPort;
}
