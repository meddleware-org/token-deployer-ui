// html-validate over the Vue SFC templates (via html-validate-vue): checks element nesting and
// content models (e.g. no <p> inside <ul>, no button inside a label) on top of the eslint a11y gate.
export default {
  plugins: ['html-validate-vue'],
  extends: ['html-validate:recommended', 'html-validate-vue:recommended'],
  elements: [
    'html5',
    // @meddleware/ui components that render a single native element, described to the validator so
    // content models / form rules see through them (keys are lowercased tag names).
    {
      uibutton: { inherit: 'button' },
      uitoolbarbutton: { inherit: 'button' },
      uiselect: { inherit: 'select' },
      uinotice: { inherit: 'p' },
    },
  ],
  transform: {
    '^.*\\.vue$': 'html-validate-vue',
  },
  rules: {
    // Vue components are written in PascalCase (<UiStatusDot>, <KeepAlive>).
    'element-case': ['error', { style: ['lowercase', 'pascalcase'] }],
    'element-name': ['error', { pattern: '^(?:[a-z][a-z0-9\\-._]*-[a-z0-9\\-._]*|[A-Z][A-Za-z0-9]*)$' }],
    // role="list" on styled lists is a deliberate Safari/VoiceOver workaround: WebKit drops list
    // semantics when list-style is removed, so the explicit role must stay (matches the eslint
    // vuejs-accessibility/no-redundant-roles override).
    'no-redundant-role': 'off',
    'prefer-native-element': ['error', { exclude: ['list'] }],
  },
}
