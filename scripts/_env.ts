// Scripts run outside Next, which would normally load .env for us. Existing environment variables win.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file: fine, the platform provides the environment */
}
