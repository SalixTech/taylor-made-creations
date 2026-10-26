"use client";
import type { ReactNode } from "react";
import { ColorModeToggle, useColorMode } from "@/components/ColorMode";
import styles from "./FirebaseOwnerGate.module.css";
/** Display preference only; authentication and session persistence are unchanged. */
export function OwnerGateFrame({ children }: { children: ReactNode }) {
  const mode = useColorMode("owner");
  return <div data-owner-portal data-color-mode={mode}><div className={styles.gateMode}><ColorModeToggle scope="owner" /></div>{children}</div>;
}
