-- Sprint Commercial Milestones: ciclo comercial PROPOSAL_SENT -> PAID a nivel proyecto.
-- Modelo evento (pagos parciales). Vínculo Project.prospectId para rollup futuro de facturación por cliente.

-- CreateEnum
CREATE TYPE "CommercialStage" AS ENUM ('PROPOSAL_SENT', 'ACCEPTED', 'KICKOFF', 'DELIVERY', 'INVOICE_SENT', 'PAID');

-- CreateTable
CREATE TABLE "ProjectCommercialMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "CommercialStage" NOT NULL,
    "title" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCommercialMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCommercialMilestone_projectId_idx" ON "ProjectCommercialMilestone"("projectId");
CREATE INDEX "ProjectCommercialMilestone_stage_idx" ON "ProjectCommercialMilestone"("stage");

-- AlterTable: vínculo Project -> Prospect
ALTER TABLE "Project" ADD COLUMN "prospectId" TEXT;

-- CreateIndex
CREATE INDEX "Project_prospectId_idx" ON "Project"("prospectId");

-- AddForeignKey
ALTER TABLE "ProjectCommercialMilestone" ADD CONSTRAINT "ProjectCommercialMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
