import { Badge, type Tone } from "@/components/ui";
import { STAGE_LABEL, type Stage } from "@/lib/requisition/stages";

const tone: Record<Stage, Tone> = { SUBMITTED: "dim", SHORTLISTED: "blue", INTERVIEW_SCHEDULED: "blue", OFFERED: "blue", JOINED: "green", REJECTED: "red" };

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={tone[stage]}>{STAGE_LABEL[stage]}</Badge>;
}
