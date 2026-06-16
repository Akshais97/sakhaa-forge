const dependencyNames = [
  "postgres",
  "auth",
  "redis",
  "objectStorage",
  "queueProcessor",
  "fakeWorker",
  "fakeProvider"
];

export function getHealth(env = process.env) {
  return {
    status: "ok",
    ...baseMetadata(env)
  };
}

export function getReadiness(env = process.env) {
  const forcedFailure = env.V0_LOCAL_DEPENDENCY_FAILURE || "";
  const dependencies = Object.fromEntries(
    dependencyNames.map((name) => [
      name,
      dependencyState(name, forcedFailure)
    ])
  );
  const unavailable = Object.values(dependencies).filter(
    (dependency) => dependency.status !== "available"
  );

  return {
    status: unavailable.length === 0 ? "ready" : "degraded",
    ...baseMetadata(env),
    dependencies
  };
}

function baseMetadata(env) {
  return {
    product: "Sakhaa Forge",
    apiVersion: "v0",
    appEnv: env.APP_ENV || "local",
    appVersion: env.APP_VERSION || "dev"
  };
}

function dependencyState(name, forcedFailure) {
  if (forcedFailure === name) {
    return {
      status: "unavailable",
      code: "DEPENDENCY_UNAVAILABLE"
    };
  }

  return {
    status: "available"
  };
}
