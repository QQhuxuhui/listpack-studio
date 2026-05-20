import Link from 'next/link';
import { Layers } from 'lucide-react';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Layers className="h-6 w-6 text-orange-500" />
            <span className="ml-2 text-xl font-semibold text-gray-900">
              ListPack Studio
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:underline"
          >
            Skip → dashboard
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
