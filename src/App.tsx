import { useState } from 'react';
import { PoseDetector } from './components/PoseDetector';
import { LimbSelector } from './components/LimbSelector';
import { AngleDisplay } from './components/AngleDisplay';
import { DataControls } from './components/DataControls';
import { LimbType } from './types';
import { Camera } from 'lucide-react';

function App() {
  const [selectedLimb, setSelectedLimb] = useState<LimbType>('right_arm');
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-4 px-3 sm:py-8 sm:px-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-4 sm:mb-8">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
            <Camera className="w-7 h-7 sm:w-10 sm:h-10 text-blue-600 flex-shrink-0" />
            <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold text-gray-800 leading-tight">
              Определение угла сгиба конечности
            </h1>
          </div>
          <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
            Встаньте перед камерой так, чтобы была видна выбранная конечность
          </p>
        </header>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Camera feed — full width on mobile, 2/3 on desktop */}
          <div className="lg:col-span-2 order-1">
            <div className="bg-white rounded-xl shadow-xl p-3 sm:p-6">
              <PoseDetector
                selectedLimb={selectedLimb}
                onAngleUpdate={setCurrentAngle}
              />
            </div>
          </div>

          {/* Controls — stacked below camera on mobile, sidebar on desktop */}
          <div className="order-2 lg:order-2 space-y-4 sm:space-y-6">
            {/* Angle display prominent on mobile */}
            <div className="block">
              <AngleDisplay angle={currentAngle} />
            </div>
            <LimbSelector
              selectedLimb={selectedLimb}
              onLimbChange={setSelectedLimb}
            />
            <DataControls currentAngle={currentAngle} selectedLimb={selectedLimb} />
          </div>
        </div>

        <div className="mt-4 sm:mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base">Как пользоваться:</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm sm:text-base">
            <li>Разрешите доступ к камере</li>
            <li>Выберите конечность, которую хотите отслеживать</li>
            <li>Встаньте так, чтобы конечность была полностью видна</li>
            <li>Начните сгибать конечность и наблюдайте за изменением угла</li>
          </ol>
          <p className="mt-3 text-xs sm:text-sm text-blue-700">
            <strong>Примечание:</strong> Желтые точки и линии показывают отслеживаемые суставы.
            Угол измеряется между тремя ключевыми точками конечности.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
