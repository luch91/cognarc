export interface CognitiveLabelRule {
  label: string
  rule: string
  matcher: (eventName: string, props: Record<string, unknown>) => boolean
}

export const COGNITIVE_LABEL_RULES: Record<string, CognitiveLabelRule> = {
  rage_click: {
    label: 'confusion',
    rule: 'rage_click -> confusion',
    matcher: (name) => /rage.?click/i.test(name),
  },
  field_reentry: {
    label: 'working_memory_overload',
    rule: 'field_reentry_count >= 3 -> working_memory_overload',
    matcher: (name, props) =>
      /field.?reentry/i.test(name) && ((props.count as number) ?? 0) >= 3,
  },
  scroll_reversal: {
    label: 'comprehension_failure',
    rule: 'scroll_reversal -> comprehension_failure',
    matcher: (name) => /scroll.?reversal/i.test(name),
  },
  session_abandonment_post_modal: {
    label: 'trust_erosion_trigger',
    rule: 'session_abandonment after modal -> trust_erosion_trigger',
    matcher: (name, props) =>
      /session.?abandon/i.test(name) && props.context === 'post_modal',
  },
  dwell_no_scroll: {
    label: 'cognitive_load_stall',
    rule: 'dwell > 30s with no scroll -> cognitive_load_stall',
    matcher: (name, props) =>
      /dwell/i.test(name) && ((props.dwell_seconds as number) ?? 0) > 30
      && !props.scrolled,
  },
  high_velocity_no_click: {
    label: 'low_attention_engagement',
    rule: 'high scroll velocity + zero clicks -> low_attention_engagement',
    matcher: (name, props) =>
      /scroll.?velocity/i.test(name) && ((props.clicks as number) ?? 0) === 0,
  },
}

export function deriveCognitiveLabel(
  eventName: string,
  properties: Record<string, unknown>,
): { label: string | null; rule: string | null } {
  for (const entry of Object.values(COGNITIVE_LABEL_RULES)) {
    if (entry.matcher(eventName, properties)) {
      return { label: entry.label, rule: entry.rule }
    }
  }
  return { label: null, rule: null }
}
