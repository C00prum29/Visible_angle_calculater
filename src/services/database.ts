import { LimbType } from '../types';

interface AngleMeasurement {
  id: string;
  limbType: LimbType;
  angle: number;
  createdAt: number;
}

const DB_NAME = 'AngleMeasurementsDB';
const STORE_NAME = 'measurements';

let db: IDBDatabase | null = null;

export async function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(new Error('Failed to open database'));
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveMeasurement(limbType: LimbType, angle: number): Promise<void> {
  if (!db) await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const measurement: AngleMeasurement = {
      id: crypto.randomUUID(),
      limbType,
      angle,
      createdAt: Date.now(),
    };

    const request = store.add(measurement);
    request.onerror = () => reject(new Error('Failed to save measurement'));
    request.onsuccess = () => resolve();
  });
}

export async function getAllMeasurements(): Promise<AngleMeasurement[]> {
  if (!db) await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(new Error('Failed to fetch measurements'));
    request.onsuccess = () => {
      const measurements = request.result as AngleMeasurement[];
      resolve(measurements.reverse());
    };
  });
}

export function exportToCSV(measurements: AngleMeasurement[]): void {
  const headers = ['ID', 'Конечность', 'Угол (градусы)', 'Время'];
  const limbTypeMap: Record<LimbType, string> = {
    left_arm: 'Левая рука',
    right_arm: 'Правая рука',
    left_leg: 'Левая нога',
    right_leg: 'Правая нога',
  };

  const rows = measurements.map((row) => [
    row.id,
    limbTypeMap[row.limbType],
    row.angle,
    new Date(row.createdAt).toLocaleString('ru-RU'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `angle_measurements_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function clearAllData(): Promise<void> {
  if (!db) await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(new Error('Failed to clear data'));
    request.onsuccess = () => resolve();
  });
}
