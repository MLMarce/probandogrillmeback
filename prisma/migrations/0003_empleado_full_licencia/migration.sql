-- AlterTable
ALTER TABLE "empleados" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fecha_ingreso" TIMESTAMP(3),
ADD COLUMN     "fecha_nacimiento" TIMESTAMP(3),
ADD COLUMN     "puesto" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "licencia" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licencia_empleado_id_idx" ON "licencia"("empleado_id");

-- AddForeignKey
ALTER TABLE "licencia" ADD CONSTRAINT "licencia_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

