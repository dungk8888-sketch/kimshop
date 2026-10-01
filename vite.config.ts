import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Embed Vercel's build target so frontend and API routes select the same data.
// Local builds use the isolated test project. On Vercel, a missing target must
// fail the build instead of silently choosing the wrong database.
const deploymentEnvironment = process.env.VERCEL_ENV || (process.env.VERCEL === '1' ? '' : 'preview');
if (!['production', 'preview', 'development'].includes(deploymentEnvironment)) {
  throw new Error('VERCEL_ENV is required for a Vercel build.');
}

export default defineConfig({
  plugins: [react()],
  define: {
    __KIMSHOP_DEPLOYMENT_ENV__: JSON.stringify(deploymentEnvironment),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('@supabase/')) return 'supabase-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
        },
      },
    },
  },
});
