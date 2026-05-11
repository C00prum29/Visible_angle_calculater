import { useState, useEffect } from 'react';
import { Download, Save } from 'lucide-react';
import { LimbType } from '../types';
import { saveMeasurement, getAllMeasurements, exportToCSV, initDatabase, clearAllData } from '../services/database';

interface DataControlsProps {
  currentAngle: number | null;
  selectedLimb: LimbType;
}

export function DataControls({ currentAngle, selectedLimb }: DataControlsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    initDatabase().catch((err) => {
      console.error('Failed to initialize database:', err);
    });

    const handleBeforeUnload = () => {
      clearAllData().catch((err) => {
        console.error('Failed to clear data on unload:', err);
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearAllData().catch((err) => {
        console.error('Failed to clear data on unmount:', err);
      });
    };
  }, []);

  const handleCapture = async () => {
    if (currentAngle === null) {
      setMessage({ type: 'error', text: 'Угол не определен' });
      return;
    }

    setIsSaving(true);
    try {
      await saveMeasurement(selectedLimb, currentAngle);
      setMessage({ type: 'success', text: `Угол ${currentAngle}° сохранен для ${getLimbLabel(selectedLimb)}` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Ошибка при сохранении',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await getAllMeasurements();
      if (data.length === 0) {
        setMessage({ type: 'error', text: 'Нет данных для экспорта' });
        return;
      }
      exportToCSV(data);
      setMessage({ type: 'success', text: `Экспортировано ${data.length} измерений` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Ошибка при экспорте',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
      <div className="space-y-2 md:space-y-3">
        <button
          onClick={handleCapture}
          disabled={isSaving || currentAngle === null}
          className="w-full flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-green-600 text-white rounded-lg font-medium text-sm md:text-base hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 md:w-5 h-4 md:h-5" />
          {isSaving ? 'Сохранение...' : 'Зафиксировать данные'}
        </button>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-blue-600 text-white rounded-lg font-medium text-sm md:text-base hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-4 md:w-5 h-4 md:h-5" />
          {isExporting ? 'Выгрузка...' : 'Выгрузить базу данных'}
        </button>
      </div>

      {message && (
        <div
          className={`mt-2 md:mt-3 p-2 md:p-3 rounded-lg text-xs md:text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function getLimbLabel(limb: LimbType): string {
  const labels: Record<LimbType, string> = {
    left_arm: 'левой руки',
    right_arm: 'правой руки',
    left_leg: 'левой ноги',
    right_leg: 'правой ноги',
  };
  return labels[limb];
}
