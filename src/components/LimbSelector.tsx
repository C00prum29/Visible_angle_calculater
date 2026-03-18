import { LimbType } from '../types';
import { User } from 'lucide-react';

interface LimbSelectorProps {
  selectedLimb: LimbType;
  onLimbChange: (limb: LimbType) => void;
}

const limbOptions: { value: LimbType; label: string }[] = [
  { value: 'left_arm', label: 'Левая рука' },
  { value: 'right_arm', label: 'Правая рука' },
  { value: 'left_leg', label: 'Левая нога' },
  { value: 'right_leg', label: 'Правая нога' },
];

export function LimbSelector({ selectedLimb, onLimbChange }: LimbSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <User className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-800">Выберите конечность</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {limbOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onLimbChange(option.value)}
            className={`px-4 py-3 rounded-lg font-medium transition-all ${
              selectedLimb === option.value
                ? 'bg-blue-600 text-white shadow-md scale-105'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
