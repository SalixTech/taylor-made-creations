export const BETA_HOST = "beta.taylormadecreations.dog";
export const BUILD_HOST = "build.taylormadecreations.dog";
/** Optional exact operator-configured preview hosts; never wildcard authority. */
export function websiteHostRole(host: string | null, betaPreview = "", buildPreview = ""): "beta" | "build" | null {
  const valid = (value: string) => !value || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(value);
  if (!valid(betaPreview) || !valid(buildPreview) || (betaPreview && betaPreview === buildPreview)) throw new Error("Website preview host configuration is invalid.");
  if (host === BETA_HOST || (betaPreview && host === betaPreview)) return "beta";
  if (host === BUILD_HOST || (buildPreview && host === buildPreview)) return "build";
  return null;
}
