const isBuild = process.env.NODE_ENV?.toLowerCase?.() === 'production';

// console.log('[ESLint] isBuild:', isBuild);

module.exports = {
  extends: [
    'react-app',
    'react-app/jest',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  plugins: ['unused-imports', 'simple-import-sort', 'prettier'],
  rules: {
    'react/no-children-prop': 'warn',
    'react/prop-types': 'warn',
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-explicit-any': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],

    'simple-import-sort/imports': [
      'warn',
      {
        groups: [
          ['^\\u0000'],
          ['^react', '^@?\\w'],
          ['^@/'],
          ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
          ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
          ['^.+\\.s?css$'],
        ],
      },
    ],
    'simple-import-sort/exports': 'warn',
    'prettier/prettier': 'warn',

    // 💡 Build sırasında kapatmak istediğin kurallar
    ...(isBuild && {
      'react/no-children-prop': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      'react/display-name': 'off',
      'react/jsx-key': 'off',
    }),
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
