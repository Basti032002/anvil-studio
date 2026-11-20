import { Content } from "../../api";

/** Ungespeicherte Inhalte je Projekt – bleiben beim Wechsel zwischen Inhalte- und Localization-Tab erhalten */
const drafts = new Map<string, { content: Content; saved: string }>();

/** nur, wenn es wirklich ungespeicherte Änderungen gibt */
export const getDraft = (projectId: string) => {
  const d = drafts.get(projectId);
  return d && JSON.stringify(d.content) !== d.saved ? d : undefined;
};
export const setDraft = (projectId: string, content: Content, saved: string) => drafts.set(projectId, { content, saved });
