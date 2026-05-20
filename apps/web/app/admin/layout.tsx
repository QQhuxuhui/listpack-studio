import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Layers, Shield } from 'lucide-react';
import { getAdminUser } from '@/lib/auth/admin';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="h-6 w-6 text-orange-500" />
            <span className="font-semibold text-gray-900">
              ListPack Admin
            </span>
            <span className="inline-flex items-center gap-1 text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">
              <Shield className="h-3 w-3" /> staff
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← User dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
