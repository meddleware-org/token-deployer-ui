// Autoprefixer runs over the library's shipped CSS (base.css) during `vite build`,
// using the `browserslist` field in package.json as the target. Consumers therefore
// receive vendor-prefixed component CSS without needing their own prefixing step.
import autoprefixer from 'autoprefixer'

export default {
  plugins: [autoprefixer()],
}
