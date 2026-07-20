import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/features/game/game-engine.ts',
        'src/features/game/client-question-engine.ts',
      ],
    },
  },
});
