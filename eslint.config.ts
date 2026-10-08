import { suiBoundary } from '@meddleware/eslint-config'
import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginA11y from 'eslint-plugin-vuejs-accessibility'

// Flat ESLint config: layers vue-a11y (WAI-ARIA linting for templates) on top of
// the standard Vue + TypeScript recommended rules, so accessibility regressions
// are caught in CI.
export default defineConfigWithVueTs(
  {
    name: 'token-deployer-ui/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**', '**/*.d.ts', 'docs/api/**']),

  ...pluginVue.configs['flat/essential'],
  ...pluginA11y.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'token-deployer-ui/overrides',
    rules: {
      // Accept both valid label-association patterns: a label wrapping its
      // control (nesting) or a label[for] pointing at a control[id]. UiSelect renders a native
      // <select>, so a label nesting it is labelling a control.
      'vuejs-accessibility/label-has-for': [
        'error',
        { required: { some: ['nesting', 'id'] }, controlComponents: ['UiSelect'] },
      ],
      // UiFormField renders the <label for> for the control in its default slot.
      'vuejs-accessibility/form-control-has-label': ['error', { labelComponents: ['UiFormField'] }],
      // role="list" on styled lists is a deliberate Safari/VoiceOver workaround: WebKit drops
      // list semantics when list-style is removed, so the explicit role stays.
      'vuejs-accessibility/no-redundant-roles': 'off',
      // Underscore-prefixed args/vars are an intentional "unused" marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Tests use deliberately loose typing for mocks/stubs.
    name: 'token-deployer-ui/test-overrides',
    files: ['**/*.{test,spec}.{ts,tsx}', 'tests/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // ConfigForm intentionally edits a parent-owned reactive FormModel in place
    // (the parent passes `:form` and reads the same object back). Converting to
    // defineModel is deferred; the in-place mutation is the current contract.
    name: 'token-deployer-ui/config-form',
    files: ['src/components/ConfigForm.vue'],
    rules: {
      'vue/no-mutating-props': 'off',
    },
  },

  ...suiBoundary(),
)
