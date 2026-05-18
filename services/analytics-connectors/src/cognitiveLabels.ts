// Mirror of SDK COGNITIVE_LABELS — event type → cognitive label mapping
export const COGNITIVE_LABELS: Readonly<Record<string, string>> = {
  rage_click: 'confusion',
  field_reentry_count: 'working_memory_overload',
  scroll_reversal: 'comprehension_failure',
  session_abandonment_post_modal: 'trust_erosion_trigger',
}
