-- Dispatch decision point (Thai drayage): distinguish the company's own
-- fleet from subcontractors. See tms_evaluation_feedback_report.md section
-- 1.2 pillar 2 and the customer's process flowchart, stage 1.

-- AlterTable
ALTER TABLE "Carrier" ADD COLUMN     "isOwnFleet" BOOLEAN NOT NULL DEFAULT false;
