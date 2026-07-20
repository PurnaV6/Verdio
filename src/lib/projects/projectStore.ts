import type { PipelineResult } from '../../types/pipeline';

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  result: PipelineResult;
}

const DB_NAME = 'verdio-workspace';
const STORE_NAME = 'projects';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(result: PipelineResult, existingId?: string): Promise<string> {
  const db = await openDatabase();
  const id = existingId || crypto.randomUUID();
  const record: SavedProject = { id, name: result.source.fileName.replace(/\.[^.]+$/, ''), updatedAt: new Date().toISOString(), result };
  await requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
  db.close();
  return id;
}

export async function listProjects(): Promise<SavedProject[]> {
  const db = await openDatabase();
  const records = await requestResult(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()) as SavedProject[];
  db.close();
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  await requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id));
  db.close();
}
