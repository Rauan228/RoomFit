import { useCallback, useEffect, useRef, useState } from "react";
import { documentSchema, type ProjectDocument } from "@roomfit/core";
import { request, ApiError, type Project } from "./api";
import { track } from "../../shared/analytics";
export function useProject(project: Project, userId: string, readOnly = false) {
  const [doc, setDoc] = useState(project.document),
    [status, setStatus] = useState("Сохранено"),
    [revision, setRevision] = useState(0),
    [dragging, setDragging] = useState(false);
  const current = useRef(doc),
    version = useRef(project.version),
    saved = useRef(JSON.stringify(project.document)),
    sending = useRef(false),
    retries = useRef(0),
    mounted = useRef(true);
  const past = useRef<ProjectDocument[]>([]),
    future = useRef<ProjectDocument[]>([]),
    transaction = useRef<ProjectDocument | null>(null);
  const key = `roomfit:recovery:${userId}:${project.id}`,
    [recovery, setRecovery] = useState<ProjectDocument | null>(null);
  useEffect(() => {
    mounted.current = true;
    if (!readOnly)
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const local = documentSchema.parse(JSON.parse(raw).document);
          if (JSON.stringify(local) !== saved.current) setRecovery(local);
        }
      } catch {
        /* Invalid local backups never replace the server document. */
      }
    return () => {
      mounted.current = false;
    };
  }, [key, readOnly]);
  const change = useCallback(
    (update: (doc: ProjectDocument) => void, transient = false) => {
      if (readOnly) return;
      const before = current.current,
        next = structuredClone(before);
      update(next);
      if (JSON.stringify(before) === JSON.stringify(next)) return;
      if (!transient && !transaction.current) {
        past.current = [...past.current.slice(-99), before];
        future.current = [];
      }
      current.current = next;
      setDoc(next);
      setStatus("Есть изменения");
      setRevision((n) => n + 1);
    },
    [readOnly],
  );
  const begin = useCallback(() => {
    if (readOnly) return;
    transaction.current = current.current;
    setDragging(true);
  }, [readOnly]);
  const commit = useCallback(() => {
    if (
      transaction.current &&
      JSON.stringify(transaction.current) !== JSON.stringify(current.current)
    ) {
      past.current = [...past.current.slice(-99), transaction.current];
      future.current = [];
    }
    transaction.current = null;
    setDragging(false);
    setRevision((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    if (readOnly || !past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(current.current);
    current.current = prev;
    setDoc(prev);
    setRevision((n) => n + 1);
    setStatus("Есть изменения");
  }, [readOnly]);
  const redo = useCallback(() => {
    if (readOnly || !future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(current.current);
    current.current = next;
    setDoc(next);
    setRevision((n) => n + 1);
    setStatus("Есть изменения");
  }, [readOnly]);
  const save = useCallback(async () => {
    if (readOnly || sending.current || transaction.current) return;
    const snapshot = current.current,
      encoded = JSON.stringify(snapshot);
    if (encoded === saved.current) {
      setStatus("Сохранено");
      return;
    }
    sending.current = true;
    setStatus("Сохраняется…");
    try {
      const result = await request<Project>(`/projects/${project.id}`, "PUT", {
        version: version.current,
        document: snapshot,
      });
      version.current = result.version;
      saved.current = encoded;
      const analyticsKey = `roomfit:saved-event:${project.id}`;
      try {
        if (!sessionStorage.getItem(analyticsKey)) {
          track("project_saved", "platform");
          sessionStorage.setItem(analyticsKey, "1");
        }
      } catch {
        /* Statistics never affect saving a project. */
      }
      retries.current = 0;
      if (JSON.stringify(current.current) === encoded) {
        localStorage.removeItem(key);
        if (mounted.current) setStatus("Сохранено");
      } else if (mounted.current) {
        setStatus("Есть изменения");
        setRevision((n) => n + 1);
      }
    } catch (err) {
      if (mounted.current) {
        if (err instanceof ApiError && err.status === 409)
          setStatus("Конфликт версий");
        else {
          setStatus(`Ошибка сохранения: ${(err as Error).message}`);
          if (++retries.current <= 3)
            setTimeout(() => {
              if (mounted.current) setRevision((n) => n + 1);
            }, 5000);
        }
      }
    } finally {
      sending.current = false;
    }
  }, [key, project.id, readOnly]);
  useEffect(() => {
    if (readOnly || JSON.stringify(doc) === saved.current) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          document: doc,
          version: version.current,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      setStatus("Локальная копия не помещается. Скачай JSON перед выходом.");
    }
    if (dragging || status === "Конфликт версий") return;
    const timer = setTimeout(() => void save(), 1600);
    return () => clearTimeout(timer);
  }, [doc, revision, dragging, key, save, readOnly]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (!readOnly && JSON.stringify(current.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [readOnly]);
  const applyRecovery = () => {
    if (recovery) change((d) => Object.assign(d, recovery));
    setRecovery(null);
  };
  return {
    doc,
    change,
    begin,
    commit,
    undo,
    redo,
    save,
    status,
    recovery,
    applyRecovery,
    dismissRecovery: () => {
      setRecovery(null);
      localStorage.removeItem(key);
    },
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
