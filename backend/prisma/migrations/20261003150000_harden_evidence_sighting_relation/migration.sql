-- CreateIndex
CREATE UNIQUE INDEX "evidence_source_id_key" ON "evidence"("source_id");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "vehicle_sightings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
