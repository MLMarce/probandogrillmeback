-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "autor" TEXT,
    "entidad" TEXT,
    "detalle" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

