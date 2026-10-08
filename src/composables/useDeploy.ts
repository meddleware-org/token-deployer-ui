import { ref } from 'vue'
import {
  DeployIncompleteError,
  DeployUnconfirmedError,
  PublishedError,
  deployToken,
  finalizeToken,
  type DeployArgs,
  type DeployStep,
  type Executor,
  type PendingFinalize,
} from '@meddleware/sui-token-client/deploy'
import type { PublishResult, TokenNetwork } from '@meddleware/sui-token-client'
import { buildDeployExecutor } from '../lib/deployExecutor.js'
import { getReadClient } from '../wallet.js'
import { extractErrorMessage } from '../lib/errors.js'

/**
 * Where a deploy stands:
 * - `failed` — nothing was published; the user may review and try again.
 * - `incomplete` — the coin is published but its setup (second signature) is not finished. The UI
 *   must offer {@link finish}, never a fresh deploy, which would publish a second coin and charge the
 *   fee again.
 * - `published` — a coin was published but the outcome could not be read; the UI shows the
 *   transaction and offers no deploy or retry.
 * - `done` — finished (`error` may still say the last step was not confirmed).
 */
export type DeployPhase = 'idle' | 'deploying' | 'failed' | 'incomplete' | 'published' | 'done'

/** The deploy flow's state machine, with the wallet executor injectable for tests. */
export function useDeploy(executorFor: (network: TokenNetwork) => Promise<Executor> = buildDeployExecutor) {
  const phase = ref<DeployPhase>('idle')
  const step = ref<DeployStep | null>(null)
  const error = ref<string | null>(null)
  const result = ref<PublishResult | null>(null)
  const pending = ref<PendingFinalize | null>(null)
  /** The publish transaction, once one executed (shown when its outcome is unclear). */
  const publishDigest = ref<string | null>(null)

  /** Route a failure: anything after the publish executed never goes back to a fresh deploy. */
  function onFailure(e: unknown): void {
    error.value = extractErrorMessage(e)
    if (e instanceof DeployUnconfirmedError) {
      result.value = e.result
      pending.value = null
      phase.value = 'done'
    } else if (e instanceof DeployIncompleteError) {
      pending.value = e.pending
      publishDigest.value = e.publishDigest
      phase.value = 'incomplete'
    } else if (e instanceof PublishedError) {
      publishDigest.value = e.publishDigest
      phase.value = 'published'
    } else if (pending.value) {
      phase.value = 'incomplete'
    } else {
      phase.value = 'failed'
    }
  }

  async function deploy(args: Omit<DeployArgs, 'executor' | 'onStep'>): Promise<void> {
    phase.value = 'deploying'
    step.value = null
    error.value = null
    try {
      result.value = await deployToken({
        ...args,
        executor: await executorFor(args.network),
        onStep: (s) => (step.value = s),
      })
      phase.value = 'done'
    } catch (e) {
      onFailure(e)
    }
  }

  /** Finish a published coin's setup: one more signature, on the network it was published to. */
  async function finish(): Promise<void> {
    const p = pending.value
    if (!p) return
    phase.value = 'deploying'
    error.value = null
    try {
      result.value = await finalizeToken({
        pending: p,
        executor: await executorFor(p.result.network),
        // So a retry after an executor error that may have landed checks the supply first.
        client: getReadClient(p.result.network),
        onStep: (s) => (step.value = s),
      })
      pending.value = null
      phase.value = 'done'
    } catch (e) {
      onFailure(e)
    }
  }

  function reset(): void {
    phase.value = 'idle'
    step.value = null
    error.value = null
    result.value = null
    pending.value = null
    publishDigest.value = null
  }

  return { phase, step, error, result, pending, publishDigest, deploy, finish, reset }
}
