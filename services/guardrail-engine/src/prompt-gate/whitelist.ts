import type { WhitelistEntry } from './types.js'

// Whitelist is loaded from config at startup; never mutated at runtime.
// Human modifies .cognarc.yml → service restarts → whitelist reloads.
// The agent cannot add to this list. That invariant is structural: there is
// no write path in this module.

export class WhitelistManager {
  private readonly entries: WhitelistEntry[]

  constructor(entries: WhitelistEntry[] = []) {
    this.entries = entries
  }

  // Returns the matching pattern string if the prompt matches a whitelist entry, else null.
  match(prompt: string): string | null {
    for (const entry of this.entries) {
      if (this.testEntry(prompt, entry)) return entry.pattern
    }
    return null
  }

  private testEntry(prompt: string, entry: WhitelistEntry): boolean {
    switch (entry.type) {
      case 'exact':
        return prompt === entry.pattern
      case 'prefix':
        return prompt.startsWith(entry.pattern)
      case 'regex': {
        try {
          return new RegExp(entry.pattern, 'i').test(prompt)
        } catch {
          return false
        }
      }
    }
  }

  get size(): number {
    return this.entries.length
  }
}
