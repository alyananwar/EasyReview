import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["__tests__/**/*.test.ts"],
    env: {
      // Satisfy module-level startup checks in lib/batch.ts
      REVIEW_LINK: "https://maps.app.goo.gl/test-review-link",
      BUSINESS_NAME: "Test Shop",
      COOKIE_SECRET: "test-secret-abcdef1234567890abcdef12345678",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
