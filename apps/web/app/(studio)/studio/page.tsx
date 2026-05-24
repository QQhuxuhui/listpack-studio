import { Suspense } from 'react';
import { StudioApp } from './_components/StudioApp';

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          加载中…
        </div>
      }
    >
      <StudioApp />
    </Suspense>
  );
}
