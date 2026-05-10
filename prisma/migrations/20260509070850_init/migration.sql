-- CreateEnum
CREATE TYPE "RunScope" AS ENUM ('full', 'partial', 'single');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'success', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('pending', 'running', 'success', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('request_inputs', 'crop_image', 'gemini', 'response');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runNumber" INTEGER NOT NULL,
    "scope" "RunScope" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "finalResult" JSONB,
    "includedNodeIds" TEXT[],
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeExecution" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "nodeName" TEXT NOT NULL,
    "status" "NodeStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputsUsed" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "triggerDevRunId" TEXT,

    CONSTRAINT "NodeExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_clerkUserId_idx" ON "Workflow"("clerkUserId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_idx" ON "WorkflowRun"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_runNumber_idx" ON "WorkflowRun"("workflowId", "runNumber");

-- CreateIndex
CREATE INDEX "NodeExecution_runId_idx" ON "NodeExecution"("runId");

-- CreateIndex
CREATE INDEX "NodeExecution_nodeId_runId_idx" ON "NodeExecution"("nodeId", "runId");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeExecution" ADD CONSTRAINT "NodeExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
