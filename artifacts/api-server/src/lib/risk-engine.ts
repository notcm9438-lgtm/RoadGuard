const hazardWeights: Record<string, number> = {
  Pothole: 56,
  Waterlogging: 78,
  "Cracked Road": 64,
  "Damaged Road": 72,
  "Road Debris": 44,
  "Missing Streetlight": 48,
  "Broken Traffic Signal": 74,
  "Damaged Divider": 62,
  "Poor Road Marking": 38,
  "Open Manhole": 86,
  "Flooded Road": 88,
  "Road Collapse": 96,
  Other: 50,
};

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export function calculateRiskScore(
  hazardType: string,
  damagePercentage: number,
): number {
  const baseline = hazardWeights[hazardType] ?? hazardWeights.Other;
  return Math.max(
    0,
    Math.min(100, Math.round(damagePercentage * 0.7 + baseline * 0.3)),
  );
}

export function buildAnalysis(hazardType = "Pothole", location = "") {
  const profiles: Record<
    string,
    { damage: number; description: string; action: string }
  > = {
    Pothole: {
      damage: 35,
      description:
        "A road-surface depression may affect vehicle stability and safe lane movement.",
      action:
        "Repair the road surface and inspect the surrounding section for additional damage.",
    },
    Waterlogging: {
      damage: 65,
      description:
        "Standing water may reduce road visibility, traction, and driver control.",
      action:
        "Remove standing water and inspect drainage and the underlying road surface.",
    },
    "Cracked Road": {
      damage: 48,
      description:
        "Visible cracking suggests structural wear that can worsen under traffic and weather.",
      action:
        "Seal the cracks and schedule a structural inspection before deterioration spreads.",
    },
    "Broken Traffic Signal": {
      damage: 58,
      description:
        "A non-functioning signal can create conflicting movements at an active junction.",
      action:
        "Dispatch a traffic-signal repair crew and provide temporary traffic control.",
    },
    "Road Collapse": {
      damage: 90,
      description:
        "A collapsed road section presents an immediate risk to vehicles and pedestrians.",
      action:
        "Close the affected lane, secure the perimeter, and begin an urgent engineering assessment.",
    },
  };
  const profile = profiles[hazardType] ?? {
    damage: 42,
    description: "Road-condition damage is visible and may affect safe travel.",
    action:
      "Inspect the location, secure the affected area, and schedule the appropriate repair.",
  };
  const riskScore = calculateRiskScore(hazardType, profile.damage);

  return {
    detectedHazard: hazardType,
    damagePercentage: profile.damage,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    description: location
      ? `${profile.description} Reported near ${location}.`
      : profile.description,
    recommendedAction: profile.action,
    source: "DEVELOPMENT_ANALYSIS" as const,
  };
}