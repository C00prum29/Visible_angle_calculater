import { Activity } from 'lucide-react';

interface AngleDisplayProps {
  angle: number | null;
}

export function AngleDisplay({ angle }: AngleDisplayProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
      <div className="flex items-center gap-2 md:gap-3 mb-4">
        <Activity className="w-5 md:w-6 h-5 md:h-6 text-green-600 flex-shrink-0" />
        <h2 className="text-lg md:text-xl font-semibold text-gray-800">Угол сгиба</h2>
      </div>
      <div className="text-center">
        {angle !== null ? (
          <>
            <div className="text-4xl md:text-6xl font-bold text-blue-600 mb-2">
              {angle}°
            </div>
            <div className="text-xs md:text-sm text-gray-500">
              {angle < 30 && 'Почти прямая'}
              {angle >= 30 && angle < 90 && 'Небольшой сгиб'}
              {angle >= 90 && angle < 135 && 'Средний сгиб'}
              {angle >= 135 && 'Сильный сгиб'}
            </div>
          </>
        ) : (
          <div className="text-lg md:text-2xl text-gray-400">Ожидание данных...</div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-xs md:text-sm text-gray-600">
          <span>0°</span>
          <span>90°</span>
          <span>180°</span>
        </div>
        <div className="relative h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
          {angle !== null && (
            <div
              className="absolute h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(angle / 180 * 100, 100)}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
