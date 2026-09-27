// Stylelint over the library's CSS and the <style> blocks of its SFCs.
// postcss-html provides the custom syntax needed to lint Vue single-file components.
export default {
  extends: ['stylelint-config-standard'],
  overrides: [{ files: ['**/*.vue'], customSyntax: 'postcss-html' }],
  rules: {
    // The design system leans heavily on custom properties and deliberate
    // ordering; these standard rules are too noisy for a token-driven codebase.
    'custom-property-empty-line-before': null,
    'declaration-empty-line-before': null,
    'comment-empty-line-before': null,
    'rule-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'no-descending-specificity': null,
    // BEM-style class names (block__element--modifier) are intentional.
    'selector-class-pattern': null,
    // Some presentational SFCs use compact single-line multi-declaration rules.
    'declaration-block-single-line-max-declarations': null,
    // Preserve camelCase CSS keyword values (e.g. text-rendering: optimizeLegibility).
    'value-keyword-case': null,
    // Vue SFC scoped-style pseudo-classes.
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['deep', 'slotted', 'global'] },
    ],
    // Private panel vars use a leading-underscore convention (--_bg, --_text).
    'custom-property-pattern': null,
    // Vendor-prefixed properties are emitted by autoprefixer at build time; the
    // hand-written -webkit-/-moz- font-smoothing pair is intentional.
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
  },
}
