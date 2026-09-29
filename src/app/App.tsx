import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@/data/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';
import { router } from './router';
import { NotConfigured } from './NotConfigured';

function ThemeSync() {
  useTheme(); // applies the saved preference and follows the OS in "system" mode
  return null;
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  if (!env.isConfigured) return <NotConfigured />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ThemeSync />
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
