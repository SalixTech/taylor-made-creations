import { CLOUD_GALLERY_FOLDER_ID, CLOUD_COMMISSIONS_FOLDER_ID, CLOUD_PHOTO_SOURCE, folderAncestors, isFolderTrashed, type CloudFile, type CloudFolders } from "./cloud-files-model";
import type { PrivateGallery } from "./private-gallery";
/** Owner-only virtual links. Never copies, relocates, publishes, or invents asset records. */
export function galleryLinkedFileIds(gallery: PrivateGallery | null, files: CloudFile[], folders: CloudFolders): Set<string> {
  const referenced = new Set((gallery?.items ?? []).flatMap(item => item.src.match(CLOUD_PHOTO_SOURCE)?.[1] ?? []));
  const ids = new Set<string>();
  for (const file of files) {
    if (!referenced.has(file.id) || file.parentId === CLOUD_GALLERY_FOLDER_ID || file.kind !== "photo" || file.status !== "ready" || file.trashedAt) continue;
    try { if (isFolderTrashed(folders, file.parentId) || folderAncestors(folders, file.parentId).includes(CLOUD_COMMISSIONS_FOLDER_ID)) continue; } catch { continue; }
    ids.add(file.id);
  }
  return ids;
}
