import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { listPrograms } from "@/server/queries";
import { StudentWizard } from "@/components/forms/student-wizard";
import { PageHeader } from "@/components/ui/page";

export default async function NewStudentPage() {
  await requireUser(["admin", "accountant"]);
  const programs = await listPrograms(getDb());
  return (
    <>
      <PageHeader eyebrow="Registry" title="Register student" />
      <StudentWizard programs={programs} />
    </>
  );
}
