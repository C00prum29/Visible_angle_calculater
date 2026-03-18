import { useState } from 'react';
import { PoseDetector } from './components/PoseDetector';
import { LimbSelector } from './components/LimbSelector';
import { AngleDisplay } from './components/AngleDisplay';
import { LimbType } from './types';
import { Camera } from 'lucide-react';

function App() {
  const [selectedLimb, setSelectedLimb] = useState<LimbType>('right_arm');
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Camera className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-800">
              Определение угла сгиба конечности
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Встаньте перед камерой так, чтобы была видна выбранная конечность
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-xl p-6">
              <PoseDetector
                selectedLimb={selectedLimb}
                onAngleUpdate={setCurrentAngle}
              />
            </div>
          </div>

          <div className="space-y-6">
            <LimbSelector
              selectedLimb={selectedLimb}
              onLimbChange={setSelectedLimb}
            />
            <AngleDisplay angle={currentAngle} />
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Как пользоваться:</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Разрешите доступ к камере</li>
            <li>Выберите конечность, которую хотите отслеживать</li>
            <li>Встаньте так, чтобы конечность была полностью видна</li>
            <li>Начните сгибать конечность и наблюдайте за изменением угла</li>
          </ol>
          <p className="mt-3 text-sm text-blue-700">
            <strong>Примечание:</strong> Желтые точки и линии показывают отслеживаемые суставы.
            Угол измеряется между тремя ключевыми точками конечности.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
