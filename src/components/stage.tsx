import { Badge, type Tone } from "@/components/ui";
import { STAGE_LABEL, type Stage } from "@/lib/requisition/stages";

const tone: Record<Stage, Tone> = { SUBMITTED: "cyan", SHORTLISTED: "violet", INTERVIEW_SCHEDULED: "pink", OFFERED: "lime", JOINED: "mint", REJECTED: "rose" };

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={tone[stage]}>{STAGE_LABEL[stage]}</Badge>;
}
