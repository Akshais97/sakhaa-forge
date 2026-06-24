export function getBuildInfo(env = process.env) {
  return {
    service: "api",
    product: "Sakhaa Forge",
    apiVersion: "v0",
    apiRuntime: "nestjs-fastify",
    appEnv: env.APP_ENV || "local",
    appVersion: env.APP_VERSION || "dev"
  };
}
