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

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-4 md:py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-6 md:mb-8">
          <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 flex-wrap">
            <Camera className="w-8 md:w-10 h-8 md:h-10 text-blue-600 flex-shrink-0" />
            <h1 className="text-2xl md:text-4xl font-bold text-gray-800">
              Определение угла сгиба конечности
            </h1>
          </div>
          <p className="text-gray-600 text-sm md:text-lg">
            Встаньте перед камерой так, чтобы была видна выбранная конечность
          </p>
        </header>

        <div className={isMobile ? "space-y-6" : "grid lg:grid-cols-3 gap-6"}>
          <div className={isMobile ? "" : "lg:col-span-2"}>
            <div className="bg-white rounded-lg shadow-xl p-4 md:p-6">
              <PoseDetector
                selectedLimb={selectedLimb}
                onAngleUpdate={setCurrentAngle}
              />
            </div>
          </div>

          <div className={isMobile ? "space-y-4" : "space-y-6"}>
            <LimbSelector
              selectedLimb={selectedLimb}
              onLimbChange={setSelectedLimb}
            />
            <AngleDisplay angle={currentAngle} />
            <DataControls currentAngle={currentAngle} selectedLimb={selectedLimb} />
          </div>
        </div>

        <div className="mt-6 md:mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 md:p-6">
          <h3 className="font-semibold text-blue-900 mb-2 text-sm md:text-base">Как пользоваться:</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-xs md:text-sm">
            <li>Разрешите доступ к камере</li>
            <li>Выберите конечность, которую хотите отслеживать</li>
            <li>Встаньте так, чтобы конечность была полностью видна (для ног встаньте так, чтобы было видно тело полностью)</li>
            <li>Начните сгибать конечность и наблюдайте за изменением угла</li>
          </ol>
          <p className="mt-3 text-xs md:text-sm text-blue-700">
            <strong>Примечание:</strong> Желтые точки и линии показывают отслеживаемые суставы.
            Угол измеряется между тремя ключевыми точками конечности.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
