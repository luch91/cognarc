import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/cognarc-sdk.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/cognarc-sdk.cjs',
      format: 'cjs',
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    terser({
      compress: {
        passes: 2,
        drop_console: true,
      },
      mangle: { properties: false },
      format: { comments: false },
    }),
  ],
  // No external deps — zero runtime dependencies is part of the <8KB contract
  external: [],
}
