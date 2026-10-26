import type { OwnerPremade, OwnerPremadePhoto } from "./model";

/** Keep the owner's photo order; older single-image listings remain usable. */
export function getPremadePhotos(item: OwnerPremade): readonly OwnerPremadePhoto[] {
  if (item.photos?.length) return item.photos;
  const legacyId = `legacy-${item.id}`;
  return [{ id: legacyId.length <= 96 ? legacyId : "legacy-photo", src: item.image, alt: item.alt }];
}

export function getPremadeCoverPhoto(item: OwnerPremade): OwnerPremadePhoto {
  const photos = getPremadePhotos(item);
  return photos.find(photo => photo.id === item.coverPhotoId) ?? photos[0];
}
