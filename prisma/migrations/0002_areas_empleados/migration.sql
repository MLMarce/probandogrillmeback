-- CreateTable
CREATE TABLE "area" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_norm" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" TEXT NOT NULL,
    "legajo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "area_id" TEXT,
    "supervisor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "area_nombre_norm_key" ON "area"("nombre_norm");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_legajo_key" ON "empleados"("legajo");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_dni_key" ON "empleados"("dni");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

