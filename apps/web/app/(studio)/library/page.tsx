import { LibraryGrid } from './_components/LibraryGrid';
import { listModels } from '@/lib/studio/models';

export default function LibraryPage() {
  // listModels() is pure data, safe to call from a server component
  const models = listModels();
  return <LibraryGrid models={models} />;
}
