export function calculateProspectScore(params: {
  daScore: number | null
  relevance: number
  hasContact: boolean
  nicheFit: number
  spamScore: number | null
}): number {
  const da = params.daScore ?? 0
  const daWeight = 0.3
  const relevanceWeight = 0.35
  const contactWeight = 0.15
  const nicheWeight = 0.1
  const spamWeight = 0.1

  const daScore = Math.min(da / 100, 1)
  const contactScore = params.hasContact ? 1 : 0.2
  const spamPenalty = params.spamScore != null ? Math.max(0, 1 - params.spamScore / 100) : 0.5

  const total =
    daScore * daWeight +
    (params.relevance / 100) * relevanceWeight +
    contactScore * contactWeight +
    (params.nicheFit / 100) * nicheWeight +
    spamPenalty * spamWeight

  return Math.round(total * 100)
}

export function priorityLabel(score: number): string {
  if (score >= 80) return '🔥 Hot'
  if (score >= 60) return '✅ Warm'
  if (score >= 40) return '📋 Cold'
  return '❌ Low'
}
