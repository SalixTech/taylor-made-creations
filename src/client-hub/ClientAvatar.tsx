"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated object URL. */
import { useEffect, useState } from "react";
import type { ClientHubClient } from "./model";
import { loadHubAvatarBlob } from "./workspace-client";
import { SpadeMark } from "./SpadeMark";
import styles from "./ClientAvatar.module.css";

export function ClientAvatar({ client, owner, className = "" }: { client: ClientHubClient; owner: boolean; className?: string }) {
  const [image, setImage] = useState<{ key: string; url: string } | null>(null), key = `${client.clientId}:${client.avatarVersion ?? 0}`;
  // Avatar reads depend only on immutable identity/version, not live nickname records.
  useEffect(() => {
    if (!client.avatarVersion) return;
    let active = true, objectUrl = ""; const request = new AbortController();
    void loadHubAvatarBlob(client, owner, request.signal).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setImage({ key, url: objectUrl }); } }).catch(() => { /* The safe brand fallback remains, without surfacing private image paths. */ });
    return () => { active = false; request.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.clientId, client.avatarVersion, owner, key]);
  return <span className={`${styles.avatar} ${className}`} aria-hidden="true">{image?.key === key ? <img src={image.url} alt="" /> : <SpadeMark />}</span>;
}
