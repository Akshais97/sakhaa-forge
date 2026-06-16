export function getBuildInfo(env = process.env) {
  return {
    service: "api",
    product: "Sakhaa Forge",
    apiVersion: "v0",
    appEnv: env.APP_ENV || "local",
    appVersion: env.APP_VERSION || "dev"
  };
}
