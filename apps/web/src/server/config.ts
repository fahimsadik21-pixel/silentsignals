export class ServiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceConfigurationError";
  }
}

export function requireServerEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new ServiceConfigurationError(`${name} is not configured.`);
  }

  return value;
}
