/** Fixed website namespaces. A hostname or caller-supplied path is never authorization. */
export type WebsiteWorkspace = "main" | "beta";
export function requireWebsiteWorkspace(value: unknown): WebsiteWorkspace {
  if (value !== "main" && value !== "beta") throw new Error("Choose a configured website workspace.");
  return value;
}
function relativePath(path: string): string {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..") || /[?#\u0000-\u001f]/.test(path)) throw new Error("Invalid website storage path.");
  return path;
}
export function websiteDocumentPath(scope: WebsiteWorkspace, path: string): string {
  const relative = relativePath(path), parts = relative.split("/");
  const collections = ["ownerWorkspace", "site", "ownerDraftIndex", "ownerDrafts", "ownerDraftTrash", "ownerGallery", "ownerRecoveryState", "ownerRecoveryVersions", "ownerPublicationOperations", "ownerMediaPins", "ownerFiles", "ownerFileFolders", "ownerFileOrder", "ownerFileMaintenance", "ownerAssetUploads"];
  if (!collections.includes(parts[0]) || (parts[0] === "site" && parts[1] && !["access", "published", "publishedAssets", "constructionWhimsy"].includes(parts[1]))) throw new Error("This collection is not a website workspace collection.");
  return (requireWebsiteWorkspace(scope) === "beta" ? "websiteWorkspaces/beta/" : "") + relative;
}
export function websiteStoragePath(scope: WebsiteWorkspace, path: string): string {
  const relative = relativePath(path);
  if (!["photos", "fonts", "files", "documents"].includes(relative.split("/")[0])) throw new Error("This object is not a website workspace asset.");
  return (requireWebsiteWorkspace(scope) === "beta" ? "website-workspaces/beta/" : "") + relative;
}
