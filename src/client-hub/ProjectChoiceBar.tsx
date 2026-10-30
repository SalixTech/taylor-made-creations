"use client";
import type { ReactNode } from "react";
import type { ClientHubProject } from "./model";
import { PresentedStatus } from "./LabelPresentationContext";
import { SpadeMark } from "./SpadeMark";
import styles from "./ProjectChoiceBar.module.css";

/** A wrapping card grid preserves newest-first order without a horizontal scrollbar. */
export function ProjectChoiceBar({ projects, selectedId, disabled, onSelect, controls, renderAction }: { projects: ClientHubProject[]; selectedId: string; disabled?: boolean; onSelect: (id: string) => void; controls?: string; renderAction?: (project:ClientHubProject)=>ReactNode }) {
  const ordered = [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.projectId.localeCompare(b.projectId));
  return <div className={styles.root}><ul className={styles.choices}>{ordered.map(project => <li key={project.projectId} className={renderAction ? styles.withAction : undefined}><button type="button" data-owner-button disabled={disabled} aria-pressed={selectedId === project.projectId} aria-controls={controls} onClick={() => onSelect(project.projectId)}><span className={styles.avatar} aria-hidden="true"><SpadeMark /></span><span className={styles.identity}><strong>{project.title}</strong><small><PresentedStatus status={project.status} /></small></span>{selectedId === project.projectId && <span className={styles.selected} aria-label="Selected commission" />}</button>{renderAction && <div className={styles.cardAction}>{renderAction(project)}</div>}</li>)}</ul></div>;
}
