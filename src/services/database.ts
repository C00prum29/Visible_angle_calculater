import { createClient } from '@supabase/supabase-js';
import { LimbType } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function saveMeasurement(limbType: LimbType, angle: number): Promise<void> {
  const { error } = await supabase.from('angle_measurements').insert({
    limb_type: limbType,
    angle,
  });

  if (error) {
    throw new Error(`Failed to save measurement: ${error.message}`);
  }
}

export async function getAllMeasurements(): Promise<
  Array<{ id: string; limb_type: string; angle: number; created_at: string }>
> {
  const { data, error } = await supabase
    .from('angle_measurements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch measurements: ${error.message}`);
  }

  return data || [];
}

export function exportToCSV(
  data: Array<{ id: string; limb_type: string; angle: number; created_at: string }>
): void {
  const headers = ['ID', 'Конечность', 'Угол (градусы)', 'Время'];
  const limbTypeMap: Record<string, string> = {
    left_arm: 'Левая рука',
    right_arm: 'Правая рука',
    left_leg: 'Левая нога',
    right_leg: 'Правая нога',
  };

  const rows = data.map((row) => [
    row.id,
    limbTypeMap[row.limb_type] || row.limb_type,
    row.angle,
    new Date(row.created_at).toLocaleString('ru-RU'),
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
